'use server';

import { after } from 'next/server';
import { updateTag } from 'next/cache';
import { LessonService } from '@/services/lesson.service';
import { BlockedSlotService, DayOffService } from '@/services/blocked-slot.service';
import { checkTeacherAvailability, checkAvailabilityForDates } from '@/lib/teacher-availability';
import { StudentService } from '@/services/student.service';
import { syncStudentIntoLessons, syncStudentNameIntoAccount } from '@/services/student-sync.service';
import { InstrumentService } from '@/services/instrument.service';
import { LessonRequestService } from '@/services/lesson-request.service';
import { PaymentService } from '@/services/payment.service';
import { CreditService } from '@/services/credit.service';
import { NotificationService } from '@/services/notification.service';
import { emailStudent, emailTeacher, lessonObsForEmail, lessonMeetLineForEmail, lessonEmailCta, getTeacherMeetLink } from '@/lib/notify-email';
import { getSessionUser } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { AsaasClient, methodToBillingType } from '@/lib/asaas';
import { Lesson as UILesson } from '@/types/lesson';
import { Lesson as DBLesson, Student } from '@/types/database.types';
import { isValidCPF, isValidEmail, isValidPhone, unmask, normalizePhoneForStorage, getLocalISODate, normalizePaymentMethod, nowInSaoPaulo } from '@/lib/utils';
import { emailFailureText } from '@/lib/email-failure';
import { afterResponse } from '@/lib/after-response';
import { mapDbLessonToUI } from '@/lib/lesson-mapper';
import { buildAwaitingStudentRescheduleNote, isAwaitingStudentReschedule } from '@/lib/lesson-reschedule-release';
import type { InitialAppData } from '../initial-data';

function fmtDate(isoDate: string) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

// Resolve o aluno de uma aula: prioriza o vínculo por FK (student_fk) e cai
// para busca por nome (trim + ilike). `ambiguous` sinaliza homônimos — quem
// chama deve avisar o professor em vez de notificar o aluno errado ou calar.
async function resolveLessonStudent(
  lesson: { student_fk?: string | null; studentname?: string | null } | null,
  fallbackName: string,
  idusers: string
): Promise<{ student: Student | null; ambiguous: boolean }> {
  if (lesson?.student_fk) {
    const byId = await StudentService.getStudentById(lesson.student_fk);
    if (byId) return { student: byId, ambiguous: false };
  }
  const name = (lesson?.studentname ?? fallbackName ?? '').trim();
  if (!name) return { student: null, ambiguous: false };
  const matches = await StudentService.findStudentsByName(name, idusers);
  if (matches.length === 1) return { student: matches[0], ambiguous: false };
  return { student: null, ambiguous: matches.length > 1 };
}

export async function getActiveTeacherName(): Promise<string> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return '';
    return dbUser.fname;
  } catch (err) {
    console.error('Error fetching teacher name:', err);
    return '';
  }
}

export async function fetchAgendaStudents(): Promise<any[]> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return [];

    const dbStudents = await StudentService.getStudentsByUser(dbUser.idusers);

    return dbStudents.map(s => ({
      id: s.idstudent || '',
      name: s.name || '',
      phone: s.phone || '',
      email: s.email || '',
      instrument: s.instrument || 'Outros',
      cpf: s.cpf || '',
      packagetype: s.packagetype || 'avulsa',
      expirationdate: s.expirationdate || '',
      lessonPrice: s.lessonprice || 0,
      paymentMethod: (s.paymentmethod || 'Pix') as any,
      status: (s.status || 'ativo') as any,
      totalLessons: s.totallessons || 0,
      usedLessons: s.usedlessons || 0,
      notes: s.notes || '',
      discountType: (s.discount_type || 'percent') as any,
      discountValue: Number(s.discount_value) || 0,
    }));
  } catch (err: any) {
    console.error('Error fetching students:', err.message);
    return [];
  }
}

export async function createAgendaStudent(studentData: any): Promise<{ success: boolean; error?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: "Sessão inválida. Faça login novamente." };

    // Validação estrita de CPF
    if (studentData.cpf && !isValidCPF(studentData.cpf)) {
      return { success: false, error: "O CPF informado é inválido. Verifique os números." };
    }

    // Validação estrita de Email
    if (studentData.email && !isValidEmail(studentData.email)) {
      return { success: false, error: "O e-mail informado tem um formato inválido." };
    }

    if (!studentData.name || studentData.name.trim().split(' ').length < 2) {
      return { success: false, error: "O nome do aluno precisa estar completo (nome e sobrenome)." };
    }

    if (studentData.phone && !isValidPhone(studentData.phone)) {
      return { success: false, error: "O telefone informado é inválido." };
    }

    const alunosCount = await StudentService.getStudentCountByUser(dbUser.idusers);
    if (!dbUser.ispremium && alunosCount >= 2) {
      return { success: false, error: 'Plano gratuito permite apenas 2 alunos. Faça upgrade para adicionar mais.' };
    }

    let asaasCustomerId = null;
    if (process.env.ASAAS_API_KEY && studentData.email && studentData.cpf) {
      try {
        const customer = await AsaasClient.createCustomer({
          name: studentData.name,
          email: studentData.email,
          cpfCnpj: studentData.cpf,
          phone: studentData.phone || undefined,
        });
        asaasCustomerId = customer.id;
      } catch (err: any) {
        console.error('Failed to create Asaas customer:', err.message);
        // We continue anyway, but log the error
      }
    }

    const payload = {
      name: studentData.name,
      phone: studentData.phone ? normalizePhoneForStorage(studentData.phone) : null,
      email: studentData.email || null,
      cpf: studentData.cpf ? unmask(studentData.cpf) : null,
      instrument: studentData.instrument || 'Outros',
      lessonprice: studentData.lessonPrice || studentData.lessonprice || 0,
      packagetype: studentData.packagetype || 'avulsa',
      expirationdate: studentData.expirationdate || null,
      paymentmethod: studentData.paymentMethod || 'Pix',
      status: 'inativo', // Começa inativo até confirmar
      idusers_fk: dbUser.idusers,
      asaas_customer_id: asaasCustomerId,
      discount_type: studentData.discountType === 'fixed' ? 'fixed' : 'percent',
      discount_value: Math.max(0, Number(studentData.discountValue) || 0),
    };

    const { data: result, error: createError } = await StudentService.createStudent(payload as any);
    if (!result) {
      return {
        success: false,
        error: "O banco de dados recusou a criação do aluno. Verifique restrições." +
          (createError ? ` (${createError})` : ''),
      };
    }

    // Gerar link de ativação e logar (simulação de envio de e-mail)
    const activationLink = `${process.env.NEXT_PUBLIC_APP_URL || ''}/confirmar-aluno/${result.idstudent}`;
    console.log(`[EMAIL MOCK] Link de ativação para ${result.name}: ${activationLink}`);

    // [NOVO] Já tentar gerar a assinatura no Asaas automaticamente se for pacote (mensal/trimestral/semestral)
    try {
      await PaymentService.generateStudentCharges(result.idstudent as any, dbUser.idusers);
    } catch (e: any) {
      console.warn('Não foi possível gerar cobrança automática imediata:', e.message);
    }

    // `after`: envia depois da resposta sem bloquear a action. Uma promise solta
    // era congelada com a função serverless e o e-mail se perdia às vezes.
    const templateId = process.env.EMAILJS_TEMPLATE_STUDENT_CONFIRM;
    if (templateId && studentData.email) {
      after(async () => {
        const { EmailService } = await import('@/services/email.service');
        await EmailService.sendEmail(templateId, {
          student_name: studentData.name,
          student_email: studentData.email,
          teacher_name: dbUser.fname,
          activation_link: activationLink,
        });
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error creating student:', err.message);
    return { success: false, error: err.message };
  }
}

export async function updateAgendaStudent(
  id: string,
  studentData: any,
  opts?: { cancelFutureLessons?: boolean }
): Promise<{ success: boolean; error?: string; warning?: string; cancelledCount?: number }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão inválida.' };

    if (studentData.cpf && !isValidCPF(studentData.cpf)) {
      throw new Error("CPF inválido");
    }
    if (studentData.email && !isValidEmail(studentData.email)) {
      throw new Error("E-mail inválido");
    }
    
    if (studentData.phone && !isValidPhone(studentData.phone)) {
      throw new Error("Telefone inválido");
    }

    const existing = await StudentService.getStudentById(id);

    // A exigência de nome e sobrenome vale só quando o nome MUDA. Nomes de uma
    // palavra só entram por outros caminhos (o próprio aluno edita o perfil, o
    // painel admin) e, validados a cada save, travavam a ficha inteira: o
    // professor não conseguia nem corrigir o telefone sem antes renomear.
    const nameChanged =
      !!studentData.name && studentData.name.trim() !== (existing?.name || '').trim();
    if (nameChanged && studentData.name.trim().split(/\s+/).length < 2) {
      throw new Error("O nome precisa estar completo (nome e sobrenome)");
    }

    // `status` e `expirationdate` mudam por fora desta tela (baixa de pagamento,
    // cron de cobrança, webhook do Asaas) e o formulário do professor pode estar
    // exibindo um estado velho. Gravar os dois às cegas desfazia essas mudanças:
    //  - o formulário só conhece ativo/inativo, então salvar a ficha de um aluno
    //    'bloqueado' por inadimplência o liberava em silêncio;
    //  - uma tela carregada antes da baixa devolvia o vencimento antigo ao banco.
    // Regra: só aceitamos o que o professor de fato mexeu.
    const nextStatus = studentData.status || 'ativo';
    const status =
      existing?.status === 'bloqueado' && nextStatus === 'ativo'
        ? 'bloqueado'                 // desbloqueio só pelo Financeiro
        : nextStatus;

    // O cliente só envia `expirationdate` quando o professor mexeu no campo.
    // Ausente = mantém o que está no banco (que pode ter avançado por uma baixa
    // depois de a tela ter carregado). Comparar com o banco não serviria: uma
    // tela velha difere dele justamente por estar velha.
    const touchedExpiration = Object.prototype.hasOwnProperty.call(studentData, 'expirationdate');

    const updates = {
      name: studentData.name,
      phone: studentData.phone ? normalizePhoneForStorage(studentData.phone) : null,
      email: studentData.email || null,
      instrument: studentData.instrument || 'Outros',
      cpf: studentData.cpf ? unmask(studentData.cpf) : null,
      packagetype: studentData.packagetype || 'avulsa',
      ...(touchedExpiration ? { expirationdate: studentData.expirationdate || null } : {}),
      lessonprice: studentData.lessonPrice || 0,
      paymentmethod: studentData.paymentMethod || 'Pix',
      status,
      notes: studentData.notes || null,
      discount_type: studentData.discountType === 'fixed' ? 'fixed' : 'percent',
      discount_value: Math.max(0, Number(studentData.discountValue) || 0),
    };

    const result = await StudentService.updateStudent(id, updates as any);

    // Quando o professor altera o e-mail do aluno, espelhamos em `users` para
    // que o login do aluno (que consulta `users.email`) continue funcionando.
    // Sem isso, `getSessionStudent` deixa de encontrar o registro do aluno.
    if (result && existing?.email && updates.email && updates.email !== existing.email) {
      try {
        const supabase = await createClient();
        await supabase
          .from('users')
          .update({ email: updates.email })
          .eq('email', existing.email)
          .eq('usertype', 'aluno');
      } catch (e: any) {
        console.warn('Failed to sync user email after student email change:', e.message);
      }
    }

    // Reconcilia nome e instrumento nas aulas existentes. A aula guarda os dois
    // como cópia denormalizada (a agenda lê `lesson.instrument` direto, sem join
    // com student) — e roda em TODO save, não só quando o valor muda: aulas que
    // já estavam fora de sincronia (criadas com outro instrumento, ou editadas
    // antes da propagação existir) são reparadas ao simplesmente salvar o aluno.
    // O escopo por idusers_fk evita atingir o aluno homônimo de outro professor.
    let syncWarning: string | undefined;
    if (result && existing) {
      try {
        const sync = await syncStudentIntoLessons({
          studentId: id,
          teacherId: dbUser.idusers,
          previousName: existing.name,
          name: updates.name || existing.name,
          instrument: updates.instrument,
        });

        if (sync.error) {
          syncWarning = 'Aluno salvo, mas houve erro ao sincronizar as aulas dele na agenda.';
        } else if (sync.skippedAmbiguous) {
          syncWarning =
            'Há outro aluno com o mesmo nome: as aulas antigas sem vínculo não foram sincronizadas.';
        } else if (sync.blocked) {
          syncWarning = 'Aluno salvo, mas as aulas dele na agenda não puderam ser sincronizadas.';
        }

        // O nome também vive na conta de login do aluno, usada no portal dele.
        if (updates.name && existing.account_fk) {
          await syncStudentNameIntoAccount(existing.account_fk, updates.name);
        }

        // A tela do aluno lê as aulas por unstable_cache (revalidate 60s), que
        // guarda nome e `instrument` — sem invalidar, ele veria o valor antigo.
        updateTag('aluno-lessons');
      } catch (e: any) {
        console.error('Failed to reconcile student data into lessons:', e.message);
        syncWarning = 'Aluno salvo, mas houve erro ao sincronizar as aulas dele na agenda.';
      }
    }

    if (result && existing?.asaas_customer_id && process.env.ASAAS_API_KEY) {
      // Espelho no Asaas é best-effort (a falha só gera um warn): roda depois da
      // resposta em vez de somar uma chamada HTTP externa ao "Salvar" do professor.
      const asaasCustomerId = existing.asaas_customer_id;
      await afterResponse(async () => {
        try {
          await AsaasClient.updateCustomer(asaasCustomerId, {
            name: studentData.name,
            email: studentData.email || undefined,
            cpfCnpj: studentData.cpf || undefined,
            phone: studentData.phone || undefined,
          });
        } catch (e: any) {
          console.warn('Failed to update Asaas customer:', e.message);
        }
      });
    }

    // Inativação com cancelamento das aulas futuras (opt-in via confirm na UI).
    // Espelha applyOverdueConsequences: uma única notificação + e-mail com o
    // total, sem geração de crédito (encerramento pelo professor).
    let warning: string | undefined;
    let cancelledCount = 0;
    if (
      result &&
      opts?.cancelFutureLessons &&
      updates.status === 'inativo' &&
      existing &&
      existing.status !== 'inativo'
    ) {
      const supabase = await createClient();
      const today = getLocalISODate(nowInSaoPaulo());
      // O nome pode ter acabado de mudar no mesmo save; as aulas já foram
      // propagadas acima, então casamos pelo nome atualizado.
      const matchName = (updates.name || existing.name || '').trim();
      const { data: cancelledRows, error: cancelErr } = await supabase
        .from('lesson')
        .update({ lessonstatus: 'cancelada', obs: 'Cancelada — aluno inativado pelo professor' })
        .eq('idusers_fk', dbUser.idusers)
        .ilike('studentname', matchName)
        .in('lessonstatus', ['agendada', 'aguardando_pagamento'])
        .gte('date', today)
        .select('idlesson');

      if (cancelErr) {
        console.error('Error cancelling lessons on deactivation:', cancelErr.message);
        warning = 'Aluno inativado, mas houve erro ao cancelar as aulas futuras.';
      } else {
        cancelledCount = cancelledRows?.length ?? 0;
        if (cancelledCount > 0) {
          const msg = `Seu professor encerrou suas aulas: ${cancelledCount} aula(s) futura(s) foram canceladas.`;
          // Aviso in-app e e-mail são independentes: em paralelo.
          const [notif, emailRes] = await Promise.all([
            NotificationService.create({
              idstudent_fk: id,
              idusers_fk: dbUser.idusers,
              recipient: 'student',
              type: 'cancelamento',
              title: 'Aulas canceladas',
              message: msg,
            }),
            emailStudent(id, {
              title: 'Aulas canceladas',
              message: msg,
              buttonLabel: 'Ver minhas aulas',
              buttonPath: '/aluno/dashboard',
            }),
          ]);
          if (!notif) {
            warning = `${cancelledCount} aula(s) canceladas, mas a notificação no app não pôde ser gravada.`;
          } else if (!emailRes.ok) {
            warning = `${cancelledCount} aula(s) canceladas e aluno notificado no app, mas o e-mail falhou: ${emailFailureText(emailRes)}`;
          }
          updateTag('aluno-lessons');
        }
      }
    }

    // Gera a cobrança inicial quando o plano/preço só foi definido numa edição
    // posterior (ex.: aluno criado como avulsa e depois promovido a mensal) —
    // na criação (createAgendaStudent) isso já roda, aqui não rodava nunca.
    // generateStudentCharges já tem a checagem de "já existe pendente" embutida,
    // então é seguro chamar aqui mesmo sem saber se já foi cobrado antes.
    if (result && updates.packagetype !== 'avulsa' && Number(updates.lessonprice) > 0) {
      try {
        await PaymentService.generateStudentCharges(id, dbUser.idusers);
      } catch (e: any) {
        console.warn('Não foi possível gerar cobrança automática na edição:', e.message);
      }
    }

    return {
      success: !!result,
      warning: [syncWarning, warning].filter(Boolean).join(' ') || undefined,
      cancelledCount,
    };
  } catch (err: any) {
    console.error('Error updating student:', err.message);
    return { success: false, error: err.message };
  }
}

