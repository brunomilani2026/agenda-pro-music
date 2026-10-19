import { parearLeitura, diasSemLer } from '../lib/email-lida';
let ok = 0, tot = 0; const t = (n: string, c: boolean) => { tot++; if (c) ok++; else console.log('FALHOU:', n); };
const avisos = [
  { id: 'n1', title: 'Pagamento confirmado!', created_at: '2026-10-15T14:00:00Z', read: true, read_at: '2026-10-15T18:20:00Z' },
  { id: 'n2', title: 'Pagamento confirmado!', created_at: '2026-10-01T14:00:00Z', read: false, read_at: null },
  { id: 'n3', title: 'Aula agendada!', created_at: '2026-10-15T14:00:30Z', read: true, read_at: null },
];
const emails = [
  { id: 'e1', title: 'Pagamento confirmado!', created_at: '2026-10-15T14:00:05Z' },
  { id: 'e2', title: 'Pagamento confirmado!', created_at: '2026-10-01T14:00:03Z' },
  { id: 'e3', title: 'Aula agendada!', created_at: '2026-10-15T14:00:40Z' },
  { id: 'e4', title: 'Outro título', created_at: '2026-10-15T14:00:00Z' },
  { id: 'e5', title: 'Pagamento confirmado!', created_at: '2026-09-01T14:00:00Z' },
];
const m = parearLeitura(emails, avisos);
t('e1 lida com hora', m.get('e1')?.lida === true && m.get('e1')?.lida_em === '2026-10-15T18:20:00Z');
t('e2 não lida (mesmo título, outra data)', m.get('e2')?.lida === false && m.get('e2')?.lida_em === null);
t('e3 lida sem hora (lida antes da etapa 13)', m.get('e3')?.lida === true && m.get('e3')?.lida_em === null);
t('e4 sem aviso correspondente', !m.has('e4'));
t('e5 fora da janela', !m.has('e5'));
t('aviso não é reaproveitado', parearLeitura([emails[0], { id: 'dup', title: 'Pagamento confirmado!', created_at: '2026-10-15T14:00:07Z' }], avisos).size === 1);
const agora = new Date('2026-10-19T12:00:00Z').getTime();
t('2 dias = null', diasSemLer('2026-10-17T13:00:00Z', agora) === null);
t('4 dias = 4', diasSemLer('2026-10-15T12:00:00Z', agora) === 4);
console.log(`${ok} de ${tot}`);
