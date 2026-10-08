'use server';

import { getSessionUser } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const MESSAGE_MAX = 1000;

/**
 * Registra o feedback (nota 1-5 + comentário) do usuário logado.
 * RLS de `feedback` exige idusers_fk = auth.uid() no insert.
 */
export async function sendFeedback(
  rating: number,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Sessão expirada. Faça login novamente.' };

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { success: false, error: 'Selecione uma nota de 1 a 5 estrelas.' };
  }

  const trimmed = message.trim();
  if (trimmed.length > MESSAGE_MAX) {
    return { success: false, error: `O comentário deve ter no máximo ${MESSAGE_MAX} caracteres.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('feedback').insert({
    idusers_fk: user.idusers,
    rating,
    message: trimmed || null,
  });

  if (error) return { success: false, error: 'Não foi possível enviar seu feedback. Tente novamente.' };
  return { success: true };
}
