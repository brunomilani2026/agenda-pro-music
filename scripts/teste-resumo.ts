import { montarResumo } from '../lib/resumo-diario';
let ok = 0, tot = 0;
const t = (n: string, c: boolean) => { tot++; if (c) ok++; else console.log('FALHOU:', n); };
t('sem nada = sem e-mail', montarResumo({ hojeBr: '13/10/2026', aulas: [], alertas: [] }) === null);
const r = montarResumo({
  hojeBr: '13/10/2026',
  aulas: [{ startTime: '15:00', endTime: '16:00', aluno: 'Beto Souza', instrumento: 'violao', status: 'agendada' }, { startTime: '09:00', endTime: '10:00', aluno: 'Ana Lima', instrumento: '', status: 'agendada' }],
  alertas: [{ alunoId: 'a', aluno: 'Ana Lima', categoria: 'financeiro', nivel: 'perigo', texto: '1 fatura vencida.' }, { alunoId: '', aluno: '', categoria: 'diario', nivel: 'info', texto: '3 alunos com aulas sem registro no diário.' }],
})!;
t('título com urgente', r.title === 'Resumo do dia 13/10/2026 — 1 urgente');
t('aulas em ordem de horário', r.message.indexOf('09:00') < r.message.indexOf('15:00'));
t('alerta financeiro com nome', r.message.includes('• Ana Lima — 1 fatura vencida.'));
t('alerta sem aluno não deixa travessão', r.message.includes('• 3 alunos com aulas sem registro no diário.'));
const so = montarResumo({ hojeBr: 'x', aulas: [], alertas: [{ alunoId: 'a', aluno: 'A', categoria: 'aulas', nivel: 'info', texto: 't' }] })!;
t('sem aulas diz isso', so.message.startsWith('Nenhuma aula marcada para hoje.'));
console.log(`${ok} de ${tot}`);
