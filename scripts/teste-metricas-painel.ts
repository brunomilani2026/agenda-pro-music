import { aReceber, canceladaAdministrativa, cancelamentosDoMes, recebidoNoMes, taxaRecebimentoDoMes } from '../lib/metricas-painel';
let ok = 0, tot = 0; const t = (n: string, c: boolean) => { tot++; if (c) ok++; else console.log('FALHOU:', n); };

const pg = [
  { amount: 250, date: '2026-09-10', paidAt: '2026-10-02', status: 'pago' },   // venceu em set, pago em out
  { amount: 300, date: '2026-10-10', paidAt: '2026-10-09', status: 'pago' },
  { amount: 400, date: '2026-08-10', paidAt: '2026-08-12', status: 'pago' },   // outro mês
  { amount: 425, date: '2026-10-29', status: 'vencido' },
  { amount: 500, date: '2026-11-10', status: 'pendente' },
  { amount: 100, date: '2026-10-05', status: 'cancelado' },
];
const r = recebidoNoMes(pg, '2026-10');
t('recebido pelo dia do pagamento', r.total === 550 && r.quantidade === 2);
t('ticket médio do mês', r.ticketMedio === 275);
const a = aReceber(pg, '2026-10-30');
t('a receber inclui vencidas', a.total === 925 && a.emAtraso === 425);
t('taxa de recebimento do mês: 300 de 725', taxaRecebimentoDoMes(pg, '2026-10') === 41);
t('sem faturas no mês: null', taxaRecebimentoDoMes(pg, '2026-12') === null);

t('inativação é administrativa', canceladaAdministrativa('Cancelada — aluno inativado pelo professor'));
t('pausa é administrativa', canceladaAdministrativa('Cancelada — aluno pausou (cirurgia)'));
t('inadimplência é administrativa', canceladaAdministrativa('Cancelada por inadimplência'));
t('cancelamento comum não é', !canceladaAdministrativa('') && !canceladaAdministrativa(null) && !canceladaAdministrativa('Aluno avisou'));

const aulas = [
  ...Array.from({ length: 8 }, () => ({ date: '2026-10-05', status: 'realizada' })),
  { date: '2026-10-06', status: 'cancelada', notes: '' },
  { date: '2026-10-07', status: 'cancelada', notes: 'Cancelada — aluno inativado pelo professor' },
  { date: '2026-11-01', status: 'cancelada', notes: '' },
];
const c = cancelamentosDoMes(aulas, '2026-10');
t('cancelamentos do mês sem os administrativos', c.canceladas === 1 && c.realizadas === 8);
t('taxa 1 de 9 = 11%', c.taxa === 11);
console.log(`${ok} de ${tot}`);
