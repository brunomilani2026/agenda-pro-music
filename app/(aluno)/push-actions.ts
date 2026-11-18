'use server';

import { getSessionStudent } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/server';

type Assinatura = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Guarda o aparelho do aluno logado para receber avisos (aula, pagamento…). */
export async function salvarAssinatura(sub: Assinatura): Promise<{ ok: boolean }> {
  try {
    const aluno = await getSessionStudent();
    if (!aluno) return { ok: false };
    const { endpoint, keys } = sub || ({} as Assinatura);
    if (!/^https:\/\//.test(endpoint || '') || endpoint.length > 1000 || !keys?.p256dh || !keys?.auth) return { ok: false };
    const { error } = await createAdminClient().from('push_subscription').upsert(
      { idstudent_fk: aluno.idstudent, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'endpoint' },
    );
    if (error) { console.error('Push: erro ao salvar assinatura:', error.message); return { ok: false }; }
    return { ok: true };
  } catch (e: any) {
    console.error('Push: erro inesperado ao salvar assinatura:', e?.message || e);
    return { ok: false };
  }
}

export async function removerAssinatura(endpoint: string): Promise<{ ok: boolean }> {
  try {
    const aluno = await getSessionStudent();
    if (!aluno || !endpoint) return { ok: false };
    await createAdminClient().from('push_subscription').delete().eq('endpoint', endpoint).eq('idstudent_fk', aluno.idstudent);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