export async function deleteAgendaStudent(id: string): Promise<boolean> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return false;

    // As aulas não têm FK obrigatória para o aluno (vínculo por nome), então
    // excluir o aluno deixaria aulas futuras órfãs na agenda. Cancela antes.
    // O e-mail também vai antes: a notificação in-app seria apagada pelo
    // CASCADE do delete, então avisamos só por e-mail.
    const existing = await StudentService.getStudentById(id);
    if (existing?.name) {
      const supabase = await createClient();
      const today = getLocalISODate(nowInSaoPaulo());
      const { data: cancelledRows } = await supabase
        .from('lesson')
        .update({ lessonstatus: 'cancelada', obs: 'Cancelada — aluno removido pelo professor' })
        .eq('idusers_fk', dbUser.idusers)
        .ilike('studentname', existing.name.trim())
        .in('lessonstatus', ['agendada', 'aguardando_pagamento'])
        .gte('date', today)
        .select('idlesson');

      const count = cancelledRows?.length ?? 0;
      if (count > 0) {
        // Resultado ignorado: o e-mail sai depois da resposta.
        await afterResponse(() => emailStudent(id, {
          title: 'Aulas canceladas',
          message: `Seu professor encerrou suas aulas: ${count} aula(s) futura(s) foram canceladas.`,
        }));
        updateTag('aluno-lessons');
      }
    }

    return await StudentService.deleteStudent(id);
  } catch (err: any) {
    console.error('Error deleting student:', err.message);
    return false;
  }
}

export async function fetchAgendaInstruments(): Promise<string[]> {
  const fallback = ["violão", "guitarra", "piano", "canto", "bateria", "baixo", "cavaquinho", "banjo"];
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) {
      const catalog = await InstrumentService.getInstrumentCatalog();
      return catalog.length ? catalog.map(c => c.name.toLowerCase()) : fallback;
    }

    const { TeacherService } = await import('@/services/teacher.service');
    // Teacher e catalog em paralelo — eliminamos 1 round-trip sequencial
    const [teacher, catalog] = await Promise.all([
      TeacherService.getTeacherByUser(dbUser.idusers),
      InstrumentService.getInstrumentCatalog(),
    ]);

    if (teacher) {
      // Fonte única: os instrumentos que o professor ensina vivem em
      // `teacher_pricing` (mesma tabela do marketplace). Principal primeiro,
      // para virar a opção default do dropdown ao criar aula.
      const supabase = await createClient();
      const { data } = await supabase
        .from('teacher_pricing')
        .select('instrument')
        .eq('idteacher_fk', teacher.idteacher)
        .order('is_primary', { ascending: false })
        .order('instrument');

      const teacherInstruments = (data || []).map(i => (i.instrument as string).toLowerCase());
      if (teacherInstruments.length > 0) return teacherInstruments;
    }

    return catalog.length ? catalog.map(c => c.name.toLowerCase()) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Histórico COMPLETO de aulas do professor.
 *
 * ⚠️ Sem limite — o custo cresce indefinidamente com o histórico. Prefira
 * fetchAgendaLessonsInRange(); esta permanece só para fluxos que realmente
 * precisam de tudo. O boot do app usa a versão com janela.
 */
export async function fetchAgendaLessons(): Promise<UILesson[]> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return [];

    const dbLessons = await LessonService.getLessonsByUser(dbUser.idusers);
    return dbLessons.map(mapDbLessonToUI);
  } catch (err: any) {
    console.error('Error fetching agenda lessons:', err.message);
    return [];
  }
}

/** Aulas do professor dentro de uma janela de datas (inclusiva). */
export async function fetchAgendaLessonsInRange(fromISO: string, toISO: string): Promise<UILesson[]> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return [];

    const dbLessons = await LessonService.getLessonsByUserInRange(dbUser.idusers, fromISO, toISO);
    return dbLessons.map(mapDbLessonToUI);
  } catch (err: any) {
    console.error('Error fetching agenda lessons in range:', err.message);
    return [];
  }
}

/**
 * Tudo que a grade de uma semana precisa, numa ida só.
 * Antes eram duas chamadas separadas (aulas + horários bloqueados).
 */
export async function fetchAgendaWeek(weekDates: string[]): Promise<{
  lessons: UILesson[];
  blockedSlots: { id: string; date: string; starttime: string; endtime: string; reason?: string }[];
}> {
  if (!weekDates.length) return { lessons: [], blockedSlots: [] };
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { lessons: [], blockedSlots: [] };

    const from = weekDates[0];
    const to = weekDates[weekDates.length - 1];

    const [dbLessons, blockedSlots] = await Promise.all([
      LessonService.getLessonsByUserInRange(dbUser.idusers, from, to),
      BlockedSlotService.getByUserAndDates(dbUser.idusers, weekDates),
    ]);

    return { lessons: dbLessons.map(mapDbLessonToUI), blockedSlots: blockedSlots ?? [] };
  } catch (err: any) {
    console.error('Error fetching agenda week:', err.message);
    return { lessons: [], blockedSlots: [] };
  }
}

/**
 * Carrega tudo que o AppContext precisa no boot.
 *
 * A implementação vive em ../initial-data.ts (módulo comum) porque o LAYOUT
 * — um server component — chama a mesma função direto, sem round-trip HTTP.
 * Esta action permanece para o cliente pedir um refresh completo.
 */
export async function fetchInitialAppData(): Promise<InitialAppData> {
  const { loadInitialAppData } = await import('../initial-data');
  return loadInitialAppData();
}

// ============================================================
// Utilitário: verificar conflito de horário (RN: aulas não podem se sobrepor)
// A aritmética de sobreposição vive em lib/teacher-availability.ts, que é a
// única fonte de verdade — ela cobre aulas + horários bloqueados + folgas.
// ============================================================

/**
 * Verifica conflito de horário buscando só as aulas da data específica no banco.
 */
async function checkLessonConflict(
  idusers_fk: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeLessonId?: string
): Promise<{ reason: string; starttime: string; endtime: string } | null> {
  const result = await checkTeacherAvailability(idusers_fk, date, startTime, endTime, excludeLessonId);
  if (!result.available) {
    // Aqui é o lado do professor: pode ver o nome do aluno da aula conflitante.
    const reason = result.studentname ? `já existe uma aula de ${result.studentname}` : result.reason;
    return { reason, starttime: result.starttime, endtime: result.endtime };
  }
  return null;
}

/**
 * Cria a aula (com recorrência opcional). O SERVIDOR é a autoridade sobre
 * conflito: a checagem do cliente é só um atalho de UX e não enxerga aulas
 * fora da janela carregada.
 *
 * Devolve o motivo do conflito em vez de um boolean mudo — a mensagem chega
 * ao professor, que precisa saber com o quê bateu.
 */
