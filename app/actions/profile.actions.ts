'use server';

import { getSessionUser, getSessionStudent } from '@/lib/session';
import { TeacherService } from '@/services/teacher.service';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createClient as createStatelessClient } from '@supabase/supabase-js';
import { isValidCPF, isValidEmail, isValidPhone, normalizePhoneForStorage } from '@/lib/utils';
import { syncStudentIntoLessons, syncStudentNameIntoAccount } from '@/services/student-sync.service';
import { safeUpdateTag } from '@/lib/cache';

// Atualiza o e-mail de login no Supabase Auth (admin, sem round-trip de confirmação).
async function updateAuthEmail(userId: string, email: string) {
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
}

/**
 * Retorna o perfil completo (teacher ou student) do usuário logado via cookie de sessão.
 * Usado pelo AppContext (client-side) para exibir avatar e dados em Sidebar e Topbar.
 */
export async function fetchSessionProfile(): Promise<any> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return null;

    if (dbUser.usertype === 'professor') {
      const teacher = await TeacherService.getTeacherByUser(dbUser.idusers);
      return teacher ? { ...teacher, email: dbUser.email, name: (teacher as any).name || dbUser.fname, _role: 'professor', ispremium: dbUser.ispremium } : null;
    }

    if (dbUser.usertype === 'aluno') {
      const student = await getSessionStudent();
      return student ? { ...student, _role: 'aluno' } : null;
    }

    return null;
  } catch (err) {
    console.error('Error fetching session profile:', err);
    return null;
  }
}

export async function updateTeacherProfileData(data: {
  name?: string;
  phone?: string;
  bio?: string;
  email?: string;
  /** Sala virtual fixa do professor (Meet/Zoom). String vazia limpa o campo. */
  meetLink?: string;
}): Promise<boolean> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return false;
    const supabase = await createClient();
    const teacherUpdates: Record<string, any> = {};
    if (data.name) {
      if (data.name.trim().split(' ').length < 2) return false;
      teacherUpdates.name = data.name;
    }
    if (data.phone !== undefined) {
      if (data.phone && !isValidPhone(data.phone)) return false;
      teacherUpdates.phone = normalizePhoneForStorage(data.phone);
    }
    if (data.bio !== undefined) teacherUpdates.bio = data.bio;
    if (data.meetLink !== undefined) {
      const link = data.meetLink.trim();
      // Vira href de botão em e-mail e na tela do aluno: ou é http(s), ou é nulo.
      // Rejeitar em vez de gravar torto — link quebrado no e-mail é pior que nenhum.
      if (link && !/^https?:\/\/\S+$/i.test(link)) return false;
      teacherUpdates.meet_link = link || null;
    }
    if (Object.keys(teacherUpdates).length > 0) {
      const { error } = await supabase.from('teacher').update(teacherUpdates).eq('idusers_fk', dbUser.idusers);
      if (error) return false;
    }
    if (data.email !== undefined) {
      const newEmail = data.email.trim().toLowerCase();
      if (newEmail && !isValidEmail(newEmail)) return false;
      if (newEmail && newEmail !== dbUser.email) {
        // E-mail de login fica no Supabase Auth; replicamos em users para coerência.
        await updateAuthEmail(dbUser.idusers, newEmail);
        const { error: userErr } = await supabase.from('users').update({ email: newEmail }).eq('idusers', dbUser.idusers);
        if (userErr) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function updateAlunoPerfil(data: {
  name?: string;
  phone?: string;
  email?: string;
  cpf?: string;
  instrument?: string;
}): Promise<boolean> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return false;
    const supabase = await createClient();

    // Busca o registro do aluno pelo e-mail atual da sessão.
    // O nome do aluno é a chave usada para casar lessons (heurística),
    // por isso precisamos ler ANTES de aplicar updates.
    const { data: currentStudent } = await supabase
      .from('student')
      // idusers_fk é o PROFESSOR dono da ficha (account_fk é a conta do aluno);
      // é ele que escopa as aulas em `lesson.idusers_fk`.
      .select('idstudent, name, instrument, email, idusers_fk')
      .eq('account_fk', dbUser.idusers)
      .single();
    if (!currentStudent) return false;

    const updates: Record<string, any> = {};
    let emailChanged = false;
    let newEmail: string | undefined;

    if (data.name !== undefined) {
      const trimmed = data.name.trim();
      if (!trimmed) return false;
      updates.name = trimmed;
    }

    if (data.phone !== undefined) {
      if (data.phone && !isValidPhone(data.phone)) return false;
      updates.phone = normalizePhoneForStorage(data.phone);
    }

    if (data.email !== undefined) {
      const trimmed = data.email.trim().toLowerCase();
      if (trimmed && !isValidEmail(trimmed)) return false;
      // Vazio precisa ser null, não '': a coluna email tem UNIQUE e dois
      // alunos sem e-mail colidiriam em '' (múltiplos NULL são ok no Postgres).
      updates.email = trimmed || null;
      if (trimmed && trimmed !== dbUser.email) {
        emailChanged = true;
        newEmail = trimmed;
      }
    }

    if (data.cpf !== undefined) {
      const digits = data.cpf.replace(/\D/g, '');
      if (digits && !isValidCPF(digits)) return false;
      // Mesmo caso do email: cpf tem UNIQUE, vazio vai como null.
      updates.cpf = digits || null;
    }

    if (data.instrument !== undefined) {
      updates.instrument = data.instrument.trim();
    }

    if (Object.keys(updates).length === 0) return true;

    const { error: studentErr } = await supabase
      .from('student')
      .update(updates)
      .eq('idstudent', currentStudent.idstudent);
    if (studentErr) {
      console.error('[updateAlunoPerfil] student update:', studentErr);
      return false;
    }

    // Quando o e-mail muda, replicamos em `users` para manter a sessão coerente —
    // `getSessionStudent` busca via `users.email`, então um descasamento aqui
    // quebraria todas as próximas requisições do aluno.
    if (emailChanged && newEmail) {
      // E-mail de login no Supabase Auth + réplica em users.
      await updateAuthEmail(dbUser.idusers, newEmail);
      const { error: userErr } = await supabase
        .from('users')
        .update({ email: newEmail })
        .eq('idusers', dbUser.idusers);
      if (userErr) return false;
    }

    // Reconcilia nome e instrumento nas aulas (a agenda do professor e a tela
    // do aluno leem as cópias denormalizadas da própria lesson). Roda em TODO
    // save — não só quando o valor muda — para também reparar aulas que já
    // estavam fora de sincronia antes desta edição.
    //
    // O helper escreve com o admin client de propósito: a sessão do ALUNO não
    // grava em `lesson`, e este bloco vinha casando zero linhas em silêncio —
    // o aluno se renomeava e a agenda do professor seguia com o nome antigo.
    try {
      await syncStudentIntoLessons({
        studentId: currentStudent.idstudent,
        teacherId: currentStudent.idusers_fk,
        previousName: currentStudent.name,
        name: (updates.name as string) || currentStudent.name,
        instrument: ((updates.instrument as string) ?? currentStudent.instrument),
      });

      // O nome também vive na conta de login (`users.fname`), que só era tocada
      // quando o e-mail mudava — por isso a conta ficava com o nome antigo.
      if (updates.name) {
        await syncStudentNameIntoAccount(dbUser.idusers, updates.name as string);
      }
    } catch (e) {
      console.error('[updateAlunoPerfil] lesson sync:', e);
    }

    // As aulas do aluno são servidas por unstable_cache (tag `aluno-lessons`,
    // revalidate 60s) e guardam nome/instrumento — sem invalidar, ele salvaria
    // o perfil e continuaria vendo o valor antigo nas próprias aulas.
    safeUpdateTag('aluno-lessons');

    return true;
  } catch (e) {
    console.error('[updateAlunoPerfil]', e);
    return false;
  }
}

