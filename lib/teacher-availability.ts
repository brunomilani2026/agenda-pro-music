// Usa o cliente admin (BYPASSRLS) de propósito: a disponibilidade precisa
// enxergar TODAS as aulas do professor, e o RLS da tabela `lesson` só deixa o
// aluno ver as próprias aulas — com a sessão do aluno, aulas de outros alunos
// ficavam invisíveis e horários ocupados apareciam como livres. Só expomos
// horários e razões genéricas; o nome do aluno vai em `studentname` à parte,
// usado apenas nas mensagens do lado do professor.
import { createAdminClient } from '@/lib/supabase/server';
import { getLocalISODate } from '@/lib/utils';
import {
  OVERDUE_CANCEL_NOTE, isOverduePayment, normalizeStudentName,
} from '@/lib/lesson-cancel-reasons';

// ─── Helpers de tempo ────────────────────────────────────────────────────────

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function slotsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface OccupiedSlot {
  starttime: string;
  endtime: string;
  reason: string;
}

export interface AvailabilityConflict {
  available: false;
  reason: string;
  starttime: string;
  endtime: string;
  /** Presente quando o conflito é uma aula. Não incluir em mensagens ao aluno. */
  studentname?: string;
}

export type AvailabilityResult = { available: true } | AvailabilityConflict;

/** Razão genérica — chega ao aluno solicitante, então não cita nome. */
export const OVERDUE_HELD_REASON = 'Horário reservado — aula de aluno em atraso';

// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Aulas canceladas pela inadimplência de alunos que continuam devendo. Elas
 * seguem ocupando o horário: o professor vê a aula em atraso na agenda, e o
 * slot não pode ser vendido para outro aluno enquanto ele não liberar.
 *
 * Só a nota não basta como critério — quando o aluno quita, a aula vira um
 * cancelamento comum e o horário volta a ficar livre. Por isso cruzamos com a
 * dívida vencida (mesma régua do Financeiro) e com o status 'bloqueado'.
 */
async function fetchOverdueHeldLessons(
  supabase: ReturnType<typeof createAdminClient>,
  idusers_fk: string,
  dates: string[]
): Promise<{ idlesson: string; date: string; studentname: string; starttime: string; endtime: string }[]> {
  if (!dates.length) return [];

  // Primeiro só as aulas candidatas. Na grande maioria das consultas não existe
  // nenhuma aula cancelada por inadimplência nas datas pedidas, e aí as duas
  // queries seguintes (TODOS os alunos e TODOS os pagamentos em aberto do
  // professor) eram puro desperdício — rodavam em toda checagem de conflito e
  // em toda data escolhida pelo aluno. Só quem tem candidatas paga por elas.
  const lessonsRes = await supabase
    .from('lesson')
    .select('idlesson, date, studentname, starttime, endtime')
    .eq('idusers_fk', idusers_fk)
    .in('date', dates)
    .eq('lessonstatus', 'cancelada')
    .eq('obs', OVERDUE_CANCEL_NOTE);

  const lessons = lessonsRes.data ?? [];
  if (!lessons.length) return [];

  const [studentsRes, paymentsRes] = await Promise.all([
    supabase
      .from('student')
      .select('idstudent, name, status')
      .eq('idusers_fk', idusers_fk),
    supabase
      .from('payment')
      .select('idstudent_fk, status, duedate')
      .eq('idusers_fk', idusers_fk)
      .in('status', ['pendente', 'vencido']),
  ]);

  const today = getLocalISODate(new Date());
  const indebted = new Set(
    (paymentsRes.data ?? [])
      .filter(p => isOverduePayment(p, today))
      .map(p => p.idstudent_fk)
  );
  const overdueNames = new Set(
    (studentsRes.data ?? [])
      .filter(s => s.status === 'bloqueado' || indebted.has(s.idstudent))
      .map(s => normalizeStudentName(s.name))
  );

  return lessons.filter(l => overdueNames.has(normalizeStudentName(l.studentname)));
}

/**
 * Retorna todos os slots ocupados para um professor numa data específica:
 * aulas existentes, bloqueios pontuais e folgas semanais.
 */