export async function createAgendaLesson(
  uiLesson: UILesson,
  recurrenceWeeks: number = 1
): Promise<{ success: boolean; error?: string; conflictDate?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão inválida.' };

    // Gera todas as datas da recorrência (base + i*7 dias).
    const weeks = Math.max(1, recurrenceWeeks);
    const dates: string[] = [];
    for (let i = 0; i < weeks; i++) {
      if (i === 0) { dates.push(uiLesson.date); continue; }
      const d = new Date(`${uiLesson.date}T12:00:00Z`);
      d.setDate(d.getDate() + i * 7);
      dates.push(getLocalISODate(d));
    }

    // Checagem em lote (3 queries para N datas) cobrindo aulas + horários
    // bloqueados + dias de folga. Antes só olhava aulas, então dava para
    // agendar em cima do próprio bloqueio. All-or-nothing: se qualquer data
    // conflita, não cria nada.
    // A busca do aluno (abaixo) não depende do resultado do conflito: roda junto,
    // um round-trip a menos em TODA criação de aula. Se houver conflito ela é
    // simplesmente descartada.
    const [conflict, linkedStudent] = await Promise.all([
      checkAvailabilityForDates(
        dbUser.idusers,
        dates,
        uiLesson.startTime,
        uiLesson.endTime
      ),
      // Preenche student_fk quando o nome corresponde a um aluno cadastrado —
      // é ele que permite a RLS mostrar a aula na conta do aluno.
      StudentService.getStudentByName(uiLesson.studentName, dbUser.idusers),
    ]);
    if (conflict) {
      const quando = fmtDate(conflict.date);
      // Lado do professor: pode ver o nome do aluno da aula conflitante.
      const motivo = conflict.studentname
        ? `já existe uma aula de ${conflict.studentname}`
        : conflict.reason;
      return {
        success: false,
        conflictDate: conflict.date,
        error: `Conflito em ${quando}: ${motivo} das ${conflict.starttime} às ${conflict.endtime}.`,
      };
    }

    // Aulas cuja data cai depois do vencimento do plano do aluno viram
    // "aguardando_pagamento": o horário fica reservado na agenda (o professor
    // não perde o slot para outro aluno), mas só confirma quando o pagamento
    // renovar o período. Só se aplica quando o professor pediu 'agendada' —
    // se ele já escolheu 'aguardando_pagamento' manualmente, mantém.
    const expirationDate = linkedStudent?.expirationdate ?? null;
    const rows = dates.map(date => ({
      studentname: uiLesson.studentName,
      student_fk: linkedStudent?.idstudent ?? null,
      teachername: uiLesson.teacherName,
      instrument: uiLesson.instrument,
      date,
      starttime: uiLesson.startTime,
      endtime: uiLesson.endTime,
      datelesson: date ? new Date(`${date}T12:00:00Z`).toISOString() : null,
      lessonstatus: (uiLesson.status === 'agendada' && expirationDate && date > expirationDate
        ? 'aguardando_pagamento'
        : uiLesson.status) as any,
      obs: uiLesson.notes || '',
      idusers_fk: dbUser.idusers,
    }));
    const pendingCount = rows.filter(r => r.lessonstatus === 'aguardando_pagamento').length;
    const hasPendingBeyondExpiration = uiLesson.status === 'agendada' && pendingCount > 0;

    // Insert único em lote — antes era 1 insert por semana.
    const created = await LessonService.createMany(rows as any);
    const ok = created.length === rows.length;
    if (!ok) {
      return { success: false, error: 'Não foi possível gravar a aula no banco. Tente novamente.' };
    }

    // RF07: aula agendada notifica o aluno (in-app + e-mail) com instrumento,
    // data e hora — antes a aula só "aparecia" na agenda dele sem aviso.
    if (linkedStudent && uiLesson.status === 'agendada') {
      const firstBr = fmtDate(dates[0]);
      const confirmedCount = weeks - pendingCount;
      let scheduleMsg: string;
      if (hasPendingBeyondExpiration) {
        const expBr = expirationDate ? fmtDate(expirationDate) : '';
        scheduleMsg = `Suas aulas de ${uiLesson.instrument || 'música'} foram reservadas às ${uiLesson.startTime}, começando em ${firstBr}: ${confirmedCount} confirmada(s) até ${expBr}, e ${pendingCount} reservada(s) na agenda dependendo da renovação do plano.`;
      } else {
        scheduleMsg = weeks > 1
          ? `Suas aulas de ${uiLesson.instrument || 'música'} foram agendadas: ${weeks} semanas às ${uiLesson.startTime}, começando em ${firstBr}.`
          : `Sua aula de ${uiLesson.instrument || 'música'} foi agendada para ${firstBr} às ${uiLesson.startTime}.`;
      }
      await NotificationService.create({
        idstudent_fk: linkedStudent.idstudent,
        idusers_fk: dbUser.idusers,
        recipient: 'student',
        type: 'confirmacao',
        title: 'Aula agendada',
        message: scheduleMsg,
      });
      // E-mail (busca do link da sala + envio) depois da resposta: o professor
      // não precisa esperar o EmailJS para ver a aula criada na agenda.
      const linkedStudentId = linkedStudent.idstudent;
      await afterResponse(async () => {
        const meetLink = await getTeacherMeetLink(dbUser.idusers);
        await emailStudent(linkedStudentId, {
          title: 'Aula agendada',
          message: scheduleMsg + lessonMeetLineForEmail(meetLink) + lessonObsForEmail(uiLesson.notes),
          ...lessonEmailCta(meetLink),
        });
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error creating lesson:', err.message);
    return { success: false, error: 'Ocorreu um erro ao gravar a aula.' };
  }
}

export async function updateAgendaLesson(
  id: string,
  uiLesson: Partial<UILesson>
): Promise<{ success: boolean; warning?: string; error?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão inválida.' };
    let warning: string | undefined;

    // Busca a aula atual ANTES de qualquer escrita: serve tanto para validar o
    // conflito quanto para detectar mudança de status mais abaixo.
    const currentLesson = await LessonService.getLessonById(id);

    // Esta função gravava data/hora sem checar NADA — só o checkOverlap do
    // cliente segurava, e ele não enxerga aulas fora da janela carregada nem
    // horários bloqueados. O servidor precisa ser a autoridade.
    const nextDate = uiLesson.date ?? currentLesson?.date ?? '';
    const nextStart = uiLesson.startTime ?? currentLesson?.starttime ?? '';
    const nextEnd = uiLesson.endTime ?? currentLesson?.endtime ?? '';
    const nextStatus = uiLesson.status ?? currentLesson?.lessonstatus;

    const touchesSchedule =
      uiLesson.date !== undefined || uiLesson.startTime !== undefined || uiLesson.endTime !== undefined;
    const wasInactive =
      currentLesson?.lessonstatus === 'cancelada' || currentLesson?.lessonstatus === 'remarcada';
    const becomesActive = nextStatus !== 'cancelada' && nextStatus !== 'remarcada';

    // `wasInactive` importa: ao descancelar uma aula, o horário dela pode ter
    // sido ocupado enquanto estava cancelada.
    if (becomesActive && (touchesSchedule || wasInactive) && nextDate && nextStart) {
      const conflict = await checkLessonConflict(dbUser.idusers, nextDate, nextStart, nextEnd, id);
      if (conflict) {
        return {
          success: false,
          error: `Conflito de horário: ${conflict.reason} das ${conflict.starttime} às ${conflict.endtime} nesta data.`,
        };
      }
    }

    const dbPayload: Partial<DBLesson> = {};

    if (uiLesson.studentName !== undefined) dbPayload.studentname = uiLesson.studentName;
    if (uiLesson.teacherName !== undefined) dbPayload.teachername = uiLesson.teacherName;
    if (uiLesson.instrument !== undefined) dbPayload.instrument = uiLesson.instrument;
    if (uiLesson.date !== undefined) {
      dbPayload.date = uiLesson.date;
      dbPayload.datelesson = new Date(`${uiLesson.date}T12:00:00Z`).toISOString();
    }
    if (uiLesson.startTime !== undefined) dbPayload.starttime = uiLesson.startTime;
    if (uiLesson.endTime !== undefined) dbPayload.endtime = uiLesson.endTime;
    if (uiLesson.status !== undefined) dbPayload.lessonstatus = uiLesson.status as any;
    if (uiLesson.notes !== undefined) dbPayload.obs = uiLesson.notes;

    // A liberação para o aluno remarcar vive como marcador em `obs` (a tabela
    // não tem coluna para isso). O modal carrega esse texto no campo Notas, e
    // editar a aula sem mexer no status apagaria o marcador: a aula sairia da
    // seção de reposição do aluno e o crédito ficaria sem aula de onde ser
    // usado — a reposição sumiria em silêncio. Reaplica o prefixo.
    if (
      currentLesson?.lessonstatus === 'remarcada' &&
      isAwaitingStudentReschedule(currentLesson?.obs) &&
      nextStatus === 'remarcada' &&
      dbPayload.obs !== undefined &&
      !isAwaitingStudentReschedule(dbPayload.obs)
    ) {
      dbPayload.obs = buildAwaitingStudentRescheduleNote(dbPayload.obs);
    }

    const result = await LessonService.updateLesson(id, dbPayload);

    // RN03: Se a aula passou de qualquer status para 'cancelada', gerar crédito
    // de reposição — mas apenas no primeiro cancelamento do aluno (vitalício).
    if (result && uiLesson.status === 'cancelada' && currentLesson?.lessonstatus !== 'cancelada') {
      const { student, ambiguous } = await resolveLessonStudent(
        currentLesson,
        uiLesson.studentName ?? '',
        dbUser.idusers
      );
      if (!student) {
        const nome = (currentLesson?.studentname ?? uiLesson.studentName ?? '').trim();
        warning = ambiguous
          ? `Aula cancelada, mas há mais de um aluno chamado "${nome}" — nenhuma notificação foi enviada. Corrija o cadastro.`
          : `Aula cancelada, mas o aluno "${nome}" não foi encontrado no cadastro — nenhuma notificação foi enviada.`;
      }
      if (student) {
        const alreadyUsedBenefit = await CreditService.hasEverReceivedCancellationCredit(student.idstudent);
        if (!alreadyUsedBenefit) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          await CreditService.createCredit({
            idstudent_fk: student.idstudent,
            idusers_fk: dbUser.idusers,
            origin_lesson_fk: id,
            expires_at: getLocalISODate(expiresAt),
          });
        }
        // Identifica QUAL aula foi cancelada (instrumento, data e hora) — a
        // mensagem genérica "Sua aula foi cancelada" não dizia nada a quem tem
        // mais de um horário.
        const aulaDate = currentLesson?.date ?? uiLesson.date ?? '';
        const aulaTime = currentLesson?.starttime ?? uiLesson.startTime ?? '';
        const aulaInstr = currentLesson?.instrument ?? uiLesson.instrument ?? '';
        const aulaInfo = [
          aulaInstr ? `de ${aulaInstr}` : '',
          aulaDate ? `do dia ${fmtDate(aulaDate)}` : '',
          aulaTime ? `às ${aulaTime}` : '',
        ].filter(Boolean).join(' ');
        const creditoTxt = alreadyUsedBenefit ? '' : ' Um crédito de reposição (30 dias) foi gerado.';
        const cancelMsg = `Sua aula ${aulaInfo ? `${aulaInfo} ` : ''}foi cancelada.${creditoTxt}`;
        const cancelMsgProf = `A aula ${aulaInfo ? `${aulaInfo} ` : ''}com ${student.name} foi cancelada.${creditoTxt}`;
        // Os quatro envios são independentes: em paralelo custam um round-trip
        // em vez de quatro em fila. O e-mail do ALUNO fica aguardado porque o
        // resultado vira `warning`; o do professor (resultado ignorado) sai
        // depois da resposta.
        // O professor também recebe o registro (in-app + e-mail): o histórico
        // de qual aula caiu não pode viver só na cabeça de quem clicou.
        const [notif, emailRes] = await Promise.all([
          NotificationService.create({
            idstudent_fk: student.idstudent,
            idusers_fk: dbUser.idusers,
            recipient: 'student',
            type: 'cancelamento',
            title: 'Aula cancelada',
            message: cancelMsg,
          }),
          emailStudent(student.idstudent, {
            title: 'Aula cancelada',
            message: cancelMsg,
            buttonLabel: 'Ver minhas aulas',
            buttonPath: '/aluno/dashboard',
          }),
          NotificationService.create({
            idstudent_fk: student.idstudent,
            idusers_fk: dbUser.idusers,
            recipient: 'teacher',
            type: 'cancelamento',
            title: 'Aula cancelada',
            message: cancelMsgProf,
          }),
          afterResponse(() => emailTeacher(dbUser.idusers, {
            title: 'Aula cancelada',
            message: cancelMsgProf,
            buttonLabel: 'Abrir agenda',
            buttonPath: '/agenda',
          })),
        ]);
        if (!notif) {
          warning = 'Aula cancelada, mas a notificação no app não pôde ser gravada.';
        } else if (!emailRes.ok) {
          warning = `Aula cancelada e notificação enviada no app, mas o e-mail falhou: ${emailFailureText(emailRes)}`;
        }
      }
    }

    // Mudança de data/hora pela edição da aula: o aluno precisa ser avisado, e o
    // professor precisa do registro. Antes a edição movia a aula em silêncio —
    // o aluno só descobria abrindo o app.
    const scheduleChanged =
      result &&
      becomesActive &&
      ((uiLesson.date !== undefined && uiLesson.date !== currentLesson?.date) ||
        (uiLesson.startTime !== undefined && uiLesson.startTime !== currentLesson?.starttime));

    if (scheduleChanged) {
      const { student, ambiguous } = await resolveLessonStudent(
        currentLesson,
        uiLesson.studentName ?? '',
        dbUser.idusers
      );
      if (!student) {
        const nome = (currentLesson?.studentname ?? uiLesson.studentName ?? '').trim();
        warning = ambiguous
          ? `Horário alterado, mas há mais de um aluno chamado "${nome}" — nenhuma notificação foi enviada. Corrija o cadastro.`
          : `Horário alterado, mas o aluno "${nome}" não foi encontrado no cadastro — nenhuma notificação foi enviada.`;
      } else {
        const de = `${fmtDate(currentLesson?.date ?? '')} às ${currentLesson?.starttime ?? ''}`;
        const para = `${fmtDate(nextDate)} às ${nextStart}`;
        const instr = currentLesson?.instrument ?? uiLesson.instrument ?? '';
        const qual = instr ? ` de ${instr}` : '';

        const alunoMsg = `Sua aula${qual} mudou de ${de} para ${para}.`;
        const profMsg = `A aula${qual} com ${student.name} mudou de ${de} para ${para}.`;

        // Envios independentes, em paralelo (ver o bloco de cancelamento acima).
        const [notif, emailRes] = await Promise.all([
          NotificationService.create({
            idstudent_fk: student.idstudent,
            idusers_fk: dbUser.idusers,
            recipient: 'student',
            type: 'sistema',
            title: 'Horário da aula alterado',
            message: alunoMsg,
          }),
          emailStudent(student.idstudent, {
            title: 'Horário da aula alterado',
            message: alunoMsg,
            buttonLabel: 'Ver minhas aulas',
            buttonPath: '/aluno/aulas',
          }),
          NotificationService.create({
            idstudent_fk: student.idstudent,
            idusers_fk: dbUser.idusers,
            recipient: 'teacher',
            type: 'sistema',
            title: 'Horário da aula alterado',
            message: profMsg,
          }),
          afterResponse(() => emailTeacher(dbUser.idusers, {
            title: 'Horário da aula alterado',
            message: profMsg,
            buttonLabel: 'Abrir agenda',
            buttonPath: '/agenda',
          })),
        ]);

        if (!notif) {
          warning = 'Horário alterado, mas a notificação no app não pôde ser gravada.';
        } else if (!emailRes.ok) {
          warning = `Horário alterado e aluno notificado no app, mas o e-mail falhou: ${emailFailureText(emailRes)}`;
        }
      }
    }

    // Se a aula deixou de estar cancelada (descancelamento manual pelo professor),
    // revoga o crédito não usado que ela havia gerado — assim um cancelamento
    // revertido por engano não consome o benefício único do aluno.
    //
    // O mesmo vale para a aula liberada por "Deixar o aluno remarcar": ela fica
    // 'remarcada' com o marcador em `obs`, e voltar o status pelo dropdown
    // desfaz a liberação — sem revogar, o aluno ficaria com uma aula de graça.
    const undoneRelease =
      currentLesson?.lessonstatus === 'remarcada' &&
      isAwaitingStudentReschedule(currentLesson?.obs) &&
      uiLesson.status !== undefined &&
      uiLesson.status !== 'remarcada';

    if (
      result &&
      (undoneRelease ||
        (currentLesson?.lessonstatus === 'cancelada' &&
          uiLesson.status !== undefined &&
          uiLesson.status !== 'cancelada'))
    ) {
      await CreditService.revokeUnusedCreditByOriginLesson(id);
    }

    // A área do aluno lê aulas de um cache com tag — sem invalidar, o
    // cancelamento demoraria até 60s para sumir de "Minhas Aulas".
    if (result) updateTag('aluno-lessons');

    return { success: !!result, warning };
  } catch (err: any) {
    console.error('Error updating lesson:', err.message);
    return { success: false };
  }
}

