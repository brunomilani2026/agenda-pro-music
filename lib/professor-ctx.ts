// Contexto do professor logado para as server actions da Gestão 360°.
// Módulo comum (sem 'use server'): só funções internas, não são endpoints.
import { getSessionUser } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Falha = { ok: false; error: string };

/** Sessão do professor + cliente com as regras de acesso (RLS) dele. */
export async function contextoProfessor() {
  const dbUser = await getSessionUser();
  if (!dbUser) return null;
  const supabase = await createClient();
  return { supabase, dbUser };
}

/** Aluno do professor logado; um id de aluno de outro professor nunca passa. */
export async function alunoDoProfessor(idstudent: string) {
  if (!UUID.test(idstudent)) return null;
  const ctx = await contextoProfessor();
  if (!ctx) return null;
  const { data } = await ctx.supabase
    .from('student').select('idstudent, name').eq('idstudent', idstudent).eq('idusers_fk', ctx.dbUser.idusers).maybeSingle();
  return data ? { ...ctx, aluno: data } : null;
}
