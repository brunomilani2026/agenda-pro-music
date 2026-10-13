// Renovação automática da agenda: mantém criadas as aulas das próximas semanas de cada aluno de horário fixo.
//
// Módulo puro (sem Supabase): recebe as linhas lidas e devolve o que deve ser criado.
//
// Regras:
//  - Entram alunos ATIVOS ou BLOQUEADOS (bloqueado = em atraso; a aula continua reservada, como "aguardando pagamento").
//    Inativos e alunos de plano "avulsa" ficam de fora.
//  - Um horário fixo = mesmo dia da semana + início + fim, com pelo menos 3 aulas reais (realizada/agendada/aguardando)
//    nas últimas 12 semanas e a mais recente há no máximo 6 semanas. Aula avulsa solta não vira série.
//  - Só acrescenta datas DEPOIS da última aula daquele horário (qualquer status), então não recria data cancelada
//    nem remarcada e rodar duas vezes não duplica.
//  - Cria até HORIZONTE_DIAS à frente. Pula data com conflito (outra aula, bloqueio pontual ou folga semanal).
//  - Datas após o vencimento do plano entram como "aguardando_pagamento"; as demais, "agendada" (igual ao app).
//  - Não gera notificação, e-mail nem crédito.

import { mapDbLessonToUI } from '@/lib/lesson-mapper';
import { aulasDoAluno } from '@/lib/ficha-aluno';
import { isOverdueCancelNote } from '@/lib/lesson-cancel-reasons';

type Linha = Record<string, any>;

export const HORIZONTE_DIAS = 56;
export const JANELA_HISTORICO_DIAS = 84;
export const MIN_OCORRENCIAS = 3;
export const IDADE_MAX_SERIE_DIAS = 42;

export type AulaNova = {
  studentname: string; student_fk: string; teachername: string; instrument: string; date: string;
  starttime: string; endtime: string; datelesson: string; lessonstatus: 'agendada' | 'aguardando_pagamento'; obs: string; idusers_fk: string;
};
export type ResumoRenovacao = { aluno: string; horario: string; criadas: number; ate: string };
export type PuladaRenovacao = { aluno: string; date: string; motivo: string };

const somarDias = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};
const diasEntre = (de: string, ate: string): number => {
  const [y1, m1, d1] = de.split('-').map(Number);
  const [y2, m2, d2] = ate.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
const diaDaSemana = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();
const minutos = (t: string): number => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function planejarRenovacao(p: {
  alunos: Linha[];
  aulas: Linha[];
  bloqueios: { date: string; starttime: string; endtime: string }[];
  folgas: { day_of_week: number }[];
  hojeIso: string;
}): { criar: AulaNova[]; resumo: ResumoRenovacao[]; puladas: PuladaRenovacao[] } {
  const { hojeIso } = p;
  const limite = somarDias(hojeIso, HORIZONTE_DIAS);
  const inicioHistorico = somarDias(hojeIso, -JANELA_HISTORICO_DIAS);
  const diasFolga = new Set(p.folgas.map(f => f.day_of_week));
  const criar: AulaNova[] = [];
  const resumo: ResumoRenovacao[] = [];
  const puladas: PuladaRenovacao[] = [];

  // Aulas que ocupam horário do professor: as ativas e as canceladas por inadimplência (horário continua reservado).
  type Ocupada = { aluno: string; date: string; ini: string; fim: string; idAluno: string | null };
  const ocupadas: Ocupada[] = [];
  for (const l of p.aulas) {
    const ui = mapDbLessonToUI(l);
    const ativa = ui.status !== 'cancelada' && ui.status !== 'remarcada';
    const retida = ui.status === 'cancelada' && isOverdueCancelNote(ui.notes ?? '');
    if (ativa || retida) ocupadas.push({ aluno: ui.studentName, date: ui.date, ini: ui.startTime, fim: ui.endTime, idAluno: (l.student_fk as string) ?? null });
  }

  for (const aluno of p.alunos) {
    const status = aluno.status ?? 'ativo';
    if (status !== 'ativo' && status !== 'bloqueado') continue;
    if (!aluno.idusers_fk || (aluno.packagetype ?? 'avulsa') === 'avulsa') continue;

    const aulasDele = aulasDoAluno(aluno, p.aulas).map(l => ({ ui: mapDbLessonToUI(l), l }));
    const grupos = new Map<string, typeof aulasDele>();
    for (const x of aulasDele) {
      if (!x.ui.date || !x.ui.startTime || !x.ui.endTime) continue;
      const chave = `${diaDaSemana(x.ui.date)}|${x.ui.startTime}|${x.ui.endTime}`;
      (grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push(x);
    }

    for (const [chave, itens] of grupos) {
      const reais = itens.filter(x =>
        (x.ui.status === 'realizada' || x.ui.status === 'agendada' || x.ui.status === 'aguardando_pagamento') && x.ui.date >= inicioHistorico);
      if (reais.length < MIN_OCORRENCIAS) continue;
      const maisRecente = reais.reduce((m, x) => (x.ui.date > m ? x.ui.date : m), '');
      if (diasEntre(maisRecente, hojeIso) > IDADE_MAX_SERIE_DIAS) continue;

      const ultima = itens.reduce((m, x) => (x.ui.date > m ? x.ui.date : m), '');
      const modelo = itens.reduce((m, x) => (x.ui.date > m.ui.date ? x : m));
      const [dow, ini, fim] = chave.split('|');
      const jaTem = new Set(itens.map(x => x.ui.date));

      let d = somarDias(ultima, 7);
      while (d <= hojeIso) d = somarDias(d, 7);
      let criadas = 0, ateData = '';
      for (; d <= limite; d = somarDias(d, 7)) {
        if (jaTem.has(d)) continue;
        const nome = aluno.name?.trim() || modelo.ui.studentName;
        const motivo =
          diasFolga.has(diaDaSemana(d)) ? 'dia de folga' :
          p.bloqueios.some(b => b.date === d && minutos(b.starttime) < minutos(fim) && minutos(b.endtime) > minutos(ini)) ? 'horário bloqueado' :
          ocupadas.some(o => o.date === d && o.idAluno !== aluno.idstudent && minutos(o.ini) < minutos(fim) && minutos(o.fim) > minutos(ini)) ? 'já existe outra aula' : null;
        if (motivo) { puladas.push({ aluno: nome, date: d, motivo }); continue; }
        const vence = aluno.expirationdate as string | null;
        criar.push({
          studentname: nome, student_fk: aluno.idstudent, teachername: modelo.ui.teacherName || '', instrument: modelo.l.instrument || '',
          date: d, starttime: ini, endtime: fim, datelesson: new Date(`${d}T12:00:00Z`).toISOString(),
          lessonstatus: vence && d > vence ? 'aguardando_pagamento' : 'agendada', obs: '', idusers_fk: aluno.idusers_fk,
        });
        ocupadas.push({ aluno: nome, date: d, ini, fim, idAluno: aluno.idstudent });
        criadas++; ateData = d;
      }
      if (criadas > 0) resumo.push({ aluno: aluno.name?.trim() || modelo.ui.studentName, horario: `${NOMES_DIA[Number(dow)]} ${ini}`, criadas, ate: ateData });
    }
  }
  return { criar, resumo, puladas };
}