/**
 * "Deixar o aluno remarcar": o aluno avisou que não pode vir e o professor
 * devolve a escolha do novo horário para ele.
 *
 * Difere dos dois caminhos que já existiam:
 * - `cancelada` também gera crédito, mas só no PRIMEIRO cancelamento da vida do
 *   aluno (RN03) e registra a aula como cancelamento, que não foi o que houve;
 * - `rescheduleLessonByTeacher` já remarca de fato, mas é o professor quem
 *   escolhe o novo horário.
 *
 * Aqui o crédito sai SEMPRE: quem autoriza é o professor, então a trava
 * vitalícia da RN03 (feita para o cancelamento pedido pelo aluno) não se aplica.
 * O aluno escolhe o horário na área dele e a solicitação ainda passa por
 * aprovação em /solicitacoes — o fluxo de reposição que já existe.
 */
export async function releaseLessonForStudentReschedule(
  lessonId: string,
  reason?: string
): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão inválida.' };

    const lesson = await LessonService.getLessonById(lessonId);
    if (!lesson) return { success: false, error: 'Aula não encontrada.' };
    if (lesson.idusers_fk !== dbUser.idusers) {
      return { success: false, error: 'Esta aula não pertence à sua agenda.' };
    }
    // Só aula agendada: em 'aguardando_pagamento' o aluno ainda não pagou, então
    // não há aula a compensar — o caminho ali é cancelar. E a checagem também é
    // a trava de idempotência: na segunda chamada o status já é 'remarcada'.
    if (lesson.lessonstatus !== 'agendada') {
      return {
        success: false,
        error: 'Só é possível liberar para remarcação uma aula com status "Agendada".',
      };
    }

    // Sem conseguir identificar o aluno não dá para avisá-lo nem creditar a
    // reposição — liberar assim deixaria a aula sumindo da agenda e o aluno sem
    // saber de nada. Melhor abortar e mandar o professor arrumar o cadastro.
    const { student, ambiguous } = await resolveLessonStudent(lesson, lesson.studentname ?? '', dbUser.idusers);
    if (!student) {
      const nome = (lesson.studentname ?? '').trim();
      return {
        success: false,
        error: ambiguous
          ? `Há mais de um aluno chamado "${nome}" no seu cadastro — corrija os nomes antes de liberar a remarcação.`
          : `O aluno "${nome}" não foi encontrado no seu cadastro. Cadastre-o para que ele possa remarcar.`,
      };
    }

    // ── Claim atômico ──
    // A transição 'agendada' → 'remarcada' é o mutex: duas abas liberando a
    // mesma aula gerariam dois créditos de reposição (duas aulas de graça).
    // Só quem vence o claim segue para criar o crédito.
    const claimed = await LessonService.claimLessonStatus(lessonId, 'agendada', {
      lessonstatus: 'remarcada',
      obs: buildAwaitingStudentRescheduleNote(reason),
    });
    if (!claimed) {
      return { success: false, error: 'Esta aula já foi alterada (talvez em outra aba). Atualize a página.' };
    }

    // Crédito de reposição de 30 dias, preso à aula de origem (é isso que o
    // distingue do crédito de pacote comprado, cujo origin_lesson_fk é nulo).
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    const expiresAtIso = getLocalISODate(expiresAt);

    if (!(await CreditService.hasCreditFromLesson(lessonId))) {
      const credit = await CreditService.createCredit({
        idstudent_fk: student.idstudent,
        idusers_fk: dbUser.idusers,
        origin_lesson_fk: lessonId,
        expires_at: expiresAtIso,
      });
      // Sem crédito, a aula liberada é só um horário perdido para o aluno —
      // desfaz o claim em vez de deixar o estado pela metade.
      if (!credit) {
        await LessonService.updateLesson(lessonId, {
          lessonstatus: 'agendada',
          obs: lesson.obs ?? '',
        });
        return { success: false, error: 'Não foi possível gerar o crédito de reposição. Tente novamente.' };
      }
    }

    const aulaInfo = [
      lesson.instrument ? `de ${lesson.instrument}` : '',
      lesson.date ? `do dia ${fmtDate(lesson.date)}` : '',
      lesson.starttime ? `às ${lesson.starttime}` : '',
    ].filter(Boolean).join(' ');
    const motivo = (reason ?? '').trim();
    const motivoTxt = motivo ? ` Motivo: ${motivo}.` : '';

    const alunoMsg =
      `Sua aula ${aulaInfo ? `${aulaInfo} ` : ''}foi liberada para remarcação. ` +
      `Você tem direito a 1 aula de reposição, sem cobrança adicional — escolha o novo horário em "Minhas Aulas" até ${fmtDate(expiresAtIso)}.${motivoTxt}`;
    const profMsg =
      `Você liberou a aula ${aulaInfo ? `${aulaInfo} ` : ''}de ${student.name} para remarcação. ` +
      `O horário está livre na sua agenda e o aluno recebeu 1 crédito de reposição válido até ${fmtDate(expiresAtIso)}. ` +
      `A remarcação vai aparecer em Solicitações para você aprovar.${motivoTxt}`;

    let warning: string | undefined;

    // O 'remarca' no título é o que faz getNotificationLink (NotificationBell)
    // mandar o aluno para /aluno/aulas ao clicar no sininho.
    // Envios independentes, em paralelo: e-mail do aluno aguardado (vira
    // `warning`), e-mail do professor depois da resposta.
    const [notif, emailRes] = await Promise.all([
      NotificationService.create({
        idstudent_fk: student.idstudent,
        idusers_fk: dbUser.idusers,
        recipient: 'student',
        type: 'sistema',
        title: 'Remarcação liberada — escolha um novo horário',
        message: alunoMsg,
      }),
      emailStudent(student.idstudent, {
        title: 'Remarcação liberada — escolha um novo horário',
        message: alunoMsg,
        buttonLabel: 'Escolher novo horário',
        buttonPath: '/aluno/aulas',
      }),
      NotificationService.create({
        idstudent_fk: student.idstudent,
        idusers_fk: dbUser.idusers,
        recipient: 'teacher',
        type: 'sistema',
        title: 'Aula liberada para remarcação',
        message: profMsg,
      }),
      afterResponse(() => emailTeacher(dbUser.idusers, {
        title: 'Aula liberada para remarcação',
        message: profMsg,
        buttonLabel: 'Abrir agenda',
        buttonPath: '/agenda',
      })),
    ]);

    if (!notif) {
      warning = 'Aula liberada, mas a notificação no app não pôde ser gravada. Avise o aluno.';
    } else if (!emailRes.ok) {
      warning = `Aula liberada e aluno avisado no app, mas o e-mail falhou: ${emailFailureText(emailRes)}`;
    }

    // A área do aluno lê aulas e créditos de caches com tag. O crédito é o que
    // libera a seção de reposição na tela do aluno, então invalidar só as aulas
    // deixaria o aviso escondido por até 60s.
    updateTag('aluno-lessons');
    updateTag('aluno-credits');
    return { success: true, warning };
  } catch (err: any) {
    console.error('Error releasing lesson for student reschedule:', err.message);
    return { success: false, error: 'Erro ao liberar a aula para remarcação.' };
  }
}

/**
 * Apaga aulas resolvendo antes tudo que aponta para elas — as três tabelas com
 * FK para lesson não têm ON DELETE, então qualquer referência pendurada derruba
 * o DELETE com violação de FK (23503) e o professor só vê "erro ao excluir":
 *
 * - credit.origin_lesson_fk  → apaga o crédito ainda não usado (libera o benefício);
 * - lesson_request.original_lesson_fk → zera o vínculo, preservando a solicitação;
 * - payment.lesson_fk        → zera o vínculo, preservando a cobrança (dinheiro
 *   registrado no financeiro não some junto com a aula).
 */
async function deleteLessonsWithCleanup(ids: string[], idusers: string): Promise<string[]> {
  if (!ids.length) return [];

  await Promise.all([
    CreditService.revokeUnusedCreditsByOriginLessons(ids),
    LessonRequestService.clearOriginalLessonRefs(ids),
    PaymentService.clearLessonRefs(ids),
  ]);

  const deletedIds = await LessonService.deleteMany(ids, idusers);

  // A área do aluno lê aulas de um cache com tag — sem invalidar, as aulas
  // apagadas continuariam aparecendo em "Minhas Aulas" por até 60s.
  if (deletedIds.length) updateTag('aluno-lessons');

  return deletedIds;
}

