'use server';

import { updateTag } from 'next/cache';
import { getSessionUser, getSessionStudent } from '@/lib/session';
import { PaymentService } from '@/services/payment.service';
import { CreditPackageService } from '@/services/credit-package.service';
import { CreditService } from '@/services/credit.service';
import { NotificationService } from '@/services/notification.service';
import { LessonRequestService } from '@/services/lesson-request.service';
import { autoMarkPastLessonsAsRealizada } from '@/services/lesson-autocomplete.service';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { emailTeacher, getTeacherMeetLink } from '@/lib/notify-email';
import { afterResponse } from '@/lib/after-response';
import { getLocalISODate, addMonthsKeepDay, projectNextMensalidadeDue, nowInSaoPaulo } from '@/lib/utils';
import { checkTeacherAvailability } from '@/lib/teacher-availability';
import { isAwaitingStudentReschedule } from '@/lib/lesson-reschedule-release';
import {
  cachedLessonsByStudentName,
  cachedPaymentsByStudent,
  cachedActiveCredits,
  cachedNotificationsByStudent,
  cachedLessonsByUserAndDate,
  cachedUpcomingLessonsWithPayments,
} from '@/lib/aluno-cache';

// Aluno da sessão já vinculado a um professor (idusers_fk garantido).
// student.idusers_fk é nulo até o aluno se vincular pelo marketplace, e as
// ações de aula/agenda só fazem sentido com o vínculo.
const getLinkedStudent = async () => {
  const s = await getSessionStudent();
  return s && s.idusers_fk ? (s as typeof s & { idusers_fk: string }) : null;
};

const fmtDate = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
};

// "Agora" no fuso de São Paulo — comparável com date/starttime das aulas,
// que são gravados em horário de parede BRT (o servidor em produção roda em UTC).
const nowInBrazil = nowInSaoPaulo;

const hoursUntilLesson = (lesson: { date: string; starttime: string | null }, now: Date) => {
  const lessonDateTime = new Date(`${lesson.date}T${lesson.starttime || '00:00'}:00`);
  return (lessonDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
};

// Aula criada a partir de uma remarcação/reposição aprovada não pode ser
// remarcada de novo (regra combinada: só uma remarcação por aula). O marcador
// é o obs gravado pelo sistema na aprovação (approveRequest).
const isRemarcacaoResult = (obs?: string | null) => {
  const t = (obs || '').toLowerCase();
  return t.includes('remarcação aprovada')
    || t.includes('reposição de aula cancelada')
    || t.includes('remarcada pelo professor'); // remarcação do professor também conta p/ o limite
};

// ============================================================
// Utilitário: busca uma aula garantindo que pertence ao aluno logado
// ============================================================

/**
 * As aulas não têm student_fk preenchido (o vínculo é por studentname), então
 * o RLS esconde a linha da sessão do aluno e getLessonById devolvia null
 * ("Aula não encontrada") ao cancelar/remarcar. Usamos o cliente admin e
 * fazemos a autorização aqui, com o MESMO critério da listagem do aluno
 * (cachedLessonsByStudentName): professor da sessão + nome do aluno.
 */
async function getOwnLesson(lessonId: string, student: { idusers_fk: string; name: string }) {
  const { data } = await createAdminClient()
    .from('lesson')
    .select('*')
    .eq('idlesson', lessonId)
    .eq('idusers_fk', student.idusers_fk)
    .ilike('studentname', student.name)
    .maybeSingle();
  return data as import('@/types/database.types').Lesson | null;
}

// ============================================================
// Dashboard do Aluno
// ============================================================

export async function fetchAlunoDashboard() {
  const dbUser = await getSessionUser();
  const student = await getSessionStudent();
  if (!dbUser || !student) return null;
  if (!student.idusers_fk) {
    // Aluno ainda não escolheu professor.
    return {
      student: {
        idstudent: student.idstudent,
        idusers_fk: null,
        name: student.name,
      }
    };
  }

  const [, lessons, payments, credits, requests] = await Promise.all([
    autoMarkPastLessonsAsRealizada({
      kind: 'student',
      teacherId: student.idusers_fk,
      studentName: student.name,
    }),
    cachedLessonsByStudentName(student.idusers_fk, student.name),
    cachedPaymentsByStudent(student.idstudent),
    cachedActiveCredits(student.idstudent),
    LessonRequestService.getRequestsByStudent(student.idstudent),
  ]);

  // Usa data local (não UTC) — evita virada de dia errada à noite no fuso BRT.
  const today = getLocalISODate();
  const currentMonth = today.slice(0, 7); // "YYYY-MM"

  const realLessonCount = lessons.filter(l => l.lessonstatus === 'realizada').length;

  // Para planos recorrentes (mensal/trimestral/semestral), o campo totallessons
  // não representa créditos — calcula pelo mês atual.
  const pkg = (student.packagetype || '').toLowerCase();
  const isRecurring = ['mensal', 'trimestral', 'semestral'].includes(pkg);
  const monthLessons = isRecurring
    ? lessons.filter(l => l.date.startsWith(currentMonth) && (l.lessonstatus === 'realizada' || l.lessonstatus === 'agendada'))
    : null;
  const monthLessonCount = monthLessons?.length ?? null;
  const monthRealizedCount = monthLessons?.filter(l => l.lessonstatus === 'realizada').length ?? null;

  const upcomingLessons = lessons
    .filter(l => l.lessonstatus === 'agendada' && l.date >= today)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.starttime || '').localeCompare(b.starttime || '');
    });

  const pastLessons = lessons
    .filter(l => l.lessonstatus === 'realizada')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const pendingPayment = payments.find(p => p.status === 'pendente' || p.status === 'vencido');
  // Deriva hasDebt dos payments já buscados — evita uma query extra ao banco.
  const hasDebt = payments.some(p => (p.status === 'pendente' || p.status === 'vencido') && p.duedate < today);

  // ── Plano Atual ──────────────────────────────────────────────────────
  // Para quem não é mensalista (packagetype recorrente definido pelo
  // professor), o "plano" é a última compra de pacote de créditos feita
  // pelo próprio aluno — derivado dos payments, sem tocar em packagetype.
  const parsePackageName = (notes?: string | null) => {
    const m = /Compra de Pacote: (.+?) \(/.exec(notes || '');
    return m ? m[1] : null;
  };
  const creditPurchases = payments.filter(p => (Number((p as any).credits_qty) || 0) > 0);
  const paidPurchase = creditPurchases.find(p => p.status === 'pago');
  const pendingPurchase = creditPurchases.find(p => p.status === 'pendente' || p.status === 'vencido');
  const creditsValidUntil = credits.reduce((max, c) => {
    const d = String(c.expires_at || '').slice(0, 10);
    return d > max ? d : max;
  }, '');

  let plan: { kind: 'recorrente' | 'creditos' | 'aguardando' | 'nenhum'; name?: string; validUntil?: string };
  if (isRecurring) {
    plan = { kind: 'recorrente' };
  } else if (credits.length > 0) {
    plan = {
      kind: 'creditos',
      name: parsePackageName(paidPurchase?.notes) || 'Créditos',
      validUntil: creditsValidUntil,
    };
  } else if (pendingPurchase) {
    plan = { kind: 'aguardando', name: parsePackageName(pendingPurchase.notes) || 'Pacote de créditos' };
  } else {
    plan = { kind: 'nenhum' };
  }

  // Aulas que o professor liberou para o aluno remarcar e que ele ainda não
  // resolveu. Mesma régua de fetchAlunoLessons — o banner precisa sumir assim
  // que a solicitação é enviada, senão vira um aviso que não fecha nunca.
  const claimedOriginIds = new Set(
    requests
      .filter(r => (r.status === 'pendente' || r.status === 'aprovada')
        && r.original_lesson_fk
        && r.type !== 'cancelamento')
      .map(r => r.original_lesson_fk as string)
  );
  const awaitingRescheduleCount = credits.some(c => !!c.origin_lesson_fk)
    ? lessons.filter(l => l.lessonstatus === 'remarcada'
        && isAwaitingStudentReschedule(l.obs)
        && !claimedOriginIds.has(l.idlesson)).length
    : 0;

  return {
    student: {
      idstudent: student.idstudent,
      idusers_fk: student.idusers_fk,
      name: student.name,
      instrument: student.instrument || 'Não definido',
      packagetype: student.packagetype || 'avulsa',
      totallessons: student.totallessons,
      usedlessons: student.usedlessons,
      expirationdate: student.expirationdate || '',
      status: student.status,
      avatar_url: student.avatar_url || null,
    },
    realLessonCount,
    monthLessonCount,
    monthRealizedCount,
    upcomingLessons: upcomingLessons.map(l => ({
      id: l.idlesson,
      date: l.date,
      startTime: l.starttime,
      endTime: l.endtime,
      instrument: l.instrument,
      teacherName: l.teachername,
      status: l.lessonstatus,
    })),
    pastLessonsCount: pastLessons.length,
    pendingPayment: pendingPayment ? {
      amount: pendingPayment.amount,
      duedate: pendingPayment.duedate,
      status: pendingPayment.status,
      invoiceUrl: pendingPayment.asaas_invoice_url || '',
    } : null,
    credits: credits.length,
    hasDebt,
    awaitingRescheduleCount,
    plan,
  };
}

