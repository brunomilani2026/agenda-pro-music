import { montarResumoAula } from '../lib/resumo-aula';
let ok = 0, tot = 0; const t = (n: string, c: boolean) => { tot++; if (c) ok++; else console.log('FALHOU:', n); };
const aula = { id: 'a', studentName: 'Rafael lucas ', date: '2026-10-19', startTime: '16:00', endTime: '16:50', status: 'agendada', notes: 'Reposição de aula cancelada' };
const aulas = [
  aula,
  { id: 'b', studentName: 'Rafael lucas', date: '2026-10-07', startTime: '17:00', endTime: '17:50', status: 'realizada' },
  { id: 'c', studentName: 'Rafael lucas', date: '2026-09-30', startTime: '17:00', endTime: '17:50', status: 'realizada' },
  { id: 'd', studentName: 'Outro', date: '2026-10-10', startTime: '10:00', endTime: '10:50', status: 'realizada' },
];
const aluno = { name: 'Rafael lucas', status: 'ativo', packagetype: 'semestral', expirationdate: '2026-12-05' };
let r = montarResumoAula({ aula, aulas, aluno, pagamentos: [], hojeIso: '2026-10-19' });
t('última aula = 07/10', r[0].texto === 'Última aula: 07/10/2026 às 17:00');
t('reposição aparece', r.some(l => l.texto === 'Reposição de aula cancelada'));
t('plano com vencimento', r.some(l => l.texto === 'Plano semestral · vence 05/12/2026'));
t('sem pagamentos não afirma "em dia"', !r.some(l => l.texto === 'Pagamentos em dia'));
r = montarResumoAula({ aula, aulas, aluno, hojeIso: '2026-10-19', pagamentos: [{ studentName: 'rafael lucas', amount: 250, date: '2026-10-10', status: 'pendente' }] });
t('fatura atrasada (pendente vencida)', r.some(l => l.tom === 'perigo' && l.texto.startsWith('1 fatura atrasada: R$ 250,00 (venceu 10/10)')));
r = montarResumoAula({ aula, aulas, aluno, hojeIso: '2026-10-19', pagamentos: [{ studentName: 'Rafael lucas', amount: 250, date: '2026-10-21', status: 'pendente' }] });
t('fatura a vencer em 2 dias = aviso', r.some(l => l.tom === 'aviso' && l.texto === 'Fatura de R$ 250,00 vence 21/10'));
r = montarResumoAula({ aula, aulas, aluno, hojeIso: '2026-10-19', pagamentos: [{ studentName: 'Rafael lucas', amount: 250, date: '2026-09-21', status: 'pago' }] });
t('tudo pago = em dia', r.some(l => l.texto === 'Pagamentos em dia'));
r = montarResumoAula({ aula: { ...aula, notes: '', status: 'aguardando_pagamento' }, aulas, aluno: { ...aluno, status: 'bloqueado' }, pagamentos: [], hojeIso: '2026-10-19' });
t('aguardando pagamento + bloqueado', r.some(l => l.texto.startsWith('Aguardando pagamento')) && r.some(l => l.texto === 'Aluno bloqueado por atraso'));
r = montarResumoAula({ aula: { ...aula, notes: '' }, aulas: [aula], aluno: null, pagamentos: [], hojeIso: '2026-10-19' });
t('sem histórico', r[0].texto === 'Sem aula anterior registrada' && r.length === 1);
console.log(`${ok} de ${tot}`);