export async function deleteAgendaLesson(id: string): Promise<boolean> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return false;

    const deletedIds = await deleteLessonsWithCleanup([id], dbUser.idusers);
    return deletedIds.length > 0;
  } catch (err: any) {
    console.error('Error deleting lesson:', err.message);
    return false;
  }
}

/**
 * Escopo da exclusão, no espírito do Google Agenda:
 * - 'this'      → só a aula clicada;
 * - 'following' → a série: mesmo aluno, mesmo dia da semana e horário, desta data em diante;
 * - 'student'   → todas as aulas futuras do aluno, em qualquer dia/horário.
 */
export type DeleteLessonScope = 'this' | 'following' | 'student';

/** Dia da semana (0–6) lido ao meio-dia UTC, para nenhuma data escorregar de fuso. */
function isoWeekday(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** O mínimo de cada aula alcançada: o id apaga, a data e a hora viram texto no aviso ao aluno. */
type LessonBrief = { idlesson: string; date: string; starttime: string };

/** Carrega a aula com trava de dono — o id vem do cliente e a RLS não cobre o SELECT por id aqui. */
async function getOwnedLesson(id: string, idusers: string): Promise<DBLesson | null> {
  const lesson = await LessonService.getLessonById(id);
  if (!lesson || lesson.idusers_fk !== idusers) return null;
  return lesson;
}

/**
 * Monta, numa ida só ao banco, o alcance dos dois escopos em lote.
 *
 * A aula clicada entra sempre, mesmo com status fora da faixa apagável — foi
 * nela que o professor clicou. As demais saem de getDeletableLessonsForStudent,
 * que já protege 'realizada' e 'cancelada'.
 */
async function loadDeleteScopes(lesson: DBLesson, idusers: string): Promise<{
  baseDate: string;
  following: LessonBrief[];
  student: LessonBrief[];
} | null> {
  const baseDate = mapDbLessonToUI(lesson).date;
  if (!baseDate) return null;

  const base: LessonBrief = { idlesson: lesson.idlesson, date: baseDate, starttime: lesson.starttime || '' };

  // 'student' varre de hoje em diante (ou da própria aula, se ela for mais
  // antiga): limpar a agenda do aluno não pode depender de o professor ter
  // clicado justo na aula mais antiga da lista.
  const today = getLocalISODate(nowInSaoPaulo());
  const floor = baseDate < today ? baseDate : today;

  const candidates = await LessonService.getDeletableLessonsForStudent(idusers, lesson.studentname || '', floor);

  const following = new Map<string, LessonBrief>([[base.idlesson, base]]);
  const student = new Map<string, LessonBrief>([[base.idlesson, base]]);
  for (const c of candidates) {
    const cDate = mapDbLessonToUI(c).date;
    if (!cDate) continue;
    const brief: LessonBrief = { idlesson: c.idlesson, date: cDate, starttime: c.starttime || '' };
    student.set(brief.idlesson, brief);
    if (cDate >= baseDate && c.starttime === lesson.starttime && isoWeekday(cDate) === isoWeekday(baseDate)) {
      following.set(brief.idlesson, brief);
    }
  }

  return { baseDate, following: [...following.values()], student: [...student.values()] };
}

/**
 * Avisa o aluno (sino + e-mail) que aulas saíram da agenda.
 *
 * Vale só para a exclusão com escopo: ali some aula de verdade, marcada e
 * esperada. Os outros botões de excluir da agenda ("Liberar horário", registro
 * de aula remarcada) mexem em registro já cancelado e seguem silenciosos.
 */
async function notifyStudentOfDeletedLessons(
  lesson: DBLesson,
  removed: LessonBrief[],
  idusers: string
): Promise<void> {
  if (!removed.length) return;

  const { student, ambiguous } = await resolveLessonStudent(lesson, lesson.studentname || '', idusers);
  // Homônimo: avisar o aluno errado é pior que não avisar.
  if (!student || ambiguous) return;

  // Aula sem data legível fica fora da lista, mas continua contando: melhor um
  // aviso com uma data a menos que um "undefined/undefined" na caixa do aluno.
  const ordered = removed.filter(l => l.date).sort((a, b) => a.date.localeCompare(b.date));
  const label = (l: LessonBrief) => `${fmtDate(l.date)}${l.starttime ? ` às ${l.starttime}` : ''}`;

  const total = removed.length;
  const title = total > 1 ? 'Aulas removidas da agenda' : 'Aula removida da agenda';
  // Lote grande vira lista quilométrica no sino: mostra as primeiras e resume o resto.
  const shown = ordered.slice(0, 6).map(label);
  const rest = total - shown.length;
  const message = !shown.length
    ? `${total > 1 ? `${total} aulas foram removidas` : 'Uma aula foi removida'} da sua agenda.`
    : total === 1
      ? `Sua aula de ${shown[0]} foi removida da agenda pelo professor.`
      : `${total} aulas foram removidas da sua agenda: ${shown.join(', ')}${rest > 0 ? ` e mais ${rest}` : ''}.`;

  await NotificationService.create({
    idstudent_fk: student.idstudent,
    idusers_fk: idusers,
    recipient: 'student',
    type: 'cancelamento',
    title,
    message,
  });

  // `after` segura o runtime até o envio terminar: uma promise solta é congelada
  // assim que a action responde, e o e-mail chega ou não conforme o tempo do fetch.
  after(() =>
    emailStudent(student.idstudent, {
      title,
      message,
      buttonLabel: 'Ver minhas aulas',
      buttonPath: '/aluno/aulas',
    })
  );
}

/** Quantas aulas cada escopo levaria — o modal mostra o número antes de confirmar. */
export async function countAgendaLessonsForDelete(id: string): Promise<{ following: number; student: number } | null> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return null;

    const lesson = await getOwnedLesson(id, dbUser.idusers);
    if (!lesson) return null;

    const scopes = await loadDeleteScopes(lesson, dbUser.idusers);
    if (!scopes) return null;

    return { following: scopes.following.length, student: scopes.student.length };
  } catch (err: any) {
    console.error('Error counting lessons for delete:', err.message);
    return null;
  }
}

export async function deleteAgendaLessonScope(
  id: string,
  scope: DeleteLessonScope
): Promise<{ success: boolean; deletedIds: string[]; error?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, deletedIds: [], error: 'Sessão inválida.' };

    const lesson = await getOwnedLesson(id, dbUser.idusers);
    if (!lesson) return { success: false, deletedIds: [], error: 'Aula não encontrada.' };

    // Data e hora precisam ser lidas ANTES do delete — depois as linhas não existem
    // mais e o aviso ao aluno não teria como citar quais aulas saíram.
    let targets: LessonBrief[] = [
      { idlesson: id, date: mapDbLessonToUI(lesson).date, starttime: lesson.starttime || '' },
    ];
    if (scope !== 'this') {
      const scopes = await loadDeleteScopes(lesson, dbUser.idusers);
      if (!scopes) return { success: false, deletedIds: [], error: 'Aula não encontrada.' };
      targets = scope === 'following' ? scopes.following : scopes.student;
    }

    const deletedIds = await deleteLessonsWithCleanup(targets.map(t => t.idlesson), dbUser.idusers);
    if (!deletedIds.length) return { success: false, deletedIds: [], error: 'Erro ao excluir a aula.' };

    // Só o que o banco confirmou como apagado entra no aviso.
    const deleted = new Set(deletedIds);
    await notifyStudentOfDeletedLessons(lesson, targets.filter(t => deleted.has(t.idlesson)), dbUser.idusers);

    return { success: true, deletedIds };
  } catch (err: any) {
    console.error('Error deleting lessons in scope:', err.message);
    return { success: false, deletedIds: [], error: 'Erro ao excluir as aulas.' };
  }
}

// ============================================================
// Solicitações Pendentes (Fase 4 — RF03)
// ============================================================

export async function fetchPendingRequests(): Promise<any[]> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return [];

    // JOIN com student para trazer o nome em 1 única query
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson_request')
      .select('*, student:idstudent_fk(name)')
      .eq('idusers_fk', dbUser.idusers)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching pending requests:', error.message);
      return [];
    }

    return (data || []).map((r: any) => ({
      id: r.id,
      studentName: r.student?.name || 'Aluno',
      type: r.type,
      requestedDate: r.requested_date || '',
      requestedStartTime: r.requested_starttime || '',
      requestedEndTime: r.requested_endtime || '',
      instrument: r.instrument || '',
      reason: r.reason || '',
      createdAt: r.created_at,
    }));
  } catch (err: any) {
    console.error('Error fetching pending requests:', err.message);
    return [];
  }
}

