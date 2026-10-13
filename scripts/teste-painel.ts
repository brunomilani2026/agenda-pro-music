import { montarAlertas } from '../lib/painel-alertas';
let ok = 0, tot = 0;
const t = (nome: string, cond: boolean) => { tot++; if (cond) ok++; else console.log('FALHOU:', nome); };
const hoje = '2026-10-13';
const alunos = [
  { idstudent: 'a', name: 'Ana', status: 'ativo' },
  { idstudent: 'b', name: 'Beto', status: 'inativo' },
  { idstudent: 'c', name: 'Caio', status: 'ativo' },
];
const aula = (id: string, sf: string, date: string, st: string) => ({ idlesson: id, student_fk: sf, studentname: '', date, datelesson: date, starttime: '10:00', endtime: '11:00', lessonstatus: st, instrument: 'violao' });
const r = montarAlertas({
  alunos,
  aulas: [aula('l1', 'a', '2026-10-08', 'realizada'), aula('l2', 'a', '2026-10-20', 'agendada'), aula('l3', 'b', '2026-10-01', 'realizada'), aula('l4', 'c', '2026-10-12', 'realizada'), aula('l5', 'c', '2026-10-20', 'agendada')],
  faturas: [{ id: 'f1', idstudent_fk: 'a', amount: 100, duedate: '2026-10-01', status: 'vencido' }],
  creditos: [],
  registros: [{ idlesson_fk: 'l4' }],
  tarefas: [{ id: 't1', idstudent_fk: 'c', title: 'x', status: 'aberta', due_date: null }, { id: 't2', idstudent_fk: 'c', title: 'y', status: 'aberta', due_date: '2026-10-01' }],
  entregas: [{ task_fk: 't1', created_at: '2026-10-12T10:00:00Z', feedback_at: null }],
  hojeIso: hoje, agoraMin: 600, diarioDesde: '2026-01-01',
});
const de = (n: string) => r.filter(a => a.aluno === n);
t('inativo não aparece', de('Beto').length === 0);
t('Ana: fatura vencida (perigo)', de('Ana').some(a => a.categoria === 'financeiro' && a.nivel === 'perigo'));
t('diário: uma linha só', r.filter(a => a.categoria === 'diario').length === 1 && r.find(a => a.categoria === 'diario')!.texto.startsWith('1 aluno'));
const r2 = montarAlertas({ alunos, aulas: [aula('l1', 'a', '2026-10-08', 'realizada')], faturas: [], creditos: [], registros: [], tarefas: [], entregas: [], hojeIso: hoje, agoraMin: 600 });
t('aula antes do lançamento não gera alerta', !r2.some(a => a.categoria === 'diario'));
t('Caio: entrega aguardando', de('Caio').some(a => a.texto.includes('aguardando')));
t('Caio: tarefa atrasada', de('Caio').some(a => a.texto.includes('atrasada')));
t('ordenado: perigo primeiro', r[0].nivel === 'perigo');
console.log(`${ok} de ${tot}`);
