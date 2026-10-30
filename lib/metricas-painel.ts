// Números financeiros e de cancelamento do painel do professor. Módulo puro (testável em scripts/).
// `date` do pagamento da UI é o vencimento; `paidAt` é o dia em que foi pago.
import { isOverdueCancelNote } from '@/lib/lesson-cancel-reasons';

type Pgto = { amount: number; date: string; paidAt?: string | null; status: string };
type Aula = { date: string; status: string; notes?: string | null };

const soma = (l: Pgto[]) => l.reduce((s, p) => s + Number(p.amount || 0), 0);

/** Dinheiro que entrou no mês, pela data do pagamento (não pelo vencimento da fatura). */
export function recebidoNoMes(pagamentos: Pgto[], mes: string) {
  const l = pagamentos.filter(p => p.status === 'pago' && (p.paidAt || p.date).startsWith(mes));
  return { total: soma(l), quantidade: l.length, ticketMedio: l.length ? soma(l) / l.length : 0 };
}

/** Tudo que ainda não foi pago: faturas pendentes e vencidas. */
export function aReceber(pagamentos: Pgto[], hoje: string) {
  const l = pagamentos.filter(p => p.status === 'pendente' || p.status === 'vencido');
  const atraso = l.filter(p => p.status === 'vencido' || p.date < hoje);
  return { total: soma(l), emAtraso: soma(atraso) };
}

/** Das faturas que vencem no mês, quanto já foi pago (em %). null se não há fatura no mês. */
export function taxaRecebimentoDoMes(pagamentos: Pgto[], mes: string): number | null {
  const l = pagamentos.filter(p => p.date.startsWith(mes) && ['pago', 'pendente', 'vencido'].includes(p.status));
  const total = soma(l);
  return total > 0 ? Math.round((soma(l.filter(p => p.status === 'pago')) / total) * 100) : null;
}

/** Cancelamento por inativação/pausa/remoção do aluno ou por inadimplência não é cancelamento comum. */
export function canceladaAdministrativa(notes?: string | null): boolean {
  if (isOverdueCancelNote(notes)) return true;
  return /aluno (inativado|removido|pausou)/i.test(notes || '');
}

/** Cancelamentos comuns do mês e a taxa sobre (realizadas + canceladas). */
export function cancelamentosDoMes(aulas: Aula[], mes: string) {
  const doMes = aulas.filter(a => a.date.startsWith(mes));
  const realizadas = doMes.filter(a => a.status === 'realizada').length;
  const canceladas = doMes.filter(a => a.status === 'cancelada' && !canceladaAdministrativa(a.notes)).length;
  const base = realizadas + canceladas;
  return { canceladas, realizadas, taxa: base > 0 ? Math.round((canceladas / base) * 100) : 0 };
}
