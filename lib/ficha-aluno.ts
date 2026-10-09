// Cálculo da ficha 360° do aluno (etapa 1: somente leitura).
//
// Módulo puro, sem 'use server' e sem Supabase: recebe as linhas já lidas do
// banco e devolve tudo que a tela mostra. Assim a regra pode ser testada com
// números conhecidos e usada tanto pelo servidor quanto, no futuro, pelo portal
// do aluno.
//
// Conceitos que NÃO se misturam aqui (como pede o módulo): aula REALIZADA é
// uma coisa, aula PAGA é outra. O financeiro vem só da tabela `payment`.

import { mapDbLessonToUI } from '@/lib/lesson-mapper';
import { isOverdueCancelNote, isOverduePayment, normalizeStudentName } from '@/lib/lesson-cancel-reasons';

type Linha = Record<string, any>;

export type FichaAula = {
  id: string;
  date: string;          // YYYY-MM-DD
  startTime: string;
  endTime: string;
  status: string;
  instrument: string;
  price: number | null;
  nota: string;          // texto livre do professor (campo obs da aula)
  motivo: string | null; // só o que dá para afirmar com segurança (inadimplência)
};

export type FichaFatura = {
  id: string;
  amount: number;
  duedate: string;
  paymentdate: string | null;
  status: string;
  method: string;
  notes: string;
  atrasada: boolean;
  alunoAvisouEm: string | null;
};

export type FichaReposicao = {
  id: string;
  origemData: string | null;   // data da aula cancelada que gerou o crédito
  geradoEm: string | null;
  validade: string;
  situacao: 'disponivel' | 'usada' | 'expirada';
  usadoEm: string | null;
  tipo: 'reposicao' | 'pacote';
};

export type FichaAlerta = { nivel: 'aviso' | 'info' | 'perigo'; texto: string };

