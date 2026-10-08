'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { PaymentService } from '@/services/payment.service';
import { afterResponse } from '@/lib/after-response';

export async function confirmStudent(idstudent: string, password: string) {
  try {
    if (!password || password.length < 6) {
      return { error: 'A senha deve ter no mínimo 6 caracteres.' };
    }

    // Fluxo sem sessão (aluno clica no link) → tudo via admin client.
    const admin = createAdminClient();

    const { data: student } = await admin
      .from('student')
      .select('*')
      .eq('idstudent', idstudent)
      .maybeSingle();

    if (!student) {
      return { error: 'Estudante não encontrado ou inválido.' };
    }
    if (student.status === 'ativo' && student.account_fk) {
      return { error: 'Este estudante já está ativo!' };
    }
    if (!student.email) {
      return { error: 'Estudante não possui um e-mail cadastrado. Solicite ao professor.' };
    }

    const email = (student.email as string).trim();

    // 1. Cria a conta no Supabase Auth (já confirmada). O trigger cria public.users.
    let userId: string | null = null;
    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { fname: student.name, usertype: 'aluno' },
    });

    if (createdUser?.user) {
      userId = createdUser.user.id;
    } else if (createErr && /already|registered|exists/i.test(createErr.message)) {
      // Já existe conta para este e-mail → localiza e redefine a senha.
      const { data: existing } = await admin
        .from('users')
        .select('idusers')
        .eq('email', email)
        .maybeSingle();
      if (existing?.idusers) {
        userId = existing.idusers as string;
        await admin.auth.admin.updateUserById(userId, { password });
      }
    }

    if (!userId) {
      console.error('Falha ao criar/localizar conta do aluno:', createErr?.message);
      return { error: 'Não foi possível ativar a conta de acesso do aluno.' };
    }

    // 2. Ativa o aluno e liga à própria conta (account_fk).
    const { error: updErr } = await admin
      .from('student')
      .update({ status: 'ativo', account_fk: userId })
      .eq('idstudent', idstudent);

    if (updErr) {
      return { error: 'Falha ao ativar o estado do estudante na base.' };
    }

    // 3. Gera cobrança automática (RF09) — passa o admin client (sem sessão).
    // idusers_fk é o PROFESSOR dono do aluno (student.idusers_fk), não o
    // `userId` recém-criado da conta do próprio aluno — usar o id errado aqui
    // gravava a fatura com o dono errado e ela nunca aparecia para o professor.
    await PaymentService.generateStudentCharges(idstudent, student.idusers_fk, admin);

    // 4. E-mail de boas-vindas (mesmo padrão dos cadastros): a conta nasce
    //    confirmada, então sem este envio a ativação não gerava nenhum e-mail.
    //    Depois da resposta: o aluno não espera o EmailJS para ver a ativação.
    await afterResponse(async () => {
      const { EmailService } = await import('@/services/email.service');
      await EmailService.sendNotification({
        toEmail: email,
        toName: student.name,
        title: 'Conta ativada!',
        message: `Olá, ${student.name}! Sua conta de aluno no Agenda Pro Music foi ativada.\n\nAcesse o painel para acompanhar suas aulas, faturas e notificações.`,
        buttonLabel: 'Acessar painel',
        buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.agendapromusic.com.br'}/login`,
      });
    });

    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Erro inesperado na confirmação.' };
  }
}
