'use server';

import { AuthService } from '@/services/auth.service';
import { isValidEmail } from '@/lib/utils';

export async function requestPasswordReset(formData: FormData) {
  try {
    const email = (formData.get('email') as string)?.trim();

    if (!email || !isValidEmail(email)) {
      return { error: 'Informe um e-mail válido.' };
    }

    // Dispara o e-mail de redefinição (template do Supabase).
    // Não revelamos se o e-mail existe ou não, por segurança.
    await AuthService.sendPasswordReset(email);

    return { success: true };
  } catch (err: any) {
    console.error('Password reset request error:', err);
    return { error: 'Erro ao solicitar a redefinição. Tente novamente.' };
  }
}
