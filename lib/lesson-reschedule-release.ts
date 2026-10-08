// Marcador de "aula liberada para o aluno escolher um novo horário", gravado em
// `lesson.obs`. A tabela não tem coluna para isso, então quem escreve
// (releaseLessonForStudentReschedule) e quem lê (fetchAlunoLessons, para montar
// a seção de reposição na área do aluno) precisam usar a MESMA string.
//
// Módulo puro de propósito: sem 'use server' e sem Supabase, para poder ser
// importado por componente cliente e por service do servidor — mesmo padrão de
// lib/lesson-cancel-reasons.ts.
//
// ATENÇÃO: o texto não pode conter 'remarcada pelo professor', 'remarcação
// aprovada' nem 'reposição de aula cancelada'. Essas três strings são o gatilho
// de isRemarcacaoResult (app/(aluno)/actions.ts), que corta o direito de
// remarcar — casar com elas aqui tiraria do aluno justamente o benefício que
// esta liberação concede.

export const AWAITING_STUDENT_RESCHEDULE_NOTE = 'Liberada para o aluno remarcar';

/** Motivo é opcional: `Liberada para o aluno remarcar: aluno avisou que não pode`. */
export function buildAwaitingStudentRescheduleNote(reason?: string | null): string {
  const motivo = (reason ?? '').trim();
  return motivo ? `${AWAITING_STUDENT_RESCHEDULE_NOTE}: ${motivo}` : AWAITING_STUDENT_RESCHEDULE_NOTE;
}

/** startsWith, e não igualdade, porque o motivo do professor vem concatenado. */
export function isAwaitingStudentReschedule(obs?: string | null): boolean {
  return (obs ?? '').trim().startsWith(AWAITING_STUDENT_RESCHEDULE_NOTE);
}