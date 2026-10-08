// Motivo de cancelamento gravado em `lesson.obs`. A tabela não tem coluna de
// motivo, e `obs` acumula tanto a nota livre do professor quanto as mensagens
// automáticas — então a string precisa ser a MESMA nos dois lados: quem escreve
// (PaymentService.applyOverdueConsequences) e quem lê (agenda e disponibilidade,
// para mostrar a aula em atraso e manter o horário reservado).
//
// Módulo puro de propósito: sem 'use server' e sem Supabase, para poder ser
// importado por componente cliente e por service do servidor.

export const OVERDUE_CANCEL_NOTE = 'Cancelada por inadimplência';

export function isOverdueCancelNote(notes?: string | null): boolean {
  return (notes ?? '').trim() === OVERDUE_CANCEL_NOTE;
}

/**
 * As aulas ligam-se ao aluno por `studentname` (cópia denormalizada), inclusive
 * no cancelamento por inadimplência. Comparar sempre pela mesma normalização
 * evita que espaço ou caixa diferente quebrem o casamento.
 */
export function normalizeStudentName(name?: string | null): string {
  return (name ?? '').trim().toLowerCase();
}

/**
 * Mesma régua de "atrasado" que o Financeiro e o dashboard usam: já vencido, ou
 * pendente com vencimento no passado (o cron ainda não marcou 'vencido').
 */
export function isOverduePayment(
  payment: { status?: string | null; duedate?: string | null },
  todayIso: string
): boolean {
  const status = payment.status ?? '';
  const due = payment.duedate ?? '';
  if (status === 'vencido') return true;
  return status === 'pendente' && !!due && due < todayIso;
}