/**
 * Atualiza o avatar_url do usuário logado na tabela correta.
 */
export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    // Usa o e-mail do PRÓPRIO usuário autenticado (Supabase Auth) — é o mesmo
    // que o login usa no signInWithPassword. Verificar com o e-mail da tabela
    // `users` quebrava a checagem quando ele estava vazio ou divergente do Auth
    // (ex.: após troca de e-mail ainda não confirmada), rejeitando a senha certa.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return { success: false, error: 'Sessão inválida.' };

    if (data.newPassword.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }

    // Verifica a senha atual de forma stateless (não toca nos cookies da sessão).
    const check = createStatelessClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { error: signInErr } = await check.auth.signInWithPassword({
      email: user.email,
      password: data.currentPassword,
    });
    if (signInErr) {
      return { success: false, error: 'Senha atual incorreta.' };
    }

    // Atualiza a senha do usuário logado via Supabase Auth.
    const { error } = await supabase.auth.updateUser({ password: data.newPassword });

    return error
      ? { success: false, error: 'Erro ao salvar nova senha.' }
      : { success: true };
  } catch {
    return { success: false, error: 'Erro interno.' };
  }
}

export async function updateSessionProfileAvatar(avatarUrl: string): Promise<boolean> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return false;

    const supabase = await createClient();

    if (dbUser.usertype === 'professor') {
      const { error } = await supabase
        .from('teacher')
        .update({ avatar_url: avatarUrl })
        .eq('idusers_fk', dbUser.idusers);
      return !error;
    }

    if (dbUser.usertype === 'aluno') {
      const { error } = await supabase
        .from('student')
        .update({ avatar_url: avatarUrl })
        .eq('email', dbUser.email);
      return !error;
    }

    return false;
  } catch (err) {
    console.error('Error updating avatar:', err);
    return false;
  }
}