export async function approveRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão inválida.' };

    const supabase = (await import('@/lib/supabase/server')).createClient;
    const db = await supabase();

    // Buscar a solicitação
    const { data: request } = await db.from('lesson_request').select('*').eq('id', requestId).single();
    if (!request) return { success: false, error: 'Solicitação não encontrada.' };
    if (request.status !== 'pendente') {
      return { success: false, error: 'Esta solicitação já foi processada.' };
    }

    const student = await StudentService.getStudentById(request.idstudent_fk);
    if (!student) return { success: false, error: 'Aluno não encontrado.' };

    // ── Revalidações (a aprovação pode ocorrer dias depois da criação) ──
    if (student.status === 'bloqueado') {
      return { success: false, error: 'O aluno está bloqueado por inadimplência. Regularize antes de aprovar.' };
    }

    const checksSchedule = request.type === 'agendamento' || request.type === 'remarcacao';
    const checksOrigLesson =
      (request.type === 'cancelamento' || request.type === 'remarcacao') && !!request.original_lesson_fk;

    if (checksSchedule) {
      // Horário solicitado já passou (fuso de São Paulo)
      const nowBrazil = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const todayStr = getLocalISODate(nowBrazil);
      const nowTimeStr = `${String(nowBrazil.getHours()).padStart(2, '0')}:${String(nowBrazil.getMinutes()).padStart(2, '0')}`;
      if (request.requested_date < todayStr ||
          (request.requested_date === todayStr && (request.requested_starttime || '') <= nowTimeStr)) {
        return { success: false, error: 'O horário solicitado já passou. Recuse a solicitação e peça ao aluno um novo horário.' };
      }
    }

    // As revalidações abaixo são LEITURAS independentes entre si (dívida,
    // conflito de horário, aula original, créditos). Em fila eram até quatro
    // round-trips antes de qualquer escrita; em paralelo custam um. O resultado
    // de cada uma é avaliado logo adiante na MESMA ordem de antes, então a
    // mensagem de erro devolvida ao professor não muda.
    const [hasDebt, conflict, origLessonRes, repoCredits, normalCredits] = await Promise.all([
      checksSchedule ? PaymentService.getStudentDebt(request.idstudent_fk) : null,
      checksSchedule
        ? checkLessonConflict(
            dbUser.idusers,
            request.requested_date,
            request.requested_starttime,
            request.requested_endtime,
            request.type === 'remarcacao' ? (request.original_lesson_fk || undefined) : undefined
          )
        : null,
      // Cancelamento/remarcação: a aula original precisa continuar ativa (pode
      // ter sido cancelada por inadimplência entre a criação e a aprovação).
      checksOrigLesson
        ? db.from('lesson').select('lessonstatus').eq('idlesson', request.original_lesson_fk).maybeSingle()
        : null,
      // Reposição: exige crédito de REPOSIÇÃO (gerado por cancelamento)
      request.type === 'agendamento' && request.original_lesson_fk
        ? CreditService.getActiveCredits(request.idstudent_fk, 'reposicao')
        : null,
      // Aula nova: crédito NORMAL (pacote comprado) abate a cobrança
      request.type === 'agendamento' && !request.original_lesson_fk
        ? CreditService.getActiveCredits(request.idstudent_fk, 'normal')
        : null,
    ]);

    if (checksSchedule) {
      if (hasDebt) {
        return { success: false, error: 'O aluno possui pagamentos em atraso. Regularize antes de aprovar novas aulas.' };
      }
      if (conflict) {
        return {
          success: false,
          error: `Conflito de horário: ${conflict.reason} das ${conflict.starttime} às ${conflict.endtime} nesta data. Escolha outro horário.`
        };
      }
    }

    if (checksOrigLesson) {
      const origLesson = origLessonRes?.data;
      if (!origLesson || !['agendada', 'aguardando_pagamento'].includes(origLesson.lessonstatus)) {
        return { success: false, error: 'A aula original não está mais ativa (foi cancelada ou remarcada). Recuse a solicitação.' };
      }
    }

    // Pré-seleção de créditos (sem efeito colateral, antes do claim)
    let repoCredit: { id: string } | null = null;
    let normalCredit: { id: string } | null = null;
    if (request.type === 'agendamento') {
      if (request.original_lesson_fk) {
        if (!repoCredits || repoCredits.length === 0) {
          return { success: false, error: 'O aluno não possui crédito de reposição disponível.' };
        }
        repoCredit = repoCredits.find(c => c.origin_lesson_fk === request.original_lesson_fk) ?? repoCredits[0];
      } else {
        normalCredit = normalCredits?.[0] ?? null;
      }
    }

    // ── Claim atômico: marca 'aprovada' somente se ainda 'pendente'. ──
    // Sem isso, duas abas aprovando a mesma solicitação criavam aula e
    // cobrança duplicadas. Em falha adiante, devolvemos para 'pendente'.
    const claimed = await LessonRequestService.claimRequest(requestId, 'aprovada');
    if (!claimed) {
      return { success: false, error: 'Esta solicitação já foi processada (talvez em outra aba).' };
    }

    try {

    if (request.type === 'agendamento') {
      if (request.original_lesson_fk && repoCredit) {
        // ── Reposição via crédito de cancelamento (sem cobrança) ──
        const createdLesson = await LessonService.createLesson({
          studentname: student.name,
          student_fk: request.idstudent_fk,
          teachername: dbUser.fname,
          instrument: request.instrument || student.instrument || '',
          date: request.requested_date,
          starttime: request.requested_starttime,
          endtime: request.requested_endtime,
          datelesson: new Date(`${request.requested_date}T12:00:00Z`).toISOString(),
          lessonstatus: 'agendada' as any,
          obs: 'Reposição de aula cancelada',
          idusers_fk: dbUser.idusers,
        } as any);

        // Só consome o crédito com a aula garantida — antes, uma falha aqui
        // queimava o crédito do aluno sem criar aula nenhuma.
        if (!createdLesson) {
          await LessonRequestService.releaseRequest(requestId);
          return { success: false, error: 'Erro ao criar a aula de reposição. Tente novamente.' };
        }

        const consumed = await CreditService.useCredit(repoCredit.id);
        if (!consumed) {
          // Crédito foi consumido por outra execução — desfaz a aula.
          await LessonService.deleteLesson(createdLesson.idlesson);
          await LessonRequestService.releaseRequest(requestId);
          return { success: false, error: 'O crédito de reposição já foi utilizado. Atualize a página.' };
        }

        // Marca a aula original como remarcada: sai do histórico de canceladas
        // e não permite uma nova reposição em cima dela.
        await LessonService.updateLesson(request.original_lesson_fk, { lessonstatus: 'remarcada' as any });

        const reposMsg = `Sua reposição foi agendada para ${fmtDate(request.requested_date)} às ${request.requested_starttime}. Sem cobrança adicional.`;
        await NotificationService.create({
          idstudent_fk: request.idstudent_fk,
          idusers_fk: dbUser.idusers,
          recipient: 'student',
          type: 'confirmacao',
          title: 'Reposição aprovada!',
          message: reposMsg,
        });
        // Espelha por e-mail ao aluno (igual cancelamento/remarcação) — depois
        // da resposta: a aprovação não espera o EmailJS.
        await afterResponse(() => emailStudent(request.idstudent_fk, {
          title: 'Reposição aprovada!',
          message: reposMsg,
          buttonLabel: 'Ver minhas aulas',
          buttonPath: '/aluno/dashboard',
        }));
      } else if (normalCredit) {
        // ── Aula nova coberta por crédito de pacote comprado (sem cobrança) ──
        const createdLesson = await LessonService.createLesson({
          studentname: student.name,
          student_fk: request.idstudent_fk,
          teachername: dbUser.fname,
          instrument: request.instrument || student.instrument || '',
          date: request.requested_date,
          starttime: request.requested_starttime,
          endtime: request.requested_endtime,
          datelesson: new Date(`${request.requested_date}T12:00:00Z`).toISOString(),
          lessonstatus: 'agendada' as any,
          obs: 'Aula coberta por crédito do pacote',
          idusers_fk: dbUser.idusers,
        } as any);

        if (!createdLesson) {
          await LessonRequestService.releaseRequest(requestId);
          return { success: false, error: 'Erro ao criar a aula. Tente novamente.' };
        }

        const consumed = await CreditService.useCredit(normalCredit.id);
        if (!consumed) {
          await LessonService.deleteLesson(createdLesson.idlesson);
          await LessonRequestService.releaseRequest(requestId);
          return { success: false, error: 'O crédito do aluno já foi utilizado. Atualize a página e tente de novo.' };
        }

        const creditMsg = `Sua aula de ${request.instrument || student.instrument} em ${fmtDate(request.requested_date)} às ${request.requested_starttime} foi agendada usando 1 crédito do seu pacote. Sem cobrança adicional.`;
        await NotificationService.create({
          idstudent_fk: request.idstudent_fk,
          idusers_fk: dbUser.idusers,
          recipient: 'student',
          type: 'confirmacao',
          title: 'Aula agendada com crédito!',
          message: creditMsg,
        });
        await afterResponse(() => emailStudent(request.idstudent_fk, {
          title: 'Aula agendada com crédito!',
          message: creditMsg,
          buttonLabel: 'Ver minhas aulas',
          buttonPath: '/aluno/dashboard',
        }));
      } else {
        // Agendamento normal com cobrança
        const lessonPrice = student.lessonprice || 0;
        const dueDate = request.requested_date;

        const newLesson = await LessonService.createLesson({
          studentname: student.name,
          student_fk: request.idstudent_fk,
          teachername: dbUser.fname,
          instrument: request.instrument || student.instrument || '',
          date: request.requested_date,
          starttime: request.requested_starttime,
          endtime: request.requested_endtime,
          datelesson: new Date(`${request.requested_date}T12:00:00Z`).toISOString(),
          lessonstatus: 'aguardando_pagamento' as any,
          obs: '',
          idusers_fk: dbUser.idusers,
        } as any);

        // Gerar cobrança vinculada à aula
        let asaasPaymentId = '';
        let asaasInvoiceUrl = '';
        let asaasPixQrcode = '';
        let asaasPixPayload = '';

        if (process.env.ASAAS_API_KEY && student.asaas_customer_id && lessonPrice > 0) {
          try {
            const asaasPayment = await AsaasClient.createPayment({
              customer: student.asaas_customer_id,
              billingType: 'PIX',
              value: lessonPrice,
              dueDate,
              description: `Aula de ${request.instrument || student.instrument} — ${request.requested_date} às ${request.requested_starttime}`,
            });
            asaasPaymentId = asaasPayment.id;
            asaasInvoiceUrl = asaasPayment.invoiceUrl;
            try {
              const pixData = await AsaasClient.getPixQrCode(asaasPaymentId);
              asaasPixQrcode = pixData.encodedImage;
              asaasPixPayload = pixData.payload;
            } catch {}
          } catch (e: any) {
            console.warn('Asaas payment creation failed:', e.message);
          }
        }

        await PaymentService.createPayment({
          idstudent_fk: student.idstudent,
          idusers_fk: dbUser.idusers,
          amount: lessonPrice,
          duedate: dueDate,
          status: 'pendente',
          paymentdate: undefined,
          method: (student.paymentmethod as any) || 'pix',
          notes: `Aula de ${request.instrument || student.instrument} em ${request.requested_date} às ${request.requested_starttime}`,
          fine: 0,
          interest: 0,
          lesson_fk: newLesson?.idlesson || undefined,
          asaas_payment_id: asaasPaymentId || undefined,
          asaas_invoice_url: asaasInvoiceUrl || undefined,
          asaas_pix_qrcode: asaasPixQrcode || undefined,
          asaas_pix_payload: asaasPixPayload || undefined,
        } as any);

        // Notificar aluno
        await NotificationService.create({
          idstudent_fk: request.idstudent_fk,
          idusers_fk: dbUser.idusers,
          recipient: 'student',
          type: 'cobranca',
          title: 'Professor confirmou! Pague para agendar.',
          message: `Sua aula de ${request.instrument || student.instrument} em ${fmtDate(request.requested_date)} às ${request.requested_starttime} foi aprovada. Acesse Financeiro para pagar e confirmar o agendamento.`,
        });

        // Espelha a notificação por e-mail ao aluno.
        await afterResponse(() => emailStudent(request.idstudent_fk, {
          title: 'Professor confirmou! Pague para agendar',
          message: `Sua aula de ${request.instrument || student.instrument} em ${fmtDate(request.requested_date)} às ${request.requested_starttime} foi aprovada. Acesse Financeiro para pagar e confirmar o agendamento.`,
          buttonLabel: 'Pagar e agendar',
          buttonPath: '/aluno/dashboard',
        }));
      }

    } else if (request.type === 'cancelamento') {
      // Busca a aula ANTES de cancelar — os dados (instrumento, data, hora)
      // identificam qual aula caiu nas notificações abaixo.
      const origLesson = request.original_lesson_fk
        ? await LessonService.getLessonById(request.original_lesson_fk)
        : null;

      // Cancelar a aula original
      if (request.original_lesson_fk) {
        await LessonService.updateLesson(request.original_lesson_fk, { lessonstatus: 'cancelada' as any });
      }

      // RN03: Gerar crédito de reposição (30 dias) — só no primeiro cancelamento
      // do aluno (vitalício). A partir do segundo, cancela mas não gera crédito.
      // O índice único credit_one_cancellation_benefit é o backstop contra a
      // corrida de dois cancelamentos simultâneos: o segundo insert falha e
      // createCredit retorna null — tratamos como benefício já concedido.
      const alreadyUsedBenefit = await CreditService.hasEverReceivedCancellationCredit(request.idstudent_fk);
      let creditGranted = false;
      if (!alreadyUsedBenefit) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const created = await CreditService.createCredit({
          idstudent_fk: request.idstudent_fk,
          idusers_fk: dbUser.idusers,
          origin_lesson_fk: request.original_lesson_fk || undefined,
          expires_at: getLocalISODate(expiresAt),
        });
        creditGranted = !!created;
      }

      const aulaInfo = origLesson
        ? [
            origLesson.instrument ? `de ${origLesson.instrument}` : '',
            origLesson.date ? `do dia ${fmtDate(origLesson.date)}` : '',
            origLesson.starttime ? `às ${origLesson.starttime}` : '',
          ].filter(Boolean).join(' ')
        : '';
      const creditoTxt = creditGranted ? ' Um crédito de reposição (30 dias) foi gerado.' : '';
      const cancelMsg = `Sua aula ${aulaInfo ? `${aulaInfo} ` : ''}foi cancelada.${creditoTxt}`;
      const cancelMsgProf = `A aula ${aulaInfo ? `${aulaInfo} ` : ''}com ${origLesson?.studentname || 'o aluno'} foi cancelada (solicitação aprovada).${creditoTxt}`;
      // Os dois avisos in-app são independentes: um round-trip em vez de dois.
      // Registro para o professor (in-app + e-mail) com a identificação da aula.
      await Promise.all([
        NotificationService.create({
          idstudent_fk: request.idstudent_fk,
          idusers_fk: dbUser.idusers,
          recipient: 'student',
          type: 'cancelamento',
          title: 'Cancelamento aprovado',
          message: cancelMsg,
        }),
        NotificationService.create({
          idstudent_fk: request.idstudent_fk,
          idusers_fk: dbUser.idusers,
          recipient: 'teacher',
          type: 'cancelamento',
          title: 'Aula cancelada',
          message: cancelMsgProf,
        }),
      ]);
      // E-mails (aluno e professor) depois da resposta, numa tarefa só e em
      // sequência: callbacks de after() podem rodar concorrentes, e o EmailJS
      // limita a taxa de envio.
      await afterResponse(async () => {
        await emailStudent(request.idstudent_fk, {
          title: 'Cancelamento aprovado',
          message: cancelMsg,
          buttonLabel: 'Ver minhas aulas',
          buttonPath: '/aluno/dashboard',
        });
        await emailTeacher(dbUser.idusers, {
          title: 'Aula cancelada',
          message: cancelMsgProf,
          buttonLabel: 'Abrir agenda',
          buttonPath: '/agenda',
        });
      });

    } else if (request.type === 'remarcacao') {
      // Conflito e validade da aula original já foram checados antes do claim.
      // Criar a aula nova PRIMEIRO; só então marcar a original como remarcada —
      // se a criação falhar, a original permanece intacta na agenda.
      const createdLesson = await LessonService.createLesson({
        studentname: student.name,
        student_fk: request.idstudent_fk,
        teachername: dbUser.fname,
        instrument: request.instrument || student.instrument || '',
        date: request.requested_date,
        starttime: request.requested_starttime,
        endtime: request.requested_endtime,
        datelesson: new Date(`${request.requested_date}T12:00:00Z`).toISOString(),
        lessonstatus: 'agendada' as any,
        obs: 'Remarcação aprovada',
        idusers_fk: dbUser.idusers,
      } as any);

      if (!createdLesson) {
        await LessonRequestService.releaseRequest(requestId);
        return { success: false, error: 'Erro ao criar a aula remarcada. Tente novamente.' };
      }

      if (request.original_lesson_fk) {
        await LessonService.updateLesson(request.original_lesson_fk, { lessonstatus: 'remarcada' as any });
      }

      const remarcMsg = `Sua aula foi remarcada para ${fmtDate(request.requested_date)} às ${request.requested_starttime}.`;
      await NotificationService.create({
        idstudent_fk: request.idstudent_fk,
        idusers_fk: dbUser.idusers,
        recipient: 'student',
        type: 'confirmacao',
        title: 'Remarcação aprovada',
        message: remarcMsg,
      });
      await afterResponse(() => emailStudent(request.idstudent_fk, {
        title: 'Remarcação aprovada',
        message: remarcMsg,
        buttonLabel: 'Ver minhas aulas',
        buttonPath: '/aluno/dashboard',
      }));
    }

    // O claim no início já gravou 'aprovada'; invalida o cache de aulas do aluno.
    updateTag('aluno-lessons');
    return { success: true };

    } catch (innerErr) {
      // Falha depois do claim: devolve a solicitação para 'pendente' para o
      // professor poder tentar de novo, em vez de ficar 'aprovada' sem efeito.
      await LessonRequestService.releaseRequest(requestId);
      throw innerErr;
    }
  } catch (err: any) {
    console.error('Error approving request:', err.message);
    return { success: false, error: err.message };
  }
}

