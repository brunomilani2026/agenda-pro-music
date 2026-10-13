'use server';

import { contextoProfessor } from '@/lib/professor-ctx';
import { carregarAlertas } from '@/lib/painel-dados';
import type { AlertaPainel } from '@/lib/painel-alertas';

/** Alertas do painel inicial. Só lê; usa a sessão do professor, então as regras de acesso (RLS) valem. */
export async function fetchPainelAlertas(): Promise<{ ok: true; alertas: AlertaPainel[] } | { ok: false; error: string }> {
  try {
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    return { ok: true, alertas: await carregarAlertas(ctx.supabase, ctx.dbUser.idusers) };
  } catch (err: any) {
    console.error('Painel de alertas: erro:', err?.message || err);
    return { ok: false, error: 'Não foi possível carregar os alertas.' };
  }
}
