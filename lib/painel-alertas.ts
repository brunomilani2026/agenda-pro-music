// Painel de alertas do professor: junta, para todos os alunos ATIVOS, os alertas da ficha
// (financeiro, reposição, aulas) com os do diário e das tarefas.
//
// Módulo puro (sem Supabase): recebe as linhas já lidas e devolve a lista pronta para a tela.
// Aluno inativo nunca aparece (regra do sistema: fora de tudo que é automático ou de acompanhamento).

import { aulasDoAluno, montarFicha } from '@/lib/ficha-aluno';
import { statusDaTarefa } from '@/lib/tarefas';

type Linha = Record<string, any>;

export type CategoriaAlerta = 'financeiro' | 'reposicao' | 'aulas' | 'diario' | 'tarefas';
export type NivelAlerta = 'perigo' | 'aviso' | 'info';
export type AlertaPainel = { alunoId: string; aluno: string; categoria: CategoriaAlerta; nivel: NivelAlerta; texto: string };

export const DIAS_SEM_REGISTRO = 2;      // aula realizada há mais de 2 dias sem registro no diário
export const JANELA_DIARIO_DIAS = 30;    // só olha as aulas dos últimos 30 dias
export const DIARIO_DESDE = '2026-10-13'; // data de lançamento do diário: aulas anteriores não geram pendência

const PESO: Record<NivelAlerta, number> = { perigo: 0, aviso: 1, info: 2 };

const diasEntre = (deIso: string, ateIso: string): number => {
  const [y1, m1, d1] = deIso.split('-').map(Number);
  const [y2, m2, d2] = ateIso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

export function montarAlertas(p: {
  alunos: Linha[];
  aulas: Linha[];
  faturas: Linha[];
  creditos: Linha[];
  registros: { idlesson_fk: string }[];
  tarefas: { id: string; idstudent_fk: string; title: string; status: string; due_date: string | null }[];
  entregas: { task_fk: string; created_at: string; feedback_at: string | null }[];
  hojeIso: string;
  agoraMin: number;
  diarioDesde?: string;
}): AlertaPainel[] {
  const { hojeIso, agoraMin } = p;
  const diarioDesde = p.diarioDesde ?? DIARIO_DESDE;
  let alunosSemDiario = 0;
  const comRegistro = new Set(p.registros.map(r => r.idlesson_fk));
  const entregasPorTarefa = new Map<string, { created_at: string; feedback_at: string | null }[]>();
  for (const e of p.entregas) {
    const l = entregasPorTarefa.get(e.task_fk) ?? [];
    l.push(e); entregasPorTarefa.set(e.task_fk, l);
  }
  const saida: AlertaPainel[] = [];

  for (const aluno of p.alunos) {
    if ((aluno.status ?? 'ativo') !== 'ativo' || aluno.is_test) continue;
    const id = aluno.idstudent as string;
    const nome = (aluno.name as string) || 'Aluno';
    const add = (categoria: CategoriaAlerta, nivel: NivelAlerta, texto: string) => saida.push({ alunoId: id, aluno: nome, categoria, nivel, texto });

    const aulasDele = aulasDoAluno(aluno, p.aulas);
    const ficha = montarFicha({
      aluno,
      aulasBrutas: aulasDele,
      faturasBrutas: p.faturas.filter(f => f.idstudent_fk === id),
      creditosBrutos: p.creditos.filter(c => c.idstudent_fk === id),
      hojeIso, agoraMin,
    });
    for (const a of ficha.alertas) add(a.categoria, a.nivel, a.texto);

    // Diário: aulas realizadas recentemente que ainda não têm registro.
    const semRegistro = ficha.aulas.filter(a =>
      a.status === 'realizada' && !comRegistro.has(a.id) && a.date >= diarioDesde &&
      diasEntre(a.date, hojeIso) > DIAS_SEM_REGISTRO && diasEntre(a.date, hojeIso) <= JANELA_DIARIO_DIAS);
    if (semRegistro.length > 0) alunosSemDiario++;

    // Tarefas: entregas aguardando retorno e tarefas atrasadas.
    let aguardando = 0, atrasadas = 0;
    for (const t of p.tarefas) {
      if (t.idstudent_fk !== id) continue;
      const st = statusDaTarefa(t, entregasPorTarefa.get(t.id) ?? [], hojeIso);
      if (st === 'entregue') aguardando++;
      else if (st === 'atrasada') atrasadas++;
    }
    if (aguardando > 0) add('tarefas', 'aviso', aguardando === 1 ? '1 entrega aguardando o seu retorno.' : `${aguardando} entregas aguardando o seu retorno.`);
    if (atrasadas > 0) add('tarefas', 'info', atrasadas === 1 ? '1 tarefa atrasada.' : `${atrasadas} tarefas atrasadas.`);
  }

  // Diário: uma linha só, de baixa prioridade, para não afogar o que é urgente.
  if (alunosSemDiario > 0) {
    saida.push({ alunoId: '', aluno: '', categoria: 'diario', nivel: 'info', texto: alunosSemDiario === 1 ? '1 aluno com aulas sem registro no diário.' : `${alunosSemDiario} alunos com aulas sem registro no diário.` });
  }

  return saida.sort((a, b) => PESO[a.nivel] - PESO[b.nivel] || a.aluno.localeCompare(b.aluno, 'pt-BR'));
}
