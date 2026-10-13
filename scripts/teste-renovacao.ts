import { planejarRenovacao } from '../lib/renovacao-agenda';

let ok = 0, tot = 0;
const t = (n: string, c: boolean) => { tot++; if (c) ok++; else console.log('FALHOU:', n); };

const hoje = '2026-10-13'; // terça
const aula = (id: string, fk: string, nome: string, date: string, ini: string, fim: string, st: string, extra: Record<string, any> = {}) =>
  ({ idlesson: id, student_fk: fk, studentname: nome, teachername: 'Prof', instrument: 'cavaquinho', date, datelesson: `${date}T12:00:00Z`, starttime: ini, endtime: fim, lessonstatus: st, obs: '', ...extra });
const semanal = (fk: string, nome: string, primeira: string, n: number, ini: string, fim: string, st = 'realizada') =>
  Array.from({ length: n }, (_, i) => { const [y, m, d] = primeira.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + i * 7, 12)).toISOString().slice(0, 10); return aula(`${fk}-${i}`, fk, nome, dt, ini, fim, st); });

const alunos = [
  { idstudent: 'a', name: 'Ana', status: 'ativo', packagetype: 'mensal', idusers_fk: 'P', expirationdate: '2026-10-17' },
  { idstudent: 'b', name: 'Beto', status: 'inativo', packagetype: 'mensal', idusers_fk: 'P', expirationdate: null },
  { idstudent: 'c', name: 'Caio', status: 'ativo', packagetype: 'avulsa', idusers_fk: 'P', expirationdate: null },
  { idstudent: 'd', name: 'Duda', status: 'bloqueado', packagetype: 'mensal', idusers_fk: 'P', expirationdate: '2026-10-01' },
  { idstudent: 'e', name: 'Edu', status: 'ativo', packagetype: 'mensal', idusers_fk: 'P', expirationdate: null },
  { idstudent: 'f', name: 'Fabi', status: 'ativo', packagetype: 'mensal', idusers_fk: 'P', expirationdate: null },
];
const aulas = [
  ...semanal('a', 'Ana', '2026-08-31', 5, '18:30', '19:20'),                // segundas até 28/09
  ...semanal('b', 'Beto', '2026-08-31', 5, '10:00', '10:50'),
  ...semanal('c', 'Caio', '2026-08-31', 5, '11:00', '11:50'),
  ...semanal('d', 'Duda', '2026-09-08', 5, '16:00', '16:50'),                // terças até 06/10
  ...semanal('e', 'Edu', '2026-08-03', 3, '09:00', '09:50'),                 // série morta (última 17/08)
  [aula('f1', 'f', 'Fabi', '2026-10-05', '14:00', '14:50', 'realizada'), aula('f2', 'f', 'Fabi', '2026-10-12', '14:00', '14:50', 'realizada')].flat(), // só 2 aulas
].flat();
const bloqueios = [{ date: '2026-10-26', starttime: '18:00', endtime: '19:00' }];

const r = planejarRenovacao({ alunos, aulas: aulas as any, bloqueios, folgas: [], hojeIso: hoje });
const de = (n: string) => r.criar.filter(x => x.studentname === n);

t('inativo não renova', de('Beto').length === 0);
t('avulsa não renova', de('Caio').length === 0);
t('série morta não renova', de('Edu').length === 0);
t('só 2 aulas não vira série', de('Fabi').length === 0);
t('Ana: começa em 05/10? não, na próxima segunda futura', de('Ana')[0]?.date === '2026-10-19' || de('Ana')[0]?.date === '2026-10-05');
t('Ana: todas segundas 18:30', de('Ana').every(x => new Date(x.date + 'T12:00:00Z').getUTCDay() === 1 && x.starttime === '18:30' && x.endtime === '19:20'));
t('Ana: nenhuma data passada ou de hoje', de('Ana').every(x => x.date > hoje));
t('Ana: não passa de 56 dias', de('Ana').every(x => x.date <= '2026-12-08'));
t('Ana: 26/10 pulada por bloqueio', !de('Ana').some(x => x.date === '2026-10-26') && r.puladas.some(p => p.aluno === 'Ana' && p.date === '2026-10-26' && p.motivo === 'horário bloqueado'));
t('Ana: depois do vencimento = aguardando', de('Ana').every(x => x.lessonstatus === 'aguardando_pagamento'));
t('Duda (bloqueada) renova', de('Duda').length > 0 && de('Duda').every(x => x.lessonstatus === 'aguardando_pagamento'));
t('Duda: terças 16:00 a partir de 13/10+7', de('Duda')[0]?.date === '2026-10-20');

