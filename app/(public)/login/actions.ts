'use server';

import { createClient } from '@/lib/supabase/server';

export async function submitLogin(formData: FormData) {
  try {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
      return { error: 'E-mail e senha são obrigatórios.' };
    }

    const supabase = await createClient();

    // Autenticação via Supabase Auth (define os cookies de sessão).
    const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !auth.user) {
      return { error: 'E-mail ou senha incorretos.' };
    }

    // Perfil base para decidir status e destino.
    const { data: user } = await supabase
      .from('users')
      .select('usertype, accountstatus')
      .eq('idusers', auth.user.id)
      .maybeSingle();

    if (!user) {
      await supabase.auth.signOut();
      return { error: 'Conta sem perfil associado. Contate o suporte.' };
    }

    if (user.usertype === 'professor') {
      if (user.accountstatus === 'waiting_approvement') {
        await supabase.auth.signOut();
        return { error: 'Conta em análise. Aguarde a aprovação do administrador.' };
      }
      return { success: true, redirectUrl: '/agenda' };
    }

    if (user.usertype === 'admin') {
      return { success: true, redirectUrl: '/admin' };
    }

    if (user.usertype === 'aluno') {
      const { data: student } = await supabase
        .from('student')
        .select('status')
        .eq('account_fk', auth.user.id)
        .maybeSingle();

      if (student?.status === 'inativo') {
        await supabase.auth.signOut();
        return { error: 'Sua matrícula está inativa. Entre em contato com seu professor.' };
      }
      return { success: true, redirectUrl: '/aluno/dashboard' };
    }

    await supabase.auth.signOut();
    return { error: 'Tipo de usuário inválido no sistema.' };
  } catch (err: any) {
    console.error('Login action error:', err);
    return { error: 'Erro interno durante a autenticação.' };
  }
}