// ============================================================
// Minhas Aulas
// ============================================================

export async function fetchAlunoLessons() {
  const student = await getLinkedStudent();
  if (!student) return {
    upcoming: [],
    history: [],
    awaitingReschedule: [],
    rescheduleDeadline: '',
    meetLink: null as string | null,
  };

  // A sala virtual do professor é a mesma para todas as aulas — vem junto para
  // o aluno ter o link na tela mesmo que o e-mail de lembrete falhe ou caia no spam.
  const [, lessons, requests, activeCredits, meetLink] = await Promise.all([
    autoMarkPastLessonsAsRealizada({
      kind: 'student',
      teacherId: student.idusers_fk,
      studentName: student.name,
    }),
    cachedLessonsByStudentName(student.idusers_fk, student.name),
    LessonRequestService.getRequestsByStudent(student.idstudent),
    cachedActiveCredits(student.idstudent),
    getTeacherMeetLink(student.idusers_fk),
  ]);
  const now = nowInBrazil();
  const today = getLocalISODate(now);

  // Sem crédito de REPOSIÇÃO ativo (origin_lesson_fk preenchido) não há como
  // repor uma aula cancelada, então o botão fica escondido (o guard
  // server-side ainda protege). Créditos de pacote comprado não contam aqui.
  const hasActiveCredit = activeCredits.some(c => !!c.origin_lesson_fk);

  // Aulas que já têm uma reposição/remarcação ativa (pendente ou aprovada)
  // não podem receber outra — usado para esconder o botão de reposição.
  // Ignora o 'cancelamento': é ele que gera a aula cancelada + o crédito de
  // reposição, então não deve bloquear a própria reposição dessa aula.
  const blockedOriginIds = new Set(
    requests
      .filter(r => (r.status === 'pendente' || r.status === 'aprovada')
        && r.original_lesson_fk
        && r.type !== 'cancelamento')
      .map(r => r.original_lesson_fk as string)
  );

  const upcoming = lessons
    .filter(l => l.date >= today && l.lessonstatus !== 'cancelada' && l.lessonstatus !== 'remarcada')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(l => {
      // RN01: com menos de 6h para a aula, nem cancelamento nem remarcação.
      const withinNotice = hoursUntilLesson(l, now) >= 6;
      const rescheduledOnce = isRemarcacaoResult(l.obs);
      // Aulas aguardando pagamento ficam visíveis mas sem ações — o aluno
      // não pode cancelar/remarcar o que ainda não foi confirmado.
      const isPendingPayment = l.lessonstatus === 'aguardando_pagamento';
      return {
        id: l.idlesson,
        date: l.date,
        startTime: l.starttime,
        endTime: l.endtime,
        instrument: l.instrument,
        teacherName: l.teachername,
        status: l.lessonstatus,
        notes: l.obs || '',
        canCancel: withinNotice && !isPendingPayment,
        canReschedule: withinNotice && !rescheduledOnce && !isPendingPayment,
        rescheduledOnce,
        isPendingPayment,
      };
    });

  const toCard = (l: (typeof lessons)[number]) => ({
    id: l.idlesson,
    date: l.date,
    startTime: l.starttime,
    endTime: l.endtime,
    instrument: l.instrument,
    teacherName: l.teachername,
    status: l.lessonstatus,
    notes: l.obs || '',
  });

  // Aulas que o professor liberou para o ALUNO escolher o novo horário
  // (releaseLessonForStudentReschedule). Vão para um balde próprio porque
  // precisam de destaque: é um direito com prazo, não uma linha de histórico.
  // Some da lista assim que o aluno envia a solicitação (blockedOriginIds) ou
  // quando o crédito expira/é revogado.
  const awaitingRescheduleIds = new Set(
    lessons
      .filter(l => l.lessonstatus === 'remarcada'
        && isAwaitingStudentReschedule(l.obs)
        && !blockedOriginIds.has(l.idlesson)
        && hasActiveCredit)
      .map(l => l.idlesson)
  );

  const awaitingReschedule = lessons
    .filter(l => awaitingRescheduleIds.has(l.idlesson))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(l => ({ ...toCard(l), canReschedule: true }));

  // 'remarcada' entra mesmo com data futura: sem isso, uma aula marcada assim
  // não aparecia nem em `upcoming` (filtrada acima) nem aqui, e sumia por
  // completo da tela do aluno.
  const history = lessons
    .filter(l => !awaitingRescheduleIds.has(l.idlesson))
    .filter(l => l.date < today
      || l.lessonstatus === 'realizada'
      || l.lessonstatus === 'cancelada'
      || l.lessonstatus === 'remarcada')
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(l => ({
      ...toCard(l),
      // Só pode repor aula cancelada que ainda não tem reposição ativa/aprovada
      // e desde que o aluno tenha crédito de reposição ativo.
      canReschedule: l.lessonstatus === 'cancelada' && !blockedOriginIds.has(l.idlesson) && hasActiveCredit,
    }));

  // Validade do crédito de reposição mais próximo de expirar — é o prazo que o
  // aluno vê no aviso ("escolha até tal dia"). cachedActiveCredits não ordena,
  // então ordenamos aqui.
  const rescheduleDeadline = activeCredits
    .filter(c => !!c.origin_lesson_fk)
    .map(c => c.expires_at)
    .sort()[0] ?? '';

  return { upcoming, history, awaitingReschedule, rescheduleDeadline, meetLink };
}