export async function rescheduleLessonByTeacher(
  lessonId: string,
  newDate: string,
  newStartTime: string,
  newEndTime: string,
  reason?: string
): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão inválida.' };

    const db = await createClient();

    const { data: original } = await db.from('lesson').select('*').eq('idlesson', lessonId).single();
    if (!original) return { success: false, error: 'Aula não encontrada.' };

    // A resolução do aluno (usada só nas notificações, mais abaixo) é uma leitura
    // independente do conflito: roda junto, um round-trip a menos por remarcação.
    const [conflict, resolvedStudent] = await Promise.all([
      checkLessonConflict(dbUser.idusers, newDate, newStartTime, newEndTime, lessonId),
      resolveLessonStudent(original, original.studentname ?? '', dbUser.idusers),
    ]);
    if (conflict) {
      return {
        success: false,
        error: `Conflito de horário: ${conflict.reason} das ${conflict.starttime} às ${conflict.endtime} nesta data.`,
      };
    }

    await db.from('lesson').update({ lessonstatus: 'remarcada' }).eq('idlesson', lessonId);

    await LessonService.createLesson({
      studentname: original.studentname,
      student_fk: original.student_fk ?? null,
      teachername: original.teachername,
      instrument: original.instrument,
      date: newDate,
      starttime: newStartTime,
      endtime: newEndTime,
      datelesson: new Date(`${newDate}T12:00:00Z`).toISOString(),
      lessonstatus: 'agendada' as any,
      obs: reason ? `Remarcada pelo professor: ${reason}` : 'Remarcada pelo professor',
      idusers_fk: dbUser.idusers,
    } as any);

    // Notifica o aluno se tiver conta
    let warning: string | undefined;
    const { student, ambiguous } = resolvedStudent;
    if (!student) {
      const nome = (original.studentname ?? '').trim();
      warning = ambiguous
        ? `Aula remarcada, mas há mais de um aluno chamado "${nome}" — nenhuma notificação foi enviada. Corrija o cadastro.`
        : `Aula remarcada, mas o aluno "${nome}" não foi encontrado no cadastro — nenhuma notificação foi enviada.`;
    }
    if (student) {
      const quando = `${fmtDate(newDate)} às ${newStartTime}`;
      const motivo = reason ? `. Motivo: ${reason}` : '';
      const remarcMsg = `Sua aula foi remarcada para ${quando}${motivo}.`;

      // O professor também recebe: a remarcação some da agenda dele e reaparece
      // noutro dia, e sem registro não há como conferir depois o que mudou.
      const teacherMsg = `Você remarcou a aula de ${student.name ?? original.studentname ?? 'aluno'} para ${quando}${motivo}.`;

      // Os dois INSERTs em `notification` correm em paralelo com a cadeia de
      // e-mails — antes eram quatro esperas em fila. Os e-mails continuam em
      // SEQUÊNCIA (aluno, depois professor) de propósito: o EmailJS limita a
      // taxa de envio e dois disparos simultâneos podem tomar 429. Os resultados
      // alimentam o `warning`, por isso seguem aguardados.
      // O insert em `notification` exige os DOIS FKs (aluno e professor);
      // `recipient` é o que separa a caixa de cada um.
      const [, , [emailRes, teacherEmailRes]] = await Promise.all([
        NotificationService.create({
          idstudent_fk: student.idstudent,
          idusers_fk: dbUser.idusers,
          recipient: 'student',
          type: 'sistema',
          title: 'Aula remarcada pelo professor',
          message: remarcMsg,
        }),
        NotificationService.create({
          idstudent_fk: student.idstudent,
          idusers_fk: dbUser.idusers,
          recipient: 'teacher',
          type: 'sistema',
          title: 'Aula remarcada',
          message: teacherMsg,
        }),
        (async () => {
          const toStudent = await emailStudent(student.idstudent, {
            title: 'Aula remarcada pelo professor',
            message: remarcMsg,
            buttonLabel: 'Ver minhas aulas',
            buttonPath: '/aluno/dashboard',
          });
          const toTeacher = await emailTeacher(dbUser.idusers, {
            title: 'Aula remarcada',
            message: teacherMsg,
            buttonLabel: 'Ver agenda',
            buttonPath: '/agenda',
          });
          return [toStudent, toTeacher] as const;
        })(),
      ]);
      if (!emailRes.ok) {
        warning = `Aula remarcada e aluno notificado no app, mas o e-mail falhou: ${emailFailureText(emailRes)}`;
      }
      if (!teacherEmailRes.ok && emailRes.ok) {
        warning = `Aula remarcada e aluno avisado, mas o e-mail de confirmação para você falhou: ${emailFailureText(teacherEmailRes)}`;
      }
    }

    updateTag('aluno-lessons');
    return { success: true, warning };
  } catch (err: any) {
    console.error('Error rescheduling lesson by teacher:', err.message);
    return { success: false, error: 'Erro ao remarcar aula.' };
  }
}

export async function rejectRequest(requestId: string): Promise<boolean> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return false;

    const supabase = (await import('@/lib/supabase/server')).createClient;
    const db = await supabase();
    const { data: request } = await db.from('lesson_request').select('idstudent_fk').eq('id', requestId).single();

    // Claim atômico: só recusa se ainda pendente (evita recusar por cima de
    // uma aprovação concorrente, o que apagaria a aula/cobrança já criadas).
    const claimed = await LessonRequestService.claimRequest(requestId, 'recusada');
    if (!claimed) return false;

    if (request?.idstudent_fk) {
      const recusaMsg = 'Sua solicitação de aula foi recusada pelo professor. Entre em contato para mais detalhes.';
      await NotificationService.create({
        idstudent_fk: request.idstudent_fk,
        idusers_fk: dbUser.idusers,
        recipient: 'student',
        type: 'sistema',
        title: 'Solicitação recusada',
        message: recusaMsg,
      });
      await afterResponse(() => emailStudent(request.idstudent_fk, {
        title: 'Solicitação recusada',
        message: recusaMsg,
        buttonLabel: 'Ver minhas aulas',
        buttonPath: '/aluno/dashboard',
      }));
    }

    return true;
  } catch (err: any) {
    console.error('Error rejecting request:', err.message);
    return false;
  }
}

// ============================================================
// Financeiro do Professor (Fase 6 — RF12)
// ============================================================

export async function fetchTeacherPayments(): Promise<any[]> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return [];

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payment')
      .select('id, idstudent_fk, amount, duedate, paymentdate, status, method, notes, renegotiated_from, student:idstudent_fk(name)')
      .eq('idusers_fk', dbUser.idusers)
      .order('duedate', { ascending: false });

    if (error) {
      console.error('Error fetching teacher payments:', error.message);
      return [];
    }

    return (data || []).map(p => ({
      id: p.id,
      idstudent_fk: p.idstudent_fk,
      studentName: (p.student as any)?.name || 'Aluno',
      amount: p.amount,
      duedate: p.duedate,
      paymentdate: p.paymentdate || '',
      status: p.status,
      method: p.method || '',
      notes: p.notes || '',
      renegotiated_from: p.renegotiated_from || null,
    }));
  } catch (err: any) {
    console.error('Error fetching teacher payments:', err.message);
    return [];
  }
}

export async function renegotiateOverduePayment(
  paymentId: string,
  newDueDate: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão inválida.' };
    return await PaymentService.renegotiatePayment(paymentId, newDueDate, notes, dbUser.idusers);
  } catch (err: any) {
    console.error('Error renegotiating payment:', err.message);
    return { success: false, error: 'Erro ao processar renegociação.' };
  }
}

export async function fetchTeacherDashboardMetrics() {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return null;

    const [payments, students, pendingRequests] = await Promise.all([
      PaymentService.getPaymentsByTeacher(dbUser.idusers),
      StudentService.getStudentsByUser(dbUser.idusers),
      LessonRequestService.getPendingRequests(dbUser.idusers),
    ]);

    const thisMonth = getLocalISODate().slice(0, 7); // YYYY-MM
    const monthlyRevenue = payments
      .filter(p => p.status === 'pago' && p.paymentdate?.startsWith(thisMonth))
      .reduce((acc, p) => acc + Number(p.amount), 0);

    const overdueCount = payments.filter(p => p.status === 'vencido').length;
    const pendingAmount = payments
      .filter(p => p.status === 'pendente')
      .reduce((acc, p) => acc + Number(p.amount), 0);

    return {
      monthlyRevenue,
      overdueCount,
      pendingAmount,
      totalStudents: students.length,
      activeStudents: students.filter(s => s.status === 'ativo').length,
      pendingRequests: pendingRequests.length,
    };
  } catch (err: any) {
    console.error('Error fetching dashboard metrics:', err.message);
    return null;
  }
}

export async function autoCreatePaymentForLesson(studentName: string): Promise<void> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return;

    const student = await StudentService.getStudentByName(studentName, dbUser.idusers);
    if (!student || !student.lessonprice || student.lessonprice <= 0) return;

    const pkg = (student.packagetype || 'avulsa').toLowerCase();
    const today = getLocalISODate(new Date());

    // Aluno avulso: professor já recebe o valor na hora da aula. O lançamento
    // nasce como 'pago' para não gerar uma "dívida" falsa no financeiro.
    // Mensalistas e alunos de pacote de créditos têm fatura própria gerada
    // separadamente — não duplicamos o lançamento aqui.
    const isAvulso = pkg === 'avulsa';

    await PaymentService.createPayment({
      idstudent_fk: student.idstudent,
      idusers_fk: dbUser.idusers,
      amount: student.lessonprice,
      duedate: today,
      status: isAvulso ? 'pago' : 'pendente',
      paymentdate: isAvulso ? today : null,
      method: (student.paymentmethod as any) || 'pix',
      notes: `Aula realizada em ${today}`,
      fine: 0,
      interest: 0,
    } as any);
  } catch (err: any) {
    console.error('Error auto-creating payment for lesson:', err.message);
  }
}

export async function updatePaymentStatusDB(
  paymentId: string,
  status: 'pago' | 'pendente' | 'vencido' | 'cancelado'
): Promise<boolean> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return false;

    // Confirmação de pagamento passa pelo caminho único de baixa
    // (mesmos efeitos da baixa automática do webhook).
    if (status === 'pago') {
      const result = await PaymentService.settlePayment(paymentId, {
        scopeTeacherId: dbUser.idusers,
      });
      return result.success;
    }

    const db = await createClient();
    const { error } = await db
      .from('payment')
      .update({ status })
      .eq('id', paymentId)
      .eq('idusers_fk', dbUser.idusers);
    return !error;
  } catch (err: any) {
    console.error('Error updating payment status:', err.message);
    return false;
  }
}