export async function getOccupiedSlots(idusers_fk: string, date: string): Promise<OccupiedSlot[]> {
  const supabase = createAdminClient();
  const dayOfWeek = new Date(date + 'T12:00:00').getDay(); // 0=Dom … 6=Sáb

  const [lessonsRes, blockedRes, daysOffRes, overdueHeld] = await Promise.all([
    supabase
      .from('lesson')
      .select('starttime, endtime')
      .eq('idusers_fk', idusers_fk)
      .eq('date', date)
      .not('lessonstatus', 'in', '(cancelada,remarcada)'),
    supabase
      .from('blocked_slot')
      .select('starttime, endtime, reason')
      .eq('idusers_fk', idusers_fk)
      .eq('date', date),
    supabase
      .from('teacher_day_off')
      .select('reason')
      .eq('idusers_fk', idusers_fk)
      .eq('day_of_week', dayOfWeek),
    fetchOverdueHeldLessons(supabase, idusers_fk, [date]),
  ]);

  const slots: OccupiedSlot[] = [];

  for (const l of lessonsRes.data ?? []) {
    slots.push({ starttime: l.starttime, endtime: l.endtime, reason: 'Aula já agendada' });
  }
  for (const l of overdueHeld) {
    slots.push({ starttime: l.starttime, endtime: l.endtime, reason: OVERDUE_HELD_REASON });
  }
  for (const b of blockedRes.data ?? []) {
    slots.push({ starttime: b.starttime, endtime: b.endtime, reason: b.reason || 'Horário bloqueado' });
  }
  if ((daysOffRes.data ?? []).length > 0) {
    const reason = daysOffRes.data![0].reason || 'Dia de folga';
    slots.push({ starttime: '00:00', endtime: '23:59', reason });
  }

  return slots;
}

/**
 * Versão em LOTE de checkTeacherAvailability: valida o MESMO horário em várias
 * datas (recorrência) usando 3 queries no total, não 3 por data.
 *
 * Retorna a primeira data conflitante, ou null se todas estiverem livres —
 * a criação de recorrência é all-or-nothing.
 */
export async function checkAvailabilityForDates(
  idusers_fk: string,
  dates: string[],
  starttime: string,
  endtime: string,
  excludeLessonId?: string
): Promise<(AvailabilityConflict & { date: string }) | null> {
  if (!dates.length) return null;

  const supabase = createAdminClient();
  const newStart = timeToMinutes(starttime);
  const newEnd = endtime ? timeToMinutes(endtime) : newStart + 50;
  const daysOfWeek = [...new Set(dates.map(d => new Date(d + 'T12:00:00').getDay()))];

  const [daysOffRes, blockedRes, lessonsRes, overdueHeld] = await Promise.all([
    supabase
      .from('teacher_day_off')
      .select('day_of_week, reason')
      .eq('idusers_fk', idusers_fk)
      .in('day_of_week', daysOfWeek),
    supabase
      .from('blocked_slot')
      .select('date, starttime, endtime, reason')
      .eq('idusers_fk', idusers_fk)
      .in('date', dates),
    supabase
      .from('lesson')
      .select('idlesson, date, studentname, starttime, endtime')
      .eq('idusers_fk', idusers_fk)
      .in('date', dates)
      .not('lessonstatus', 'in', '(cancelada,remarcada)'),
    fetchOverdueHeldLessons(supabase, idusers_fk, dates),
  ]);

  const dayOffByWeekday = new Map<number, string>();
  for (const d of daysOffRes.data ?? []) dayOffByWeekday.set(d.day_of_week, d.reason || 'Dia de folga do professor');

  const groupByDate = <T extends { date: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const arr = m.get(r.date);
      if (arr) arr.push(r); else m.set(r.date, [r]);
    }
    return m;
  };
  const blockedByDate = groupByDate((blockedRes.data ?? []) as any[]);
  // As aulas em atraso entram junto das ativas, só com razão própria — a
  // sobreposição e o excludeLessonId funcionam igual para as duas.
  const lessonsByDate = groupByDate([
    ...((lessonsRes.data ?? []) as any[]),
    ...overdueHeld.map(l => ({ ...l, heldReason: OVERDUE_HELD_REASON })),
  ]);

  // Mesma ordem de precedência de checkTeacherAvailability: folga → bloqueio → aula.
  for (const date of dates) {
    const dayOff = dayOffByWeekday.get(new Date(date + 'T12:00:00').getDay());
    if (dayOff) {
      return { available: false, reason: dayOff, starttime: '00:00', endtime: '23:59', date };
    }
    for (const b of blockedByDate.get(date) ?? []) {
      if (slotsOverlap(newStart, newEnd, timeToMinutes(b.starttime), timeToMinutes(b.endtime))) {
        return { available: false, reason: b.reason || 'Horário bloqueado pelo professor', starttime: b.starttime, endtime: b.endtime, date };
      }
    }
    for (const l of lessonsByDate.get(date) ?? []) {
      if (excludeLessonId && l.idlesson === excludeLessonId) continue;
      if (slotsOverlap(newStart, newEnd, timeToMinutes(l.starttime), timeToMinutes(l.endtime))) {
        return { available: false, reason: l.heldReason || 'Já existe uma aula neste horário', studentname: l.studentname, starttime: l.starttime, endtime: l.endtime, date };
      }
    }
  }

  return null;
}

