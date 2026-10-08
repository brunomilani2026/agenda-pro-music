import { updateTag, revalidateTag } from 'next/cache';

/**
 * Invalidação de cache segura para código compartilhado entre Server Actions
 * e route handlers (webhook Asaas, crons). No Next 16, updateTag() só pode ser
 * chamado de Server Action — num route handler ele LANÇA, e foi isso que
 * derrubava o cron de cobrança depois de criar a fatura (Internal error).
 * Aqui tentamos o refresh imediato (updateTag) e caímos para revalidateTag;
 * invalidação de cache nunca pode abortar o fluxo de negócio.
 */
export function safeUpdateTag(tag: string): void {
  try {
    updateTag(tag);
  } catch {
    try {
      revalidateTag(tag, 'max');
    } catch {
      // Sem contexto de request (ex.: script) — não há cache a invalidar.
    }
  }
}
