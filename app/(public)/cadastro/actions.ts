'use server';

import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { afterResponse } from '@/lib/after-response';
import { isValidCPF, isValidEmail, isValidPhone, normalizePhoneForStorage } from '@/lib/utils';

export async function submitTeacherRegistration(formData: FormData) {
  try {
    const nome = formData.get('nome') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const telefone = normalizePhoneForStorage((formData.get('telefone') as string) || '');
    const instrumento = formData.get('instrumento') as string;
    const cidade = formData.get('cidade') as string;
    const experiencia = formData.get('experiencia') as string;

    if (!nome || !email || !telefone || !password) {
      return { error: 'Por favor, preencha todos os campos obrigatórios.' };
    }

    const cpf = formData.get('cpf') as string;
    if (!cpf || !isValidCPF(cpf)) {
      return { error: 'O CPF informado é inválido.' };
    }

    if (!isValidEmail(email)) {
      return { error: 'Por favor, use um e-mail com formato válido.' };
    }

    if (nome.trim().split(' ').length < 2) {
      return { error: 'O nome precisa estar completo.' };
    }

    if (!isValidPhone(telefone)) {
      return { error: 'Telefone inválido.' };
    }

    if (password.length < 6) {
      return { error: 'A senha deve ter no mínimo 6 caracteres.' };
    }

    // 1. Cria a conta JÁ confirmada via admin. Não depende do setting
    //    "Confirm email" e, para e-mail repetido, retorna erro claro — evita o
    //    "user fake" (identities vazio) que o signUp devolve com a confirmação
    //    de e-mail ligada. O professor NÃO é logado: aguarda aprovação do admin.
    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { fname: nome, usertype: 'professor' },
    });

    if (createErr || !created?.user) {
      if (/already|exists|registered|duplicate/i.test(createErr?.message || '')) {
        return { error: 'Este e-mail já está cadastrado.' };
      }
      console.error('Erro ao criar conta do professor:', createErr?.message);
      return { error: 'Falha ao criar a conta. Tente novamente.' };
    }

    const userId = created.user.id;

    // 2. Garante a linha em public.users (idempotente; o trigger normalmente já a
    //    cria com accountstatus=waiting_approvement). A FK teacher.idusers_fk ->
    //    users(idusers) exige que ela exista.
    const { error: userErr } = await admin.from('users').upsert(
      {
        idusers: userId,
        email,
        fname: nome,
        usertype: 'professor',
        accountstatus: 'waiting_approvement',
        ispremium: false,
      },
      { onConflict: 'idusers', ignoreDuplicates: true }
    );
    // Rollback: sem ele, uma falha adiante deixava conta auth órfã — o
    // professor não conseguia se recadastrar ("e-mail já cadastrado") nem
    // logar com perfil completo. Apagar a conta permite tentar de novo.
    const rollback = async () => {
      try {
        await admin.from('users').delete().eq('idusers', userId);
        await admin.auth.admin.deleteUser(userId);
      } catch (e: any) {
        console.error('Erro ao desfazer cadastro incompleto do professor:', e?.message);
      }
    };

    if (userErr) {
      console.error('Erro ao provisionar users do professor:', userErr.message);
      await rollback();
      return { error: 'Falha ao provisionar a conta do professor. Tente novamente.' };
    }

    // 3. Perfil do professor (via admin — confiável mesmo sem sessão ativa).
    const aggregatedInfo = `Cidade: ${cidade} | Experiência: ${experiencia}`;
    const { data: teacher, error: teacherError } = await admin
      .from('teacher')
      .insert([{
        cpf,
        info: aggregatedInfo,
        idusers_fk: userId,
        name: nome,
        phone: telefone,
        email,
      }])
      .select()
      .single();

    if (teacherError || !teacher) {
      console.error('Erro ao criar perfil de professor:', teacherError?.message);
      await rollback();
      if (/duplicate|unique/i.test(teacherError?.message || '')) {
        return { error: 'Este CPF já está cadastrado para outro professor.' };
      }
      return { error: 'Erro ao salvar o perfil de professor. Tente novamente.' };
    }

    // 3. Instrumento inicial (também via admin).
    if (instrumento) {
      await admin.from('instrument').insert([{
        nameinstrument: instrumento,
        hasstrings: instrumento === 'Violão' || instrumento === 'Guitarra' || instrumento === 'Baixo',
        haskeys: instrumento === 'Piano / Teclado',
        idteacher_fk: teacher.idteacher,
      }]);

      // Semeia teacher_pricing com preço 0 ("A combinar") para o instrumento
      // principal (is_primary). É essa tabela que alimenta o marketplace do aluno
      // e o dropdown da agenda, então sem esta linha o professor não apareceria
      // nas buscas até cadastrar em Configurações (onde ajusta o preço e pode
      // adicionar instrumentos secundários).
      await admin.from('teacher_pricing').insert([{
        idteacher_fk: teacher.idteacher,
        instrument: instrumento,
        price: 0,
        is_primary: true,
      }]);
    }

    // 4. E-mail de boas-vindas, pelo template genérico.
    // Os 2 slots do plano grátis do EmailJS são o genérico e a ativação de
    // aluno: não existe template dedicado a boas-vindas.
    // Depois da resposta: o professor não espera o EmailJS para ver a confirmação.
    if (email) {
      await afterResponse(async () => {
        const { EmailService } = await import('@/services/email.service');

        await EmailService.sendNotification({
          toEmail: email,
          toName: nome,
          title: 'Bem-vindo(a)!',
          message: `Olá, ${nome}! Sua conta no Agenda Pro Music está pronta.\n\nAcesse o painel para cadastrar seus alunos e organizar sua agenda.`,
          buttonLabel: 'Acessar painel',
          buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.agendapromusic.com.br'}/login`,
        });
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Teacher registration error:', err);
    return { error: err.message || 'Erro interno no servidor' };
  }
}

// Catálogo estático (muda só quando o admin edita): em cache por 60 s. Vazio não
// é cacheado (lança para o unstable_cache não gravar), então uma falha do banco
// não vira lista vazia por 1 min.
const cachedInstrumentCatalog = unstable_cache(
  async () => {
    // Página pública (sem sessão): lê o catálogo estático via admin client,
    // já que o RLS restringe a leitura a usuários autenticados.
    const admin = createAdminClient();
    const { data } = await admin.from('instrument_catalog').select('*').order('name');
    if (!data || data.length === 0) throw new Error('empty');
    return data;
  },
  ['public-instrument-catalog'],
  { revalidate: 60, tags: ['instrument-catalog'] }
);

export async function getAvailableInstruments() {
  try {
    return await cachedInstrumentCatalog();
  } catch {
    return [];
  }
}

/**
 * Tudo que a tela /cadastro precisa ao abrir, numa ida só (duas ações separadas
 * do cliente rodam em fila).
 */
export async function fetchTeacherRegistrationData() {
  const { getAvailableTeachers } = await import('../cadastro-aluno/actions');
  const [instruments, teachers] = await Promise.all([getAvailableInstruments(), getAvailableTeachers()]);
  return { instruments, teachers };
}