/**
 * Verifica se o professor está disponível para o horário solicitado.
 * Retorna { available: true } ou { available: false, reason, starttime, endtime }.
 */
export async function checkTeacherAvailability(
  idusers_fk: string,
  date: string,
  starttime: string,
  endtime: string,
  excludeLessonId?: string
): Promise<AvailabilityResult> {
  const supabase = createAdminClient();
  const dayOfWeek = new Date(date + 'T12:00:00').getDay();

  const newStart = timeToMinutes(starttime);
  const newEnd = endtime ? timeToMinutes(endtime) : newStart + 50;

  const [dayOffRes, blockedRes, lessonsRes, overdueHeld] = await Promise.all([
    supabase
      .from('teacher_day_off')
      .select('reason')
      .eq('idusers_fk', idusers_fk)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle(),
    supabase
      .from('blocked_slot')
      .select('starttime, endtime, reason')
      .eq('idusers_fk', idusers_fk)
      .eq('date', date),
    supabase
      .from('lesson')
      .select('idlesson, studentname, starttime, endtime')
      .eq('idusers_fk', idusers_fk)
      .eq('date', date)
      .not('lessonstatus', 'in', '(cancelada,remarcada)'),
    fetchOverdueHeldLessons(supabase, idusers_fk, [date]),
  ]);

  if (dayOffRes.data) {
    return { available: false, reason: dayOffRes.data.reason || 'Dia de folga do professor', starttime: '00:00', endtime: '23:59' };
  }

  for (const b of blockedRes.data ?? []) {
    if (slotsOverlap(newStart, newEnd, timeToMinutes(b.starttime), timeToMinutes(b.endtime))) {
      return { available: false, reason: b.reason || 'Horário bloqueado pelo professor', starttime: b.starttime, endtime: b.endtime };
    }
  }

  const allLessons = [
    ...(lessonsRes.data ?? []).map(l => ({ ...l, heldReason: undefined as string | undefined })),
    ...overdueHeld.map(l => ({ ...l, heldReason: OVERDUE_HELD_REASON })),
  ];

  for (const l of allLessons) {
    if (excludeLessonId && l.idlesson === excludeLessonId) continue;
    if (slotsOverlap(newStart, newEnd, timeToMinutes(l.starttime), timeToMinutes(l.endtime))) {
      // Razão genérica: essa mensagem chega ao aluno solicitante, que não deve
      // ver o nome de outros alunos. O professor usa `studentname` à parte.
      return { available: false, reason: l.heldReason || 'Já existe uma aula neste horário', studentname: l.studentname, starttime: l.starttime, endtime: l.endtime };
    }
  }

  return { available: true };
}