/**
 * Exclui um lançamento do financeiro (marca 'cancelado'). Para cobrança que não
 * deveria existir — ex.: o aluno comprou o pacote errado no portal e a dívida
 * indevida o mantém bloqueado.
 */
export async function cancelPaymentManually(
  paymentId: string,
  reason?: string
): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão expirada. Faça login novamente.' };

    return await PaymentService.cancelPayment(paymentId, {
      scopeTeacherId: dbUser.idusers,
      reason,
    });
  } catch (err: any) {
    console.error('Error cancelling payment:', err.message);
    return { success: false, error: 'Erro ao excluir o lançamento.' };
  }
}

/**
 * Baixa manual de um pagamento — para quando o aluno paga por fora da
 * plataforma (ex.: Pix direto na conta do professor). Além de marcar como
 * pago, cancela a cobrança aberta no Asaas para evitar pagamento duplicado.
 */
export async function settlePaymentManually(
  paymentId: string,
  opts: { method?: 'pix' | 'dinheiro' | 'transferencia'; paymentdate?: string; notes?: string } = {}
): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão expirada. Faça login novamente.' };

    const today = getLocalISODate(new Date());
    const paymentdate = opts.paymentdate && opts.paymentdate <= today ? opts.paymentdate : today;

    return await PaymentService.settlePayment(paymentId, {
      method: opts.method || 'pix',
      paymentdate,
      notes: opts.notes || 'Baixa manual — pagamento recebido fora da plataforma',
      scopeTeacherId: dbUser.idusers,
      cancelAsaasCharge: true,
    });
  } catch (err: any) {
    console.error('Error settling payment manually:', err.message);
    return { success: false, error: 'Erro ao dar baixa no pagamento.' };
  }
}

export async function createManualPayment(data: {
  studentName: string;
  amount: number;
  duedate: string;
  method: string;
  status: string;
  notes?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão inválida.' };

    const student = await StudentService.getStudentByName(data.studentName, dbUser.idusers);
    if (!student) return { success: false, error: 'Aluno não encontrado. Use o nome exato cadastrado.' };

    const payload: any = {
      idstudent_fk: student.idstudent,
      idusers_fk: dbUser.idusers,
      amount: data.amount,
      duedate: data.duedate,
      // Sempre nasce pendente — se já veio "pago", a baixa abaixo passa pelo
      // caminho único (settlePayment) para avançar vencimento/créditos.
      status: 'pendente',
      // A UI manda rótulos ("Pix", "Cartão"); o CHECK do banco exige minúsculo sem acento.
      method: normalizePaymentMethod(data.method),
      notes: data.notes || '',
      fine: 0,
      interest: 0,
    };

    const payment = await PaymentService.createPayment(payload);
    if (!payment) return { success: false, error: 'Erro ao criar lançamento.' };

    if (data.status === 'pago') {
      const result = await PaymentService.settlePayment(payment.id, {
        method: normalizePaymentMethod(data.method),
        paymentdate: getLocalISODate(new Date()),
        notes: data.notes,
        scopeTeacherId: dbUser.idusers,
      });
      if (!result.success) {
        return { success: false, error: result.error || 'Lançamento criado, mas a baixa falhou.' };
      }
    }

    return { success: true, id: payment.id };
  } catch (err: any) {
    console.error('Error creating manual payment:', err.message);
    return { success: false, error: err.message };
  }
}

export async function createGradeInvoices(
  studentId: string,
  months: number
): Promise<{ success: boolean; created: number; error?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, created: 0, error: 'Sessão inválida.' };

    const student = await StudentService.getStudentById(studentId);
    if (!student) return { success: false, created: 0, error: 'Aluno não encontrado.' };

    const pkg = (student.packagetype || 'avulsa').toLowerCase();
    if (pkg === 'avulsa') return { success: true, created: 0 };

    const amount = student.lessonprice || 0;
    if (amount <= 0) return { success: false, created: 0, error: 'Aluno sem valor de mensalidade configurado.' };

    const monthsToCreate = Math.max(1, months);
    const method = (student.paymentmethod || 'Pix') as string;

    const { NotificationService: NS } = await import('@/services/notification.service');

    const now = new Date();

    // Busca pagamentos existentes uma única vez antes do loop
    const existingPayments = await PaymentService.getPaymentsByStudent(student.idstudent);

    const paymentJobs: Promise<any>[] = [];
    const notifJobs: Promise<any>[] = [];
    let created = 0;

    for (let i = 0; i < monthsToCreate; i++) {
      const ref = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      const duedate = getLocalISODate(lastDay);
      const monthLabel = ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

      const alreadyExists = existingPayments.some(p =>
        p.duedate === duedate && p.status !== 'cancelado' && p.amount === amount
      );
      if (alreadyExists) continue;

      paymentJobs.push(PaymentService.createPayment({
        idstudent_fk: student.idstudent,
        idusers_fk: dbUser.idusers,
        amount,
        duedate,
        status: 'pendente',
        method,
        notes: `Mensalidade ${monthLabel} — gerada automaticamente`,
        fine: 0,
        interest: 0,
      } as any));

      const faturaMsg = `Sua mensalidade de ${monthLabel} (R$ ${amount.toFixed(2).replace('.', ',')}) está disponível para pagamento. Vencimento: ${duedate.split('-').reverse().join('/')}.`;
      notifJobs.push(NS.create({
        idstudent_fk: student.idstudent,
        idusers_fk: dbUser.idusers,
        recipient: 'student',
        type: 'cobranca',
        title: 'Nova fatura disponível',
        message: faturaMsg,
      }));
      notifJobs.push(emailStudent(student.idstudent, {
        title: 'Nova fatura disponível',
        message: faturaMsg,
        buttonLabel: 'Ver faturas',
        buttonPath: '/aluno/financeiro',
      }));

      created++;
    }

    // Insere todos os pagamentos e notificações em paralelo
    await Promise.all([...paymentJobs, ...notifJobs]);

    return { success: true, created };
  } catch (err: any) {
    console.error('Error creating grade invoices:', err.message);
    return { success: false, created: 0, error: err.message };
  }
}

export async function resendActivationEmail(studentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão inválida.' };

    const student = await StudentService.getStudentById(studentId);
    if (!student) return { success: false, error: 'Aluno não encontrado.' };
    if (!student.email) return { success: false, error: 'Aluno não possui e-mail cadastrado.' };
    if (student.status === 'ativo') return { success: false, error: 'Aluno já está ativo.' };

    const activationLink = `${process.env.NEXT_PUBLIC_APP_URL || ''}/confirmar-aluno/${studentId}`;
    const templateId = process.env.EMAILJS_TEMPLATE_STUDENT_CONFIRM;

    if (templateId) {
      const { EmailService } = await import('@/services/email.service');
      const sent = await EmailService.sendEmail(templateId, {
        student_name: student.name,
        student_email: student.email,
        teacher_name: dbUser.fname,
        activation_link: activationLink,
      });
      // Reenviar é a própria operação pedida: se o EmailJS recusou, dizer
      // "enviado" seria mentira — devolve o motivo real ao professor.
      if (!sent.ok) {
        const { emailFailureText } = await import('@/lib/email-failure');
        return { success: false, error: `O e-mail não foi enviado: ${emailFailureText(sent)}` };
      }
    } else {
      console.log(`[EMAIL MOCK] Reenvio para ${student.name}: ${activationLink}`);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error resending activation email:', err.message);
    return { success: false, error: err.message };
  }
}

export async function updateTeacherAvatar(avatarUrl: string) {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return false;

    const { TeacherService } = await import('@/services/teacher.service');
    const teacher = await TeacherService.getTeacherByUser(dbUser.idusers);
    if (!teacher) return false;

    const supabase = (await import('@/lib/supabase/server')).createClient;
    const db = await supabase();
    const { error } = await db
      .from('teacher')
      .update({ avatar_url: avatarUrl })
      .eq('idteacher', teacher.idteacher);

    return !error;
  } catch (err) {
    console.error('Error updating teacher avatar:', err);
    return false;
  }
}

// ============================================================
// Horários Bloqueados (indisponíveis)
// ============================================================

export async function fetchBlockedSlots(dates: string[]): Promise<{ id: string; date: string; starttime: string; endtime: string; reason?: string }[]> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return [];
    return await BlockedSlotService.getByUserAndDates(dbUser.idusers, dates);
  } catch {
    return [];
  }
}

export async function createBlockedSlot(data: {
  date?: string;
  starttime: string;
  endtime: string;
  reason?: string;
  wholeWeek?: boolean;
  weekDates?: string[];
  repeatWeeks?: number; // repete o bloqueio semanalmente a partir da data base
}): Promise<{ success: boolean; error?: string; slots?: { id: string; date: string; starttime: string; endtime: string; reason?: string }[] }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão inválida.' };

    let dates: string[];
    if (data.wholeWeek && data.weekDates) {
      dates = data.weekDates;
    } else if (data.date) {
      // Repetição semanal: gera N datas (a base + i*7 dias)
      const repeat = Math.max(1, data.repeatWeeks || 1);
      const [y, mo, d] = data.date.split('-').map(Number);
      dates = Array.from({ length: repeat }, (_, i) => getLocalISODate(new Date(y, mo - 1, d + i * 7)));
    } else {
      dates = [];
    }
    if (!dates.length) return { success: false, error: 'Nenhuma data informada.' };

    // Insert único em lote — antes eram N inserts sequenciais (lento ao repetir semanas).
    const created = await BlockedSlotService.createMany(
      dates.map(date => ({ idusers_fk: dbUser.idusers, date, starttime: data.starttime, endtime: data.endtime, reason: data.reason }))
    );

    if (!created.length) return { success: false, error: 'Erro ao criar bloqueio.' };
    return { success: true, slots: created };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteBlockedSlot(id: string): Promise<boolean> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return false;
    return await BlockedSlotService.delete(id, dbUser.idusers);
  } catch {
    return false;
  }
}

// Apaga toda a série de bloqueios recorrentes (a partir da data clicada,
// mesmo horário/motivo) — mesma geração de datas (base + i*7 dias) usada
// em createBlockedSlot, só que em sentido inverso.
export async function deleteBlockedSlotSeries(data: {
  date: string;
  starttime: string;
  endtime: string;
  reason?: string;
  weeks: number; // 4 = mensal, 12 = trimestral, 24 = semestral
}): Promise<{ success: boolean; error?: string; deletedIds?: string[] }> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return { success: false, error: 'Sessão inválida.' };

    const repeat = Math.max(1, data.weeks);
    const [y, mo, d] = data.date.split('-').map(Number);
    const dates = Array.from({ length: repeat }, (_, i) => getLocalISODate(new Date(y, mo - 1, d + i * 7)));

    const deletedIds = await BlockedSlotService.deleteSeries(dbUser.idusers, dates, data.starttime, data.endtime, data.reason);
    return { success: true, deletedIds };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchDaysOff(): Promise<{ id: string; day_of_week: number; reason?: string }[]> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return [];
    const result = await DayOffService.getByUser(dbUser.idusers);
    return result;
  } catch (err: any) {
    console.error('fetchDaysOff error:', err?.message);
    return [];
  }
}

/**
 * Bloqueios da semana + folgas semanais numa ida só. A agenda precisa dos dois
 * ao abrir; o Next despacha as server actions do cliente uma por vez, então duas
 * chamadas separadas pagavam dois round-trips (cada um com validação de sessão).
 */
export async function fetchAgendaMeta(dates: string[]): Promise<{
  blockedSlots: { id: string; date: string; starttime: string; endtime: string; reason?: string }[];
  daysOff: { id: string; day_of_week: number; reason?: string }[];
}> {
  const [blockedSlots, daysOff] = await Promise.all([fetchBlockedSlots(dates), fetchDaysOff()]);
  return { blockedSlots, daysOff };
}

export async function toggleDayOff(day_of_week: number, active: boolean, reason?: string): Promise<boolean> {
  try {
    const dbUser = await getSessionUser();
    if (!dbUser) return false;
    if (active) {
      const ok = await DayOffService.upsert(dbUser.idusers, day_of_week, reason);
      if (!ok) console.error('toggleDayOff upsert failed for day', day_of_week);
      return ok;
    }
    return await DayOffService.remove(dbUser.idusers, day_of_week);
  } catch (err: any) {
    console.error('toggleDayOff error:', err?.message);
    return false;
  }
}