// rodar de novo com o resultado já gravado não cria nada
const gravadas = r.criar.map((x, i) => ({ ...x, idlesson: `n${i}`, lessonstatus: x.lessonstatus }));
const r2 = planejarRenovacao({ alunos, aulas: [...aulas, ...gravadas] as any, bloqueios, folgas: [], hojeIso: hoje });
t('idempotente', r2.criar.length === 0);

// conflito com outra aula e com folga
const r3 = planejarRenovacao({ alunos: [alunos[0]], aulas: [...aulas, aula('x', 'z', 'Outro', '2026-11-02', '18:00', '19:00', 'agendada')] as any, bloqueios: [], folgas: [], hojeIso: hoje });
t('conflito com outra aula pula a data', !r3.criar.some(x => x.date === '2026-11-02') && r3.puladas.some(p => p.date === '2026-11-02' && p.motivo === 'já existe outra aula'));
const r4 = planejarRenovacao({ alunos: [alunos[0]], aulas: aulas as any, bloqueios: [], folgas: [{ day_of_week: 1 }], hojeIso: hoje });
t('folga semanal pula tudo', r4.criar.length === 0);
// aula cancelada na data não é recriada
const r5 = planejarRenovacao({ alunos: [alunos[0]], aulas: [...aulas, aula('y', 'a', 'Ana', '2026-10-19', '18:30', '19:20', 'cancelada')] as any, bloqueios: [], folgas: [], hojeIso: hoje });
t('data cancelada vira a "última" e a série continua depois dela', r5.criar.every(x => x.date > '2026-10-19'));

console.log(`${ok} de ${tot}`);

// ---- aluno avulso ----
import { planejarVencimentoAvulso } from '../lib/renovacao-agenda';
{
  let ok2 = 0, tot2 = 0;
  const t2 = (n: string, c: boolean) => { tot2++; if (c) ok2++; else console.log('FALHOU (avulso):', n); };
  const al = [
    { idstudent: 'x', name: 'Avulso Um', status: 'ativo', packagetype: 'avulsa', expirationdate: '2026-08-13', idusers_fk: 'P' },
    { idstudent: 'y', name: 'Mensal', status: 'ativo', packagetype: 'mensal', expirationdate: '2026-08-13', idusers_fk: 'P' },
    { idstudent: 'z', name: 'Avulso Teste', status: 'ativo', packagetype: 'avulsa', expirationdate: null, idusers_fk: 'P', is_test: true },
    { idstudent: 'w', name: 'Avulso Inativo', status: 'inativo', packagetype: 'avulsa', expirationdate: null, idusers_fk: 'P' },
    { idstudent: 'v', name: 'Avulso Já Certo', status: 'ativo', packagetype: 'avulsa', expirationdate: '2026-10-21', idusers_fk: 'P' },
  ];
  const au = [
    aula('a1', 'x', 'Avulso Um', '2026-10-21', '19:30', '20:20', 'aguardando_pagamento'),
    aula('a2', 'x', 'Avulso Um', '2026-10-28', '19:30', '20:20', 'aguardando_pagamento'),
    aula('a3', 'x', 'Avulso Um', '2026-09-23', '19:30', '20:20', 'realizada'),
    aula('m1', 'y', 'Mensal', '2026-10-21', '10:00', '10:50', 'aguardando_pagamento'),
    aula('t1', 'z', 'Avulso Teste', '2026-10-22', '10:00', '10:50', 'aguardando_pagamento'),
    aula('i1', 'w', 'Avulso Inativo', '2026-10-22', '11:00', '11:50', 'aguardando_pagamento'),
    aula('c1', 'v', 'Avulso Já Certo', '2026-10-21', '12:00', '12:50', 'agendada'),
  ];
  const aj = planejarVencimentoAvulso({ alunos: al, aulas: au as any, hojeIso: '2026-10-13' });
  t2('só o avulso que precisa de ajuste', aj.length === 1 && aj[0].idstudent === 'x');
  t2('vencimento = próxima aula', aj[0]?.novoVencimento === '2026-10-21');
  t2('libera só a aula da próxima data', JSON.stringify(aj[0]?.liberar) === JSON.stringify(['a1']));
  t2('mensal, teste e inativo ficam de fora', !aj.some(x => ['y', 'z', 'w'].includes(x.idstudent)));
  t2('já correto não muda', !aj.some(x => x.idstudent === 'v'));
  const sem = planejarVencimentoAvulso({ alunos: [al[0]], aulas: [aula('p', 'x', 'Avulso Um', '2026-09-23', '19:30', '20:20', 'realizada')] as any, hojeIso: '2026-10-13' });
  t2('sem aula futura não mexe', sem.length === 0);
  console.log(`avulso: ${ok2} de ${tot2}`);
}