export type FichaAluno = {
  aluno: {
    id: string; name: string; email: string; phone: string; instrument: string;
    packagetype: string; expirationdate: string | null; status: string;
    lessonPrice: number; totalLessons: number; usedLessons: number; notes: string;
    avatarUrl: string | null; desde: string | null;
  };
  resumo: {
    realizadas: number; futuras: number; canceladas: number; remarcadas: number;
    reposicoesLivres: number; creditosPacoteLivres: number;
    restantesPacote: number | null;
    proximaAula: { date: string; startTime: string } | null;
    ultimaAula: { date: string; startTime: string } | null;
  };
  financeiro: {
    emAbertoQtd: number; emAbertoValor: number;
    vencidasQtd: number; vencidasValor: number;
    proximoVencimento: { date: string; amount: number } | null;
    ultimoPagamento: { date: string; amount: number } | null;
    pagasQtd: number; pagasValor: number;
    situacao: 'em_dia' | 'a_vencer' | 'atrasado' | 'sem_cobranca';
  };
  aulas: FichaAula[];
  faturas: FichaFatura[];
  reposicoes: FichaReposicao[];
  alertas: FichaAlerta[];
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const diasEntre = (deIso: string, ateIso: string): number => {
  const [y1, m1, d1] = deIso.split('-').map(Number);
  const [y2, m2, d2] = ateIso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

const dataDoTimestamp = (iso?: string | null): string | null => (iso ? iso.slice(0, 10) : null);

/**
 * Seleciona as aulas do aluno: as ligadas por `student_fk` e as antigas, que só
 * têm o nome (comparação normalizada, a mesma do resto do sistema). Aulas de
 * OUTRO aluno com `student_fk` próprio nunca entram, mesmo com nome igual.
 */
export function aulasDoAluno(aluno: Linha, linhas: Linha[]): Linha[] {
  const nome = normalizeStudentName(aluno.name);
  return linhas.filter(l => {
    if (l.student_fk) return l.student_fk === aluno.idstudent;
    return normalizeStudentName(l.studentname) === nome;
  });
}

export function montarFicha(params: {
  aluno: Linha;
  aulasBrutas: Linha[];   // já filtradas por aulasDoAluno
  faturasBrutas: Linha[];
  creditosBrutos: Linha[];
  hojeIso: string;        // YYYY-MM-DD no fuso de São Paulo
  agoraMin: number;       // minutos desde meia-noite, fuso de São Paulo
}): FichaAluno {
  const { aluno, aulasBrutas, faturasBrutas, creditosBrutos, hojeIso, agoraMin } = params;

  // ---- Aulas ---------------------------------------------------------------
  const aulas: FichaAula[] = aulasBrutas
    .map(l => {
      const ui = mapDbLessonToUI(l);
      const nota = ui.notes ?? '';
      return {
        id: ui.id,
        date: ui.date,
        startTime: ui.startTime,
        endTime: ui.endTime,
        status: ui.status as string,
        instrument: (l.instrument as string) || '',
        price: l.lessonprice == null ? null : num(l.lessonprice),
        nota,
        motivo: isOverdueCancelNote(nota) ? 'Cancelada por inadimplência' : null,
      };
    })
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

  const toMin = (t: string) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const jaPassou = (a: FichaAula) =>
    a.date < hojeIso || (a.date === hojeIso && toMin(a.startTime) <= agoraMin);

  const realizadas = aulas.filter(a => a.status === 'realizada');
  const futuras = aulas
    .filter(a => (a.status === 'agendada' || a.status === 'aguardando_pagamento') && !jaPassou(a))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const canceladas = aulas.filter(a => a.status === 'cancelada');
  const remarcadas = aulas.filter(a => a.status === 'remarcada');

  // ---- Reposições e créditos -----------------------------------------------
  const aulaPorId = new Map(aulas.map(a => [a.id, a]));
  const reposicoes: FichaReposicao[] = creditosBrutos
    .map(c => {
      const usado = !!c.used;
      const situacao: FichaReposicao['situacao'] = usado ? 'usada' : (c.expires_at < hojeIso ? 'expirada' : 'disponivel');
      return {
        id: c.id as string,
        origemData: c.origin_lesson_fk ? (aulaPorId.get(c.origin_lesson_fk)?.date ?? null) : null,
        geradoEm: dataDoTimestamp(c.created_at),
        validade: c.expires_at as string,
        situacao,
        usadoEm: dataDoTimestamp(c.used_at),
        tipo: (c.origin_lesson_fk ? 'reposicao' : 'pacote') as FichaReposicao['tipo'],
      };
    })
    .sort((a, b) => (b.geradoEm ?? '').localeCompare(a.geradoEm ?? ''));

  const reposicoesLivres = reposicoes.filter(r => r.tipo === 'reposicao' && r.situacao === 'disponivel').length;
  const creditosPacoteLivres = reposicoes.filter(r => r.tipo === 'pacote' && r.situacao === 'disponivel').length;

  // ---- Financeiro (somente leitura da tabela oficial) ----------------------
  const faturas: FichaFatura[] = faturasBrutas
    .map(p => ({
      id: p.id as string,
      amount: num(p.amount),
      duedate: p.duedate as string,
      paymentdate: (p.paymentdate as string) || null,
      status: p.status as string,
      method: (p.method as string) || '',
      notes: (p.notes as string) || '',
      atrasada: isOverduePayment(p, hojeIso),
      alunoAvisouEm: (p.aluno_avisou_em as string) || null,
    }))
    .sort((a, b) => b.duedate.localeCompare(a.duedate));

  const abertas = faturas.filter(f => f.status === 'pendente' || f.status === 'vencido');
  const vencidas = abertas.filter(f => f.atrasada);
  const pagas = faturas.filter(f => f.status === 'pago');
  const proxima = [...abertas].sort((a, b) => a.duedate.localeCompare(b.duedate))[0] ?? null;
  const ultimaPaga = [...pagas].sort((a, b) => (b.paymentdate ?? b.duedate).localeCompare(a.paymentdate ?? a.duedate))[0] ?? null;

  const situacao: FichaAluno['financeiro']['situacao'] =
    vencidas.length > 0 ? 'atrasado' : abertas.length > 0 ? 'a_vencer' : pagas.length > 0 ? 'em_dia' : 'sem_cobranca';

  // ---- Alertas -------------------------------------------------------------
  const alertas: FichaAlerta[] = [];
  const ativo = (aluno.status ?? 'ativo') === 'ativo';

  if (vencidas.length > 0) {
    const total = vencidas.reduce((s, f) => s + f.amount, 0);
    alertas.push({ nivel: 'perigo', texto: `${vencidas.length} ${vencidas.length === 1 ? 'fatura vencida' : 'faturas vencidas'}, somando R$ ${total.toFixed(2).replace('.', ',')}.` });
  }
  if (proxima && !proxima.atrasada) {
    const d = diasEntre(hojeIso, proxima.duedate);
    if (d >= 0 && d <= 7) alertas.push({ nivel: 'aviso', texto: d === 0 ? 'Uma fatura vence hoje.' : `Uma fatura vence em ${d} ${d === 1 ? 'dia' : 'dias'}.` });
  }
  for (const r of reposicoes) {
    if (r.tipo !== 'reposicao' || r.situacao !== 'disponivel') continue;
    const d = diasEntre(hojeIso, r.validade);
    if (d <= 14) alertas.push({ nivel: 'aviso', texto: d === 0 ? 'Uma reposição vence hoje.' : `Uma reposição vence em ${d} ${d === 1 ? 'dia' : 'dias'}.` });
  }
  // Cancelamentos recorrentes: os 45 dias mais recentes, sem contar os feitos
  // pelo sistema por inadimplência (esses não dizem nada sobre o aluno faltar).
  const recentes = canceladas.filter(a => !a.motivo && a.date && diasEntre(a.date, hojeIso) >= 0 && diasEntre(a.date, hojeIso) <= 45);
  if (recentes.length >= 3) alertas.push({ nivel: 'aviso', texto: `${recentes.length} aulas canceladas nos últimos 45 dias.` });
  const ultima = realizadas.find(a => a.date <= hojeIso) ?? null;
  if (ativo && futuras.length === 0) alertas.push({ nivel: 'info', texto: 'Nenhuma aula futura agendada.' });
  if (ativo && ultima && diasEntre(ultima.date, hojeIso) > 30) alertas.push({ nivel: 'info', texto: `Última aula realizada há ${diasEntre(ultima.date, hojeIso)} dias.` });

  const totalLessons = num(aluno.totallessons);
  const usedLessons = num(aluno.usedlessons);
  const datasAulas = aulas.map(a => a.date).filter(Boolean).sort();

  return {
    aluno: {
      id: aluno.idstudent,
      name: aluno.name || '',
      email: aluno.email || '',
      phone: aluno.phone || '',
      instrument: aluno.instrument || '',
      packagetype: aluno.packagetype || 'avulsa',
      expirationdate: aluno.expirationdate || null,
      status: aluno.status || 'ativo',
      lessonPrice: num(aluno.lessonprice),
      totalLessons,
      usedLessons,
      notes: aluno.notes || '',
      avatarUrl: aluno.avatar_url || null,
      desde: datasAulas[0] ?? null,
    },
    resumo: {
      realizadas: realizadas.length,
      futuras: futuras.length,
      canceladas: canceladas.length,
      remarcadas: remarcadas.length,
      reposicoesLivres,
      creditosPacoteLivres,
      restantesPacote: totalLessons > 0 ? Math.max(totalLessons - usedLessons, 0) : null,
      proximaAula: futuras[0] ? { date: futuras[0].date, startTime: futuras[0].startTime } : null,
      ultimaAula: ultima ? { date: ultima.date, startTime: ultima.startTime } : null,
    },
    financeiro: {
      emAbertoQtd: abertas.length,
      emAbertoValor: abertas.reduce((s, f) => s + f.amount, 0),
      vencidasQtd: vencidas.length,
      vencidasValor: vencidas.reduce((s, f) => s + f.amount, 0),
      proximoVencimento: proxima ? { date: proxima.duedate, amount: proxima.amount } : null,
      ultimoPagamento: ultimaPaga ? { date: ultimaPaga.paymentdate ?? ultimaPaga.duedate, amount: ultimaPaga.amount } : null,
      pagasQtd: pagas.length,
      pagasValor: pagas.reduce((s, f) => s + f.amount, 0),
      situacao,
    },
    aulas,
    faturas,
    reposicoes,
    alertas,
  };
}
