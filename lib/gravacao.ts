// Gravação de áudio no navegador (tarefas): regras puras, testáveis.
//
// O MediaRecorder devolve tipos com parâmetros ("audio/webm;codecs=opus"), mas a biblioteca de
// materiais e o bucket só aceitam o tipo "limpo" ("audio/webm"). Aqui normalizamos.

import { MIMES_PERMITIDOS } from '@/lib/materiais';

export const MAX_SEGUNDOS_GRAVACAO = 300; // 5 minutos

/** Tira os parâmetros do tipo: "audio/webm;codecs=opus" -> "audio/webm". */
export function mimeLimpo(tipo: string | null | undefined): string {
  return (tipo ?? '').split(';')[0].trim().toLowerCase();
}

/** O tipo gravado pelo navegador é aceito pela biblioteca? */
export function mimeAudioAceito(tipo: string | null | undefined): boolean {
  const m = mimeLimpo(tipo);
  return m.startsWith('audio/') && (MIMES_PERMITIDOS as readonly string[]).includes(m);
}

export function extensaoDoMime(tipo: string | null | undefined): string {
  switch (mimeLimpo(tipo)) {
    case 'audio/webm': return 'webm';
    case 'audio/mp4': case 'audio/x-m4a': return 'm4a';
    case 'audio/ogg': return 'ogg';
    case 'audio/mpeg': return 'mp3';
    case 'audio/wav': case 'audio/x-wav': return 'wav';
    case 'audio/aac': return 'aac';
    default: return 'audio';
  }
}

/** "0:07", "2:35". */
export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Junta o texto reconhecido: trata espaços e põe a primeira letra em maiúscula. */
export function juntarTranscricao(trechos: string[]): string {
  const t = trechos.map(x => x.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/** Acrescenta a transcrição ao texto que já existe, em novo parágrafo. */
export function anexarTexto(existente: string, novo: string): string {
  const a = existente.trim();
  const b = novo.trim();
  if (!b) return existente;
  return a ? `${a}\n\n${b}` : b;
}
