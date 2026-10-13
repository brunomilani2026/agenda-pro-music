import { montarCalendario, escaparIcs, dobrarLinha, primeiroNome } from '../lib/ics';
let ok = 0, tot = 0;
const t = (n: string, c: boolean) => { tot++; if (c) ok++; else console.log('FALHOU:', n); };
const cal = montarCalendario([
  { id: 'x1', aluno: 'Maria da Silva Santos', instrumento: 'violao', date: '2026-10-20', startTime: '9:30', endTime: '10:30', status: 'agendada' },
  { id: 'x2', aluno: 'Sem hora', instrumento: '', date: '2026-10-21', startTime: '', endTime: '', status: 'agendada' },
], new Date('2026-10-13T12:00:00Z'));
t('começa e termina certo', cal.startsWith('BEGIN:VCALENDAR\r\n') && cal.endsWith('END:VCALENDAR\r\n'));
t('só primeiro nome', cal.includes('SUMMARY:Aula: Maria (violao)') && !cal.includes('Silva'));
t('horário com fuso', cal.includes('DTSTART;TZID=America/Sao_Paulo:20261020T093000') && cal.includes('DTEND;TZID=America/Sao_Paulo:20261020T103000'));
t('aula sem hora fica de fora', !cal.includes('x2@') && (cal.match(/BEGIN:VEVENT/g) ?? []).length === 1);
t('escape', escaparIcs('a,b;c\\d\ne') === 'a\\,b\\;c\\\\d\\ne');
t('dobra linha longa', dobrarLinha('X'.repeat(200)).split('\r\n').every(l => Buffer.byteLength(l) <= 75));
t('primeiro nome vazio', primeiroNome('  ') === 'Aluno');
console.log(`${ok} de ${tot}`);
