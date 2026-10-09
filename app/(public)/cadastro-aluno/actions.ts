'use server';

import { unstable_cache } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { afterResponse } from '@/lib/after-response';
import { isValidCPF, isValidEmail, isValidPhone, normalizePhoneForStorage } from '@/lib/utils';

export async function submitStudentRegistration(formData: FormData) {
  try {
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const cpf = formData.get('cpf') as string;
    const phone = normalizePhoneForStorage((formData.get('phone') as string) || '');
    // Opcionais: a página /cadastro-aluno envia professor+instrumento (antes
    // eram descartados em silêncio); a aba "Sou Aluno" do /cadastro não envia.
    const teacherId = (formData.get('teacherId') as string) || '';
    const instrument = (formData.get('instrument') as string) || '';

    if (!name || !email || !password) {
      return { error: 'Preencha todos os campos obrigatórios.' };
    }

    if (cpf && !isValidCPF(cpf)) {
      return { error: 'O CPF informado é inválido.' };
    }

    if (!isValidEmail(email)) {
      return { error: 'Por favor, use um e-mail com formato válido.' };
    }

    if (name.trim().split(' ').length < 2) {
      return { error: 'O nome precisa estar completo (nome e sobrenome).' };
    }

    if (phone && !isValidPhone(phone)) {
      return { error: 'O telefone fornecido é inválido.' };
    }

    if (password.length < 6) {
      return { error: 'A senha deve ter no mínimo 6 caracteres.' };
    }

    // Valida o professor escolhido ANTES de criar qualquer coisa.
    const adminPre = createAdminClient();
    let linkedTeacherId: string | null = null;
    if (teacherId) {
      const { data: teacherUser } = await adminPre
        .from('users')
        .select('idusers')
        .eq('idusers', teacherId)
        .eq('usertype', 'professor')
        .eq('accountstatus', 'approved')
        .maybeSingle();
      if (!teacherUser) {
        return { error: 'O professor escolhido não está disponível. Escolha outro.' };
      }
      linkedTeacherId = teacherUser.idusers;
    }

    // 1. Cria a conta JÁ confirmada via admin. Não depende do setting
    //    "Confirm email" do Supabase e, para e-mail repetido, retorna um erro
    //    claro — evita o "user fake" (identities vazio) que o signUp devolve com
    //    a confirmação de e-mail ligada e que quebrava a FK do student.
    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { fname: name, usertype: 'aluno' },
    });

    if (createErr || !created?.user) {
      if (/already|exists|registered|duplicate/i.test(createErr?.message || '')) {
        return { error: 'Este e-mail já está em uso.' };
      }
      console.error('Erro ao criar conta do aluno:', createErr?.message);
      return { error: 'Falha ao criar a conta. Tente novamente.' };
    }
    const userId = created.user.id;

    // 2. Garante a linha em public.users (idempotente; o trigger handle_new_user()
    //    normalmente já a cria). É o que a FK student.account_fk -> users(idusers)
    //    exige — sem ela o insert abaixo falha.
    const { error: userErr } = await admin.from('users').upsert(
      {
        idusers: userId,
        email,
        fname: name,
        usertype: 'aluno',
        accountstatus: 'approved',
        ispremium: false,
      },
      { onConflict: 'idusers', ignoreDuplicates: true }
    );
    // Rollback: sem ele, uma falha adiante deixava conta auth órfã — o aluno
    // não conseguia se recadastrar ("e-mail já em uso") e logava num painel
    // vazio, sem perfil. Apagar a conta permite tentar de novo.
    const rollback = async () => {
      try {
        await admin.from('users').delete().eq('idusers', userId);
        await admin.auth.admin.deleteUser(userId);
      } catch (e: any) {
        console.error('Erro ao desfazer cadastro incompleto do aluno:', e?.message);
      }
    };

    if (userErr) {
      console.error('Erro ao provisionar users do aluno:', userErr.message);
      await rollback();
      return {
        error: 'Falha ao provisionar a conta do aluno.' +
          (userErr.message ? ` (${userErr.message})` : ''),
      };
    }

    // 3. Perfil do aluno (via admin). Professor/instrumento vêm do formulário
    //    quando informados (antes eram descartados e o aluno tinha que escolher
    //    de novo no marketplace). account_fk liga o aluno à própria conta (RLS).
    //    cpf/phone vazios precisam ser null, não '': a coluna cpf tem UNIQUE e
    //    dois alunos sem CPF colidiriam em '' (no Postgres múltiplos NULL são ok).
    const { error: studentError } = await admin.from('student').insert([{
      name,
      email,
      phone: phone || null,
      cpf: cpf || null,
      instrument: instrument || null,
      account_fk: userId,
      status: 'ativo',
      idusers_fk: linkedTeacherId,
      packagetype: 'avulsa',
      totallessons: 0,
      usedlessons: 0,
    }]);

    if (studentError) {
      console.error('Erro ao criar perfil de aluno:', studentError.message, studentError.details, studentError.hint);
      await rollback();
      if (/duplicate|unique/i.test(studentError.message || '')) {
        return { error: 'Este CPF já está cadastrado (talvez pelo seu professor). Fale com ele para ativar sua conta pelo link de convite.' };
      }
      return {
        error: 'Falha ao criar o perfil de aluno no banco de dados.' +
          (studentError.message ? ` (${studentError.message})` : ''),
      };
    }

    // 4. E-mail de boas-vindas, pelo template genérico (mesmo padrão do
    //    cadastro de professor). A conta nasce confirmada (email_confirm), então
    //    sem este envio o aluno não recebia NENHUM e-mail ao se cadastrar.
    //    Depois da resposta: quem acabou de se cadastrar não precisa esperar o
    //    EmailJS (~0,5–2 s) para ser logado e redirecionado.
    await afterResponse(async () => {
      const { EmailService } = await import('@/services/email.service');
      await EmailService.sendNotification({
        toEmail: email,
        toName: name,
        title: 'Bem-vindo(a)!',
        message: `Sua conta de aluno no Agenda Pro Music está pronta.\n\nAcesse o painel para acompanhar suas aulas, faturas e notificações.`,
        buttonLabel: 'Acessar painel',
        buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.agendapromusic.com.br'}/aluno/dashboard`,
      });
    });

    // 5. Estabelece a sessão (auto-login) no client com cookies. Como a conta já
    //    está confirmada, o login funciona mesmo com "Confirm email" ligado.
    const supabase = await createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) {
      // Conta criada, mas não deu para logar automaticamente → login manual.
      console.error('Auto-login pós-cadastro falhou:', signInErr.message);
      return { success: true, redirectUrl: '/login' };
    }

    return { success: true, redirectUrl: '/aluno/dashboard' };
  } catch (err: any) {
    console.error('Registration action error:', err);
    return { error: 'Erro interno durante o cadastro.' };
  }
}

