// Resumo curto de uma aula, mostrado ao passar o mouse sobre ela na Agenda.
// Módulo puro: recebe o que a Agenda já tem em memória (aulas, aluno, pagamentos),
// então não faz nenhuma ida ao servidor.
import { isOverduePayment, normalizeStudentName } from './lesson-cancel-reasons';

export type TomLinha = 'normal' | 'ok' | 'aviso' | 'perigo';
export type LinhaResumo = { texto: string; tom: TomLinha };

type AulaUI = { id: string; studentName: string; date: string; startTime: string; endTime: string; status: string; notes?: string };
type AlunoUI = { name: string; status?: string; packagetype?: string; expirationdate?: string };
type PagamentoUI = { studentName: string; amount: number; date: string; status: string };

const dm = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
const dma = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const moeda = (v: number) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

const ROTULO_PLANO: Record<string, string> = { mensal: 'mensal', trimestral: 'trimestral', semestral: 'semestral', avulsa: 'avulsa' };

export function montarResumoAula(args: {
  aula: AulaUI;
  aulas: AulaUI[];
  aluno: AlunoUI | null;
  pagamentos: PagamentoUI[];
  hojeIso: string;
}): LinhaResumo[] {
  const { aula, aulas, aluno, pagamentos, hojeIso } = args;
  const nome = normalizeStudentName(aula.studentName);
  const linhas: LinhaResumo[] = [];

  // Última aula realizada antes desta.
  const anterior = aulas
    .filter(a => normalizeStudentName(a.studentName) === nome && a.status === 'realizada' && a.date < aula.date)
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))[0];
  linhas.push(anterior
    ? { texto: `Última aula: ${dma(anterior.date)} às ${anterior.startTime}`, tom: 'normal' }
    : { texto: 'Sem aula anterior registrada', tom: 'normal' });

  // Remarcação / reposição.
  const obs = (aula.notes ?? '').toLowerCase();
  if (obs.includes('reposição de aula cancelada')) linhas.push({ texto: 'Reposição de aula cancelada', tom: 'aviso' });
  else if (obs.includes('remarcada pelo professor')) linhas.push({ texto: 'Remarcada pelo professor', tom: 'aviso' });
  else if (obs.includes('remarcação aprovada')) linhas.push({ texto: 'Remarcada a pedido do aluno', tom: 'aviso' });
  if (aula.status === 'aguardando_pagamento') linhas.push({ texto: 'Aguardando pagamento do próximo período', tom: 'aviso' });

  // Financeiro: fatura atrasada > próxima a vencer > em dia.
  const faturas = pagamentos.filter(p => normalizeStudentName(p.studentName) === nome);
  const atrasadas = faturas.filter(p => isOverduePayment({ status: p.status, duedate: p.date }, hojeIso));
  if (atrasadas.length) {
    const mais = atrasadas.slice().sort((a, b) => a.date.localeCompare(b.date))[0];
    linhas.push({
      texto: atrasadas.length === 1
        ? `1 fatura atrasada: ${moeda(mais.amount)} (venceu ${dm(mais.date)})`
        : `${atrasadas.length} faturas atrasadas (a mais antiga venceu ${dm(mais.date)})`,
      tom: 'perigo',
    });
  } else {
    const aberta = faturas
      .filter(p => p.status === 'pendente')
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (aberta) {
      const dias = Math.round((new Date(aberta.date + 'T12:00:00Z').getTime() - new Date(hojeIso + 'T12:00:00Z').getTime()) / 86400000);
      linhas.push({
        texto: `Fatura de ${moeda(aberta.amount)} vence ${dm(aberta.date)}`,
        tom: dias <= 3 ? 'aviso' : 'normal',
      });
    } else if (faturas.length) {
      linhas.push({ texto: 'Pagamentos em dia', tom: 'ok' });
    }
  }

  // Plano e situação do aluno.
  if (aluno) {
    const plano = ROTULO_PLANO[(aluno.packagetype ?? '').toLowerCase()];
    if (plano && plano !== 'avulsa' && aluno.expirationdate) {
      linhas.push({ texto: `Plano ${plano} · vence ${dma(aluno.expirationdate)}`, tom: 'normal' });
    } else if (plano === 'avulsa') {
      linhas.push({ texto: 'Aula avulsa', tom: 'normal' });
    }
    if (aluno.status === 'bloqueado') linhas.push({ texto: 'Aluno bloqueado por atraso', tom: 'perigo' });
  }

  return linhas;
}
