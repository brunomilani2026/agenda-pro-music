'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { User, Student } from '@/types/database.types';

/**
 * Id do usuário autenticado, lido das claims do JWT da sessão.
 *
 * auth.getClaims() verifica a assinatura do JWT LOCALMENTE (chave pública do
 * JWKS, cacheada em memória no módulo do auth-js), sem round-trip ao servidor
 * de Auth. Antes era auth.getUser(): uma ida de rede ao Supabase em TODA server
 * action e em TODO render de layout — e como o Next serializa as server actions
 * de um mesmo cliente, esse custo se somava em fila.
 *
 * Em projetos com chave de assinatura simétrica (HS256 legado) o próprio
 * auth-js cai para getUser(), então o pior caso é igual ao comportamento antigo.
 * Token expirado é renovado pelo getSession() interno antes da verificação.
 *
 * Compartilhado por getSessionUser e getSessionStudent: antes cada um fazia o
 * seu próprio getUser() no mesmo request.
 */
const getAuthUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
});

/**
 * Usuário logado, derivado da sessão do Supabase Auth.
 * O JWT é validado (assinatura + expiração) em getAuthUserId.
 * React.cache() deduplica dentro do mesmo request.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const userId = await getAuthUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('idusers', userId)
    .maybeSingle();

  return data ? (data as User) : null;
});

/**
 * Student vinculado ao usuário logado (se for aluno), via account_fk.
 */
export const getSessionStudent = cache(async (): Promise<Student | null> => {
  const userId = await getAuthUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('student')
    .select('*')
    .eq('account_fk', userId)
    .maybeSingle();

  return data ? (data as Student) : null;
});

/**
 * Encerra a sessão (logout). Mantém o nome usado pelas sidebars.
 */
export async function clearSessionEmail() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