// ============================================================
// Faturas do Aluno
// ============================================================

export async function fetchAlunoPendingPayments() {
  const student = await getSessionStudent();
  if (!student) return [];

  const payments = await cachedPaymentsByStudent(student.idstudent);
  return payments
    .filter(p => ['pendente', 'vencido'].includes(p.status))
    .map(p => ({
      id: p.id,
      amount: p.amount,
      duedate: p.duedate,
      status: p.status,
      method: p.method || 'pix',
      notes: p.notes || '',
      invoiceUrl: p.asaas_invoice_url || '',
      pixPayload: p.asaas_pix_payload || '',
    }));
}

export async function renegotiateStudentPayment(
  paymentId: string,
  newDueDate: string,
  notes: string
): Promise<{ success: boolean; error?: string; invoiceUrl?: string }> {
  const student = await getSessionStudent();
  if (!student) return { success: false, error: 'Sessão inválida.' };

  const supabase = await createClient();

  const { data: paymentRecord } = await supabase
    .from('payment')
    .select('idusers_fk, idstudent_fk, status')
    .eq('id', paymentId)
    .eq('idstudent_fk', student.idstudent)
    .single();

  if (!paymentRecord) return { success: false, error: 'Fatura não encontrada.' };
  if (paymentRecord.status !== 'vencido' && paymentRecord.status !== 'pendente') return { success: false, error: 'Apenas faturas pendentes ou vencidas podem ser renegociadas.' };

  const result = await PaymentService.renegotiatePayment(
    paymentId,
    newDueDate,
    notes || 'Renegociação solicitada pelo aluno',
    paymentRecord.idusers_fk
  );

  if (result.success) {
    const renegMsg = `${student.name} renegociou uma fatura vencida. Novo vencimento: ${newDueDate.split('-').reverse().join('/')}.`;

    // `idstudent_fk` é obrigatório aqui: quem insere é a sessão do ALUNO, e o
    // WITH CHECK de `notif_insert` só a autoriza pelo ramo
    // `idstudent_fk IN (my_student_ids())` — `idusers_fk` é do professor.
    // Sem essa coluna o INSERT era recusado em silêncio e o professor nunca
    // ficava sabendo. O aluno não passa a ver a linha: `getByStudent` filtra
    // por `recipient = 'student'`.
    const { error: notifErr } = await supabase.from('notification').insert([{
      idusers_fk: paymentRecord.idusers_fk,
      idstudent_fk: student.idstudent,
      recipient: 'teacher',
      type: 'cobranca',
      title: 'Renegociação de pagamento',
      message: renegMsg,
      read: false,
    }]);
    if (notifErr) console.error('Erro ao notificar professor da renegociação:', notifErr.message);

    // Depois da resposta: o aluno não espera o e-mail do professor sair.
    await afterResponse(() => emailTeacher(paymentRecord.idusers_fk, {
      title: 'Renegociação de pagamento',
      message: renegMsg,
      buttonLabel: 'Ver financeiro',
      buttonPath: '/financeiro',
    }));
  }

  return result;
}

/**
 * Pix estático não tem baixa automática: o aluno paga no app do banco e clica
 * "Já paguei". Isso só AVISA o professor (não altera o status) — quem confere o
 * extrato e dá a baixa é ele, pelo financeiro.
 */
export async function avisarPagamentoPix(paymentId: string): Promise<{ success: boolean; error?: string; jaAvisado?: boolean }> {
  try {
    return await avisarPagamentoPixImpl(paymentId);
  } catch (e: any) {
    console.error('avisarPagamentoPix falhou:', e?.message || e);
    return { success: false, error: `Erro inesperado ao avisar o professor (${String(e?.message || e).slice(0, 120)}).` };
  }
}

