// Gerador de calendário (.ics) das aulas do professor, para assinar no Google Agenda por link.
// Módulo puro: recebe aulas já filtradas e devolve o texto do arquivo. Mostra só o PRIMEIRO nome do aluno.

export type AulaIcs = { id: string; aluno: string; instrumento: string; date: string; startTime: string; endTime: string; status: string };

const NOME_CAL = 'Agenda Pro Music';
const TZ = 'America/Sao_Paulo';

/** Escapa texto para o formato iCalendar (RFC 5545). */
export const escaparIcs = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Linhas com mais de 75 bytes são quebradas, continuando com um espaço (RFC 5545). */
export function dobrarLinha(linha: string): string {
  const partes: string[] = [];
  let atual = '';
  let bytes = 0;
  for (const ch of linha) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (partes.length === 0 ? 75 : 74)) { partes.push(atual); atual = ''; bytes = 0; }
    atual += ch; bytes += b;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

export const primeiroNome = (nome: string): string => (nome.trim().split(/\s+/)[0] || 'Aluno');

const dataHora = (date: string, hora: string): string | null => {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const h = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!d || !h) return null;
  return `${d[1]}${d[2]}${d[3]}T${h[1].padStart(2, '0')}${h[2]}00`;
};

const carimbo = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function montarCalendario(aulas: AulaIcs[], agora: Date = new Date()): string {
  const linhas: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agenda Pro Music//Aulas//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparIcs(NOME_CAL)}`, `X-WR-TIMEZONE:${TZ}`,
  ];
  for (const a of aulas) {
    const ini = dataHora(a.date, a.startTime);
    const fim = dataHora(a.date, a.endTime);
    if (!ini || !fim || fim <= ini) continue; // aula com dados incompletos não entra
    const titulo = `Aula: ${primeiroNome(a.aluno)}${a.instrumento ? ` (${a.instrumento})` : ''}`;
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${a.id}@agendapromusic.com.br`,
      `DTSTAMP:${carimbo(agora)}`,
      `DTSTART;TZID=${TZ}:${ini}`,
      `DTEND;TZID=${TZ}:${fim}`,
      `SUMMARY:${escaparIcs(titulo)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }
  linhas.push('END:VCALENDAR');
  return linhas.map(dobrarLinha).join('\r\n') + '\r\n';
}