// A listagem pública de professores (marketplace do aluno e telas de cadastro) é
// um JOIN users → teacher → teacher_pricing, refeito a CADA abertura dessas telas
// e igual para todo mundo. Fica em cache por 60 s: um professor recém-aprovado ou
// com preço alterado aparece em até 1 min, e quem escolhe um professor é sempre
// revalidado no servidor (submitStudentRegistration / linkStudentToTeacher).
// Resultado vazio NÃO é cacheado (lançamos para o unstable_cache não gravar): se o
// banco falhou, a próxima abertura tenta de novo em vez de mostrar lista vazia por 1 min.
const cachedAvailableTeachers = unstable_cache(
  async () => {
    const { TeacherService } = await import('@/services/teacher.service');
    const teachers = await TeacherService.getAllTeachers();
    if (teachers.length === 0) throw new Error('empty');
    return teachers;
  },
  ['public-available-teachers'],
  { revalidate: 60, tags: ['available-teachers'] }
);

export async function getAvailableTeachers() {
  try {
    return await cachedAvailableTeachers();
  } catch {
    return [];
  }
}

/**
 * Tudo que a tela /cadastro-aluno precisa ao abrir, numa ida só: duas ações
 * separadas do cliente rodam em fila (o Next as despacha uma por vez).
 */
export async function fetchStudentRegistrationData() {
  const [{ fetchAgendaInstruments }, teachers] = await Promise.all([
    import('@/app/(app)/agenda/actions'),
    getAvailableTeachers(),
  ]);
  const instruments = await fetchAgendaInstruments();
  return { instruments, teachers };
}