async function avisarPagamentoPixImpl(paymentId: string): Promise<{ success: boolean; error?: string; jaAvisado?: boolean }> {
  const student = await getSessionStudent();
  if (!student) return { success: false, error: 'Sessão inválida.' };

  const supabase = await createClient();
  const { data: pmt, error: selErr } = await supabase
    .from('payment')
    .select('id, idusers_fk, amount, status, notes, aluno_avisou_em')
    .eq('id', paymentId)
    .eq('idstudent_fk', student.idstudent)
    .maybeSingle();

  if (selErr) {
    console.error('avisarPagamentoPix: erro ao ler a fatura:', selErr.message);
    return { success: false, error: `Não foi possível ler a fatura (${selErr.message.slice(0, 100)}).` };
  }
  if (!pmt) return { success: false, error: 'Fatura não encontrada.' };
  if (pmt.status === 'pago') return { success: true, jaAvisado: true };
  if (pmt.status !== 'pendente' && pmt.status !== 'vencido') {
    return { success: false, error: 'Esta fatura não está aberta para pagamento.' };
  }
  if (pmt.aluno_avisou_em) return { success: true, jaAvisado: true };

  // A posse da fatura já foi comprovada acima (leitura com a sessão do aluno,
  // filtrada pelo idstudent dele). A gravação usa o cliente de serviço para não
  // depender de política de UPDATE do aluno, que falhava em silêncio.
  const { data: upd, error: updErr } = await createAdminClient()
    .from('payment')
    .update({ aluno_avisou_em: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('idstudent_fk', student.idstudent)
    .select('id');
  if (updErr || !upd || upd.length === 0) {
    console.error('Erro ao registrar aviso de pagamento:', updErr?.message || 'nenhuma linha atualizada');
    return { success: false, error: 'Não foi possível avisar o professor. Tente novamente.' };
  }
  try { updateTag('aluno-payments'); } catch { /* fora de contexto de ação */ }

  const valor = `R$ ${Number(pmt.amount).toFixed(2).replace('.', ',')}`;
  const msg = `${student.name} informou que pagou ${valor} por Pix${pmt.notes ? ` (${pmt.notes})` : ''}. Confira no extrato do banco e confirme em Financeiro → Receber.`;

  // idstudent_fk obrigatório: a RLS de notif_insert só autoriza a sessão do aluno por ele.
  const { error: notifErr } = await supabase.from('notification').insert([{
    idusers_fk: pmt.idusers_fk,
    idstudent_fk: student.idstudent,
    recipient: 'teacher',
    type: 'cobranca',
    title: 'Aluno avisou que pagou por Pix',
    message: msg,
    read: false,
  }]);
  if (notifErr) console.error('Erro ao notificar professor do aviso de pagamento:', notifErr.message);

  await afterResponse(() => emailTeacher(pmt.idusers_fk, {
    title: 'Aluno avisou que pagou por Pix',
    message: msg,
    buttonLabel: 'Ver financeiro',
    buttonPath: '/financeiro',
  }));

  return { success: true };
}

// ============================================================
// Solicitações de Aula (RF03)
// ============================================================

export async function requestNewLesson(data: {
  requested_date: string;
  requested_starttime: string;
  requested_endtime: string;
  instrument: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const student = await getLinkedStudent();
  if (!student) return { success: false, error: 'Sessão inválida.' };

  // Rejeitar horários que já passaram (usando fuso de São Paulo, não UTC do servidor)
  const nowBrazil = nowInSaoPaulo();
  const todayStr = getLocalISODate(nowBrazil);
  const currentTimeStr = `${String(nowBrazil.getHours()).padStart(2, '0')}:${String(nowBrazil.getMinutes()).padStart(2, '0')}`;
  if (data.requested_date < todayStr || (data.requested_date === todayStr && data.requested_starttime <= currentTimeStr)) {
    return { success: false, error: 'Não é possível solicitar uma aula para um horário que já passou.' };
  }

  // Plano recorrente (mensal/trimestral/semestral): aulas cobertas pela
  // mensalidade. Demais alunos: exigir crédito NORMAL ativo (pacote comprado),
  // que será consumido na aprovação — substitui o contador usedlessons/
  // totallessons, que nunca era atualizado e não limitava nada.
  const isRecurringPlan = ['mensal', 'trimestral', 'semestral'].includes((student.packagetype || '').toLowerCase());

  // As três validações são LEITURAS independentes: em paralelo custam um
  // round-trip em vez de três em fila. Os resultados são avaliados abaixo na
  // mesma ordem de antes, então a mensagem de erro devolvida não muda.
  const [hasDebt, normalCredits, avail] = await Promise.all([
    // RN06: Verificar inadimplência
    PaymentService.getStudentDebt(student.idstudent),
    isRecurringPlan ? Promise.resolve(null) : CreditService.getActiveCredits(student.idstudent, 'normal'),
    // Disponibilidade do professor (bloqueios, folgas e aulas existentes)
    checkTeacherAvailability(student.idusers_fk, data.requested_date, data.requested_starttime, data.requested_endtime),
  ]);
  if (hasDebt) {
    return { success: false, error: 'Você possui pagamentos em atraso. Regularize sua situação financeira para solicitar novas aulas.' };
  }
  if (normalCredits && normalCredits.length === 0) {
    return { success: false, error: 'Você não possui créditos suficientes. Por favor, adquira créditos ou um pacote com seu professor antes de solicitar uma aula.' };
  }
  if (!avail.available) {
    return { success: false, error: `Horário indisponível: ${avail.reason} (${avail.starttime}–${avail.endtime}).` };
  }

  const result = await LessonRequestService.createRequest({
    idstudent_fk: student.idstudent,
    idusers_fk: student.idusers_fk,
    type: 'agendamento',
    requested_date: data.requested_date,
    requested_starttime: data.requested_starttime,
    requested_endtime: data.requested_endtime,
    instrument: data.instrument || student.instrument || '',
    status: 'pendente',
    reason: data.reason || '',
  });

  if (!result) return { success: false, error: 'Erro ao enviar solicitação.' };

  // Criar notificação para o professor
  await NotificationService.create({
    idusers_fk: student.idusers_fk,
    idstudent_fk: student.idstudent,
    recipient: 'teacher',
    type: 'sistema',
    title: 'Nova solicitação de aula',
    message: `${student.name} solicitou uma aula para ${fmtDate(data.requested_date)} às ${data.requested_starttime}.`,
  }, { emailTeacher: true });

  return { success: true };
}

export async function requestCancellation(lessonId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const student = await getLinkedStudent();
  if (!student) return { success: false, error: 'Sessão inválida.' };

  // RN01: Verificar antecedência mínima de 6h
  const lesson = await getOwnLesson(lessonId, student);
  if (!lesson) return { success: false, error: 'Aula não encontrada.' };

  if (hoursUntilLesson(lesson, nowInBrazil()) < 6) {
    return { success: false, error: 'Cancelamentos exigem aviso prévio de 6 horas. Fora do prazo, a aula será contabilizada.' };
  }

  // Impede cancelamento em paralelo com remarcação/reposição da mesma aula —
  // aprovar os dois dava aula remarcada + crédito de reposição (benefício duplo).
  if (await LessonRequestService.hasActiveRequestForLesson(lessonId)) {
    return { success: false, error: 'Esta aula já possui uma remarcação ou reposição em andamento. Aguarde a resposta do professor.' };
  }

  const result = await LessonRequestService.createRequest({
    idstudent_fk: student.idstudent,
    idusers_fk: student.idusers_fk,
    type: 'cancelamento',
    original_lesson_fk: lessonId,
    status: 'pendente',
    reason,
  });

  if (!result) return { success: false, error: 'Erro ao enviar solicitação.' };

  await NotificationService.create({
    idusers_fk: student.idusers_fk,
    idstudent_fk: student.idstudent,
    recipient: 'teacher',
    type: 'sistema',
    title: 'Solicitação de cancelamento',
    message: `${student.name} solicitou cancelar a aula de ${fmtDate(lesson.date)} às ${lesson.starttime}.`,
  }, { emailTeacher: true });

  return { success: true };
}

export async function requestReschedule(lessonId: string, data: {
  requested_date: string;
  requested_starttime: string;
  requested_endtime: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const student = await getLinkedStudent();
  if (!student) return { success: false, error: 'Sessão inválida.' };

  // Rejeitar horários solicitados que já passaram (usando fuso de São Paulo, não UTC do servidor)
  const nowCheck = nowInSaoPaulo();
  const todayStrCheck = getLocalISODate(nowCheck);
  const currentTimeStrCheck = `${String(nowCheck.getHours()).padStart(2, '0')}:${String(nowCheck.getMinutes()).padStart(2, '0')}`;
  if (data.requested_date < todayStrCheck || (data.requested_date === todayStrCheck && data.requested_starttime <= currentTimeStrCheck)) {
    return { success: false, error: 'Não é possível remarcar para um horário que já passou.' };
  }

  // RN01: Verificar antecedência mínima de 6h
  const lesson = await getOwnLesson(lessonId, student);
  if (!lesson) return { success: false, error: 'Aula não encontrada.' };

  if (hoursUntilLesson(lesson, nowCheck) < 6) {
    return { success: false, error: 'Remarcações exigem aviso prévio de 6 horas. Fora do prazo, a aula será contabilizada.' };
  }

  // Aula que já nasceu de uma remarcação/reposição não pode ser remarcada de novo
  if (isRemarcacaoResult(lesson.obs)) {
    return { success: false, error: 'Esta aula já é resultado de uma remarcação e não pode ser remarcada novamente.' };
  }

  // Três LEITURAS independentes em paralelo (um round-trip em vez de três);
  // avaliadas abaixo na mesma ordem de antes, então a mensagem não muda.
  const [hasActiveRequest, hasDebt, avail] = await Promise.all([
    // Impede remarcar a mesma aula mais de uma vez (solicitação pendente ou já aprovada)
    LessonRequestService.hasActiveRequestForLesson(lessonId),
    // RN06: Verificar inadimplência
    PaymentService.getStudentDebt(student.idstudent),
    // Disponibilidade do professor
    checkTeacherAvailability(student.idusers_fk, data.requested_date, data.requested_starttime, data.requested_endtime),
  ]);
  if (hasActiveRequest) {
    return { success: false, error: 'Esta aula já possui uma remarcação em andamento ou concluída.' };
  }
  if (hasDebt) {
    return { success: false, error: 'Você possui pagamentos em atraso. Regularize para remarcar.' };
  }
  if (!avail.available) {
    return { success: false, error: `Horário indisponível: ${avail.reason} (${avail.starttime}–${avail.endtime}).` };
  }

  const result = await LessonRequestService.createRequest({
    idstudent_fk: student.idstudent,
    idusers_fk: student.idusers_fk,
    type: 'remarcacao',
    original_lesson_fk: lessonId,
    requested_date: data.requested_date,
    requested_starttime: data.requested_starttime,
    requested_endtime: data.requested_endtime,
    status: 'pendente',
    reason: data.reason || '',
  });

  if (!result) return { success: false, error: 'Erro ao enviar solicitação.' };

  await NotificationService.create({
    idusers_fk: student.idusers_fk,
    idstudent_fk: student.idstudent,
    recipient: 'teacher',
    type: 'sistema',
    title: 'Solicitação de remarcação',
    message: `${student.name} solicitou remarcar a aula para ${fmtDate(data.requested_date)} às ${data.requested_starttime}.`,
  }, { emailTeacher: true });

  return { success: true };
}

export async function requestLessonUsingCredit(data: {
  requested_date: string;
  requested_starttime: string;
  requested_endtime: string;
  instrument: string;
  reason?: string;
  originLessonId: string;
}): Promise<{ success: boolean; error?: string }> {
  const student = await getLinkedStudent();
  if (!student) return { success: false, error: 'Sessão inválida.' };

  const nowBrazil = nowInSaoPaulo();
  const todayStr = getLocalISODate(nowBrazil);
  const currentTimeStr = `${String(nowBrazil.getHours()).padStart(2, '0')}:${String(nowBrazil.getMinutes()).padStart(2, '0')}`;
  if (data.requested_date < todayStr || (data.requested_date === todayStr && data.requested_starttime <= currentTimeStr)) {
    return { success: false, error: 'Não é possível solicitar uma aula para um horário que já passou.' };
  }

  // Quatro LEITURAS independentes em paralelo (um round-trip em vez de quatro);
  // avaliadas abaixo na mesma ordem de antes, então a mensagem não muda.
  const [hasDebt, credits, hasActiveRequest, avail] = await Promise.all([
    PaymentService.getStudentDebt(student.idstudent),
    CreditService.getActiveCredits(student.idstudent, 'reposicao'),
    // Impede repor a mesma aula mais de uma vez (solicitação pendente ou já aprovada)
    LessonRequestService.hasActiveRequestForLesson(data.originLessonId),
    // Disponibilidade do professor
    checkTeacherAvailability(student.idusers_fk, data.requested_date, data.requested_starttime, data.requested_endtime),
  ]);
  if (hasDebt) {
    return { success: false, error: 'Você possui pagamentos em atraso. Regularize sua situação financeira para solicitar novas aulas.' };
  }
  if (credits.length === 0) {
    return { success: false, error: 'Você não possui créditos de reposição disponíveis. Peça ao professor para verificar o cancelamento.' };
  }
  if (hasActiveRequest) {
    return { success: false, error: 'Esta aula cancelada já possui uma reposição em andamento ou agendada.' };
  }
  if (!avail.available) {
    return { success: false, error: `Horário indisponível: ${avail.reason} (${avail.starttime}–${avail.endtime}).` };
  }

  const result = await LessonRequestService.createRequest({
    idstudent_fk: student.idstudent,
    idusers_fk: student.idusers_fk,
    type: 'agendamento',
    original_lesson_fk: data.originLessonId,
    requested_date: data.requested_date,
    requested_starttime: data.requested_starttime,
    requested_endtime: data.requested_endtime,
    instrument: data.instrument || student.instrument || '',
    status: 'pendente',
    reason: data.reason || 'Reposição de aula cancelada',
  });

  if (!result) return { success: false, error: 'Erro ao enviar solicitação.' };

  await NotificationService.create({
    idusers_fk: student.idusers_fk,
    idstudent_fk: student.idstudent,
    recipient: 'teacher',
    type: 'sistema',
    title: 'Solicitação de reposição',
    message: `${student.name} solicitou uma reposição para ${fmtDate(data.requested_date)} às ${data.requested_starttime}.`,
  }, { emailTeacher: true });

  return { success: true };
}

// ===========================================================
// Financeiro do Aluno
// ===========================================================

// Mensalista (plano recorrente) não usa o autosserviço de pacotes: o preço
// negociado vive na mensalidade (lessonprice) e o desconto individual,
// calibrado para ela, distorceria o preço dos pacotes (ex.: avulsa por R$ 0).
const isRecurringPackage = (packagetype?: string | null) =>
  ['mensal', 'trimestral', 'semestral'].includes((packagetype || '').toLowerCase());

export async function fetchAvailableCreditPackages() {
  const student = await getSessionStudent();
  if (!student || !student.idusers_fk) return [];
  if (isRecurringPackage(student.packagetype)) return [];

  const packages = await CreditPackageService.getActiveByTeacher(student.idusers_fk);
  // Sem desconto individual: o pacote é cobrado pelo valor cheio configurado
  // pelo professor (o desconto do aluno estava zerando o preço de aulas avulsas).
  return packages.map(p => ({
    id: p.id,
    name: p.name,
    credits: p.credits,
    price: Number(p.price),
    popular: p.popular,
  }));
}

export async function registerCreditPurchase(packageId: string) {
  const student = await getSessionStudent();
  if (!student) return { success: false, error: 'Sessão inválida.' };
  if (!student.idusers_fk) {
    return { success: false, error: 'Você precisa estar vinculado a um professor para comprar créditos.' };
  }
  if (isRecurringPackage(student.packagetype)) {
    return { success: false, error: 'Seu plano possui mensalidade gerenciada pelo professor. Fale com ele para aulas extras ou mudança de plano.' };
  }

  // Fonte autoritativa: o servidor busca preço/créditos pelo packageId.
  // Nunca confiar em valores enviados pelo cliente.
  const pkg = await CreditPackageService.getById(packageId);
  if (!pkg || !pkg.active || pkg.idusers_fk !== student.idusers_fk) {
    return { success: false, error: 'Pacote indisponível para o seu professor.' };
  }

  const name = pkg.name;
  // Sem desconto individual: cobra o valor cheio do pacote.
  const price = Number(pkg.price);
  const credits = pkg.credits;
  const validityDays = pkg.validity_days;

  try {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3); // Vence em 3 dias
    const dueDateStr = getLocalISODate(dueDate);

    let asaasPaymentId = '';
    let asaasInvoiceUrl = '';
    let asaasPixQrcode = '';
    let asaasPixPayload = '';

    // --- Integração Asaas (apenas se a chave de API estiver configurada) ---
    const hasAsaas = !!(process.env.ASAAS_API_KEY && process.env.ASAAS_API_KEY !== '');

    if (hasAsaas) {
      const { AsaasClient } = await import('@/lib/asaas');
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();

      let asaasCustomerId = student.asaas_customer_id || '';

      // Criar cliente no Asaas se ainda não existir
      if (!asaasCustomerId) {
        if (!student.cpf) {
          return { success: false, error: 'CPF não cadastrado. Atualize seu perfil antes de comprar créditos.' };
        }
        const customer = await AsaasClient.createCustomer({
          name: student.name,
          cpfCnpj: student.cpf,
          email: student.email || undefined,
          phone: student.phone || undefined,
        });
        asaasCustomerId = customer.id;

        // Salvar o customer_id no banco
        await supabase
          .from('student')
          .update({ asaas_customer_id: asaasCustomerId })
          .eq('idstudent', student.idstudent);
      }

      // Criar cobrança genérica no Asaas (permite Pix, Boleto e Cartão)
      const asaasPayment = await AsaasClient.createPayment({
        customer: asaasCustomerId,
        billingType: 'UNDEFINED',
        value: price,
        dueDate: dueDateStr,
        description: `PRO MUSIC — ${name} (${credits} crédito${credits > 1 ? 's' : ''})`,
      });

      asaasPaymentId = asaasPayment.id;
      asaasInvoiceUrl = asaasPayment.invoiceUrl;

      // Buscar QR Code PIX
      try {
        const pixData = await AsaasClient.getPixQrCode(asaasPaymentId);
        asaasPixQrcode = pixData.encodedImage;
        asaasPixPayload = pixData.payload;
      } catch (pixErr) {
        console.warn('Não foi possível obter QR Code PIX:', pixErr);
      }
    }

    // Criar fatura no banco de dados local
    const payment = await PaymentService.createPayment({
      idstudent_fk: student.idstudent,
      idusers_fk: student.idusers_fk,
      amount: price,
      duedate: dueDateStr,
      status: 'pendente',
      method: undefined,
      notes: `Compra de Pacote: ${name} (${credits} créditos)`,
      fine: 0,
      interest: 0,
      asaas_payment_id: asaasPaymentId || undefined,
      asaas_invoice_url: asaasInvoiceUrl || undefined,
      asaas_pix_qrcode: asaasPixQrcode || undefined,
      asaas_pix_payload: asaasPixPayload || undefined,
      credits_qty: credits,
      credits_validity_days: validityDays,
    } as any);

    if (!payment) throw new Error('Erro ao criar fatura');

    // Notificar o professor sobre a compra (créditos só são liberados após
    // confirmação do pagamento, mas o professor deve saber que houve a intenção).
    await NotificationService.create({
      idusers_fk: student.idusers_fk,
      idstudent_fk: student.idstudent,
      recipient: 'teacher',
      type: 'sistema',
      title: 'Compra de créditos iniciada',
      message: `${student.name} comprou ${name} (${credits} crédito${credits > 1 ? 's' : ''}, R$ ${price.toFixed(2).replace('.', ',')}). Aguardando confirmação do pagamento.`,
    }, { emailTeacher: true });

    return {
      success: true,
      paymentId: payment.id,
      invoiceUrl: asaasInvoiceUrl || '',
      // Pix estático nasce em PaymentService.createPayment; o que veio do Asaas tem prioridade.
      pixQrcode: asaasPixQrcode || (payment as any).asaas_pix_qrcode || '',
      pixPayload: asaasPixPayload || (payment as any).asaas_pix_payload || '',
      dueDate: dueDateStr,
      price,
      name,
      credits,
    };
  } catch (error: any) {
    console.error('Erro na compra:', error);
    return { success: false, error: error.message || 'Falha ao registrar compra no financeiro.' };
  }
}

export async function fetchAlunoPayments() {
  const student = await getSessionStudent();
  if (!student) return [];

  const cached = await cachedPaymentsByStudent(student.idstudent);
  // Rede de segurança do Pix estático: fatura aberta sem código (criada antes da
  // configuração, por outro fluxo ou vinda de migração) ganha o Pix ao ser vista.
  const payments = await Promise.all(cached.map(async (p) => {
    if ((p.status !== 'pendente' && p.status !== 'vencido') || p.asaas_pix_payload) return p;
    const copy: any = { ...p };
    await PaymentService.attachStaticPix(createAdminClient(), copy);
    return copy as typeof p;
  }));
  return payments.map(p => ({
    id: p.id,
    amount: p.amount,
    duedate: p.duedate,
    paymentdate: p.paymentdate || '',
    status: p.status,
    method: p.method || '',
    invoiceUrl: p.asaas_invoice_url || '',
    pixQrcode: (p as any).asaas_pix_qrcode || '',
    pixPayload: (p as any).asaas_pix_payload || '',
    fine: p.fine,
    interest: p.interest,
    notes: p.notes || '',
    credits_qty: (p as any).credits_qty || 0,
    alunoAvisouEm: (p as any).aluno_avisou_em || '',
  }));
}

/**
 * Informa se o aluno pode antecipar a próxima mensalidade e qual seria o valor /
 * vencimento projetado. Não cria nada — usado apenas para exibir o card de antecipação.
 */
export async function fetchAlunoNextInvoiceInfo() {
  const student = await getSessionStudent();
  if (!student) return null;

  const pkg = (student.packagetype || 'avulsa').toLowerCase();
  const monthsToAdd = pkg === 'mensal' ? 1 : pkg === 'trimestral' ? 3 : pkg === 'semestral' ? 6 : 0;
  if (monthsToAdd === 0) return { eligible: false as const, reason: 'not_recurring' as const };
  // Assinatura Asaas emite a próxima fatura automaticamente.
  if (student.asaas_subscription_id) return { eligible: false as const, reason: 'asaas_auto' as const };

  const payments = await cachedPaymentsByStudent(student.idstudent);
  if (payments.some(p => p.status === 'pendente' || p.status === 'vencido')) {
    return { eligible: false as const, reason: 'has_open' as const };
  }

  const amount = Number(student.lessonprice) || 0;
  if (amount <= 0) return { eligible: false as const, reason: 'no_price' as const };

  // Mesma projeção de PaymentService.generateAdvanceMensalidade.
  const lastDue = payments
    .filter(p => p.status !== 'cancelado')
    .map(p => p.duedate)
    .sort()
    .at(-1) || null;
  // Sem histórico, a primeira mensalidade vence na data do plano (expirationdate
  // da ficha do aluno); com histórico, avança um período mantendo o dia.
  const duedate = projectNextMensalidadeDue(lastDue, student.expirationdate, monthsToAdd);
  const [ry, rm] = duedate.split('-').map(Number);
  const monthLabel = new Date(ry, rm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // A próxima já foi gerada (dedup) → não há o que antecipar.
  if (payments.some(p => p.duedate === duedate && p.status !== 'cancelado')) {
    return { eligible: false as const, reason: 'already_generated' as const };
  }

  // isFirst: sem histórico de faturas — é a mensalidade do plano em si, não uma antecipação.
  return { eligible: true as const, amount, duedate, monthLabel, isFirst: !lastDue };
}

/**
 * Gera (e já cobra) a mensalidade do próximo período a pedido do aluno que quer
 * pagar adiantado. Devolve o link de pagamento quando o Asaas está configurado.
 */
export async function generateNextStudentInvoice(): Promise<{
  success: boolean;
  error?: string;
  invoiceUrl?: string;
  duedate?: string;
  amount?: number;
}> {
  const student = await getSessionStudent();
  if (!student) return { success: false, error: 'Sessão inválida.' };

  const res = await PaymentService.generateAdvanceMensalidade(student.idstudent);
  if (res.success) updateTag('aluno-payments');
  return res;
}

export async function fetchAlunoUpcomingLessonsWithPayments() {
  const student = await getLinkedStudent();
  if (!student) return { lessons: [], lessonPrice: 0 };

  const today = getLocalISODate();
  const data = await cachedUpcomingLessonsWithPayments(student.idusers_fk, student.name, today);

  const lessons = data.map((l: any) => {
    const payment = Array.isArray(l.payment) ? l.payment[0] : l.payment;
    return {
      id: l.idlesson,
      date: l.date,
      startTime: l.starttime,
      endTime: l.endtime,
      instrument: l.instrument,
      teacherName: l.teachername,
      status: l.lessonstatus,
      payment: payment ? {
        id: payment.id,
        amount: Number(payment.amount),
        status: payment.status,
        duedate: payment.duedate,
        invoiceUrl: payment.asaas_invoice_url || '',
        pixPayload: payment.asaas_pix_payload || '',
      } : null,
      expectedPrice: Number(student.lessonprice) || 0,
    };
  });

  return { lessons, lessonPrice: Number(student.lessonprice) || 0 };
}

// ============================================================
// Perfil do Aluno
// ============================================================

export async function fetchAlunoPerfil() {
  const student = await getSessionStudent();
  if (!student) return null;

  return {
    idstudent: student.idstudent,
    idusers_fk: student.idusers_fk,
    avatar_url: student.avatar_url || null,
    name: student.name,
    email: student.email || '',
    phone: student.phone || '',
    cpf: student.cpf || '',
    instrument: student.instrument || '',
    packagetype: student.packagetype || 'avulsa',
    expirationdate: student.expirationdate || '',
  };
}

export async function fetchAlunoCredits() {
  const student = await getSessionStudent();
  if (!student) return [];

  const credits = await cachedActiveCredits(student.idstudent);
  return credits.map(c => ({
    id: c.id,
    expiresAt: c.expires_at,
    used: c.used,
  }));
}

export async function fetchAlunoNotifications() {
  const student = await getSessionStudent();
  if (!student) return [];

  const notifs = await cachedNotificationsByStudent(student.idstudent);
  return notifs.map(n => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message || '',
    read: n.read,
    createdAt: n.created_at,
  }));
}

export async function markNotificationAsRead(id: string) {
  const ok = await NotificationService.markAsRead(id);
  if (ok) {
    // Invalida a lista e o contador do sino (cachedNotificationsByStudent e os
    // caches de unread-count têm TTL de 30s) — sem isso o badge ficava
    // desatualizado por até 30s após marcar como lida nesta página.
    updateTag('aluno-notifications');
    updateTag('unread-count');
  }
  return ok;
}

export async function markAllNotificationsAsRead() {
  const student = await getSessionStudent();
  if (!student) return false;
  const ok = await NotificationService.markAllAsRead(student.idstudent);
  if (ok) {
    updateTag('aluno-notifications');
    updateTag('unread-count');
  }
  return ok;
}

export async function fetchTeacherAvailability(date: string) {
  const student = await getLinkedStudent();
  if (!student) return [];

  const { getOccupiedSlots } = await import('@/lib/teacher-availability');
  const occupied = await getOccupiedSlots(student.idusers_fk, date);

  return occupied.map(s => ({ startTime: s.starttime, endTime: s.endtime, status: 'ocupado', reason: s.reason }));
}

export async function linkStudentToTeacher(studentId: string, teacherId: string, instrument: string) {
  try {
    const student = await getSessionStudent();
    if (!student || student.idstudent !== studentId) {
      return { error: 'Não autorizado.' };
    }

    const supabase = await createClient();

    // O alvo precisa ser um professor aprovado — sem isso o aluno podia se
    // vincular a qualquer UUID (e expor os próprios dados a um "professor"
    // arbitrário via as policies de RLS baseadas em idusers_fk).
    const { data: teacher } = await supabase
      .from('users')
      .select('idusers')
      .eq('idusers', teacherId)
      .eq('usertype', 'professor')
      .eq('accountstatus', 'approved')
      .maybeSingle();
    if (!teacher) {
      return { error: 'Professor inválido ou ainda não aprovado.' };
    }

    const { error } = await supabase
      .from('student')
      .update({
        idusers_fk: teacherId,
        instrument: instrument
      })
      .eq('idstudent', studentId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('Error linking student to teacher:', err);
    return { error: 'Erro interno ao processar a vinculação.' };
  }
}

export async function updateStudentAvatar(studentId: string, avatarUrl: string) {
  try {
    const { StudentService } = await import('@/services/student.service');
    const res = await StudentService.updateStudent(studentId, { avatar_url: avatarUrl });
    return !!res;
  } catch (err) {
    console.error('Error updating student avatar:', err);
    return false;
  }
}

// ============================================================
// Cargas de página em LOTE
//
// O Next despacha as server actions do cliente UMA POR VEZ (fila): um
// `Promise.all([actionA(), actionB(), actionC()])` no navegador roda A, depois B,
// depois C — cada uma com seu round-trip HTTP + validação de sessão. Estas
// funções fazem o mesmo trabalho numa ida só e paralelizam DENTRO do servidor,
// onde o Promise.all de fato roda em paralelo (getSessionStudent é cacheado por
// request). Continuam sendo server actions: o updateTag das rotinas chamadas
// segue valendo (não funcionaria num Server Component).
// ============================================================

/** Minhas Aulas: aulas + faturas em aberto + ficha (instrumento). */
export async function fetchAlunoAulasPage() {
  const [result, bills, perfil] = await Promise.all([
    fetchAlunoLessons(),
    fetchAlunoPendingPayments(),
    fetchAlunoPerfil(),
  ]);
  return { result, bills, perfil };
}

/** Meu Financeiro: histórico de pagamentos + elegibilidade da próxima fatura. */
export async function fetchAlunoFinanceiroPage() {
  const [payments, nextInfo] = await Promise.all([
    fetchAlunoPayments(),
    fetchAlunoNextInvoiceInfo(),
  ]);
  return { payments, nextInfo };
}

/** Meu Perfil: ficha + créditos ativos. */
export async function fetchAlunoPerfilPage() {
  const [perfil, credits] = await Promise.all([
    fetchAlunoPerfil(),
    fetchAlunoCredits(),
  ]);
  return { perfil, credits };
}

/** Planos e Créditos: ficha + pacotes disponíveis do professor. */
export async function fetchCompraCreditosPage() {
  const [perfil, packages] = await Promise.all([
    fetchAlunoPerfil(),
    fetchAvailableCreditPackages(),
  ]);
  return { perfil, packages };
}

/** Marketplace de professores: professores aprovados + catálogo de instrumentos. */
export async function fetchMarketplaceData() {
  const [{ getAvailableTeachers }, { getAvailableInstruments }] = await Promise.all([
    import('@/app/(public)/cadastro-aluno/actions'),
    import('@/app/(public)/cadastro/actions'),
  ]);
  const [teachers, instruments] = await Promise.all([
    getAvailableTeachers(),
    getAvailableInstruments(),
  ]);
  return { teachers, instruments };
}
