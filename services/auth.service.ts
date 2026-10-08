import { createClient } from '@/lib/supabase/server';
import { User, Teacher, Admin } from '@/types/database.types';

export class AuthService {
  /**
   * Login using Supabase Auth
   */
  static async loginWithEmail(email: string, password: string) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Error logging in:', error.message);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  }

  /**
   * Register a new user with Supabase Auth
   */
  static async signUpWithEmail(email: string, password: string) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.agendapromusic.com.br'}/auth/callback`,
      },
    });

    if (error) {
      console.error('Error signing up:', error.message);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  }

  /**
   * Envia o e-mail de redefinição de senha (dispara o template "Reset password" do Supabase)
   */
  static async sendPasswordReset(email: string) {
    const supabase = await createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agendapromusic.com.br';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Fluxo PKCE (@supabase/ssr): o link volta com `?code=...`, que precisa ser
      // trocado por sessão NO SERVIDOR (onde está o cookie code_verifier). Por isso
      // passamos pela rota /auth/callback, que faz exchangeCodeForSession e só então
      // redireciona para a tela de nova senha (agora com sessão de recuperação válida).
      redirectTo: `${appUrl}/auth/callback?next=/redefinir-senha`,
    });

    if (error) {
      console.error('Error sending password reset:', error.message);
      return { error: error.message };
    }
    return { error: null };
  }

  /**
   * Atualiza a senha do usuário autenticado (usado após clicar no link de redefinição).
   */
  static async updatePassword(newPassword: string) {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      console.error('Error updating password:', error.message);
      return { error: error.message };
    }
    return { error: null };
  }

  /**
   * Log out the current user
   */
  static async logout() {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Error logging out:', error.message);
      return false;
    }
    return true;
  }

  static async getCurrentUser() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  }
}
