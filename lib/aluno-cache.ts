import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import type { Lesson, Payment, Credit, Notification } from '@/types/database.types';
import { getLocalISODate } from '@/lib/utils';

// NOTA: estes caches usam o cliente admin (service_role) porque rodam dentro de
// unstable_cache (sem cookies) e são chaveados por id de aluno/professor.
// As queries filtram explicitamente por esse id, e o CALLER autoriza passando o
// id derivado da sessão (getSessionStudent) — que não é forjável.

// ─── Lições ─────────────────────────────────────────────────────────────────

export const cachedLessonsByStudentName = unstable_cache(
  async (idusers_fk: string, studentName: string) => {
    const { data } = await createAdminClient()
      .from('lesson')
      .select('idlesson, date, starttime, endtime, instrument, teachername, lessonstatus, obs')
      .eq('idusers_fk', idusers_fk)
      .ilike('studentname', studentName)
      .order('date', { ascending: false });
    return (data as Lesson[]) ?? [];
  },
  ['aluno-lessons'],
  { revalidate: 60, tags: ['aluno-lessons'] }
);

type LessonSlot = Pick<Lesson, 'idlesson' | 'starttime' | 'endtime' | 'lessonstatus'>;

export const cachedLessonsByUserAndDate = unstable_cache(
  async (idusers_fk: string, date: string): Promise<LessonSlot[]> => {
    let d = date.trim();
    if (d.includes('/')) {
      const p = d.split('/');
      if (p.length === 3) d = `${p[2]}-${p[1]}-${p[0]}`;
    }
    const { data } = await createAdminClient()
      .from('lesson')
      .select('idlesson, starttime, endtime, lessonstatus')
      .eq('idusers_fk', idusers_fk)
      .eq('date', d);
    return (data as LessonSlot[]) ?? [];
  },
  ['aluno-lessons-date'],
  { revalidate: 60, tags: ['aluno-lessons'] }
);

// ─── Pagamentos ──────────────────────────────────────────────────────────────

export const cachedPaymentsByStudent = unstable_cache(
  async (idstudent_fk: string) => {
    const { data } = await createAdminClient()
      .from('payment')
      .select('*')
      .eq('idstudent_fk', idstudent_fk)
      .order('duedate', { ascending: false });
    return (data as Payment[]) ?? [];
  },
  ['aluno-payments'],
  { revalidate: 30, tags: ['aluno-payments'] }
);

// ─── Créditos ────────────────────────────────────────────────────────────────

export const cachedActiveCredits = unstable_cache(
  async (idstudent_fk: string): Promise<Credit[]> => {
    const { data } = await createAdminClient()
      .from('credit')
      .select('*')
      .eq('idstudent_fk', idstudent_fk)
      .eq('used', false)
      // Mesmo critério de CreditService.getActiveCredits: crédito vale até o
      // fim do dia de expiração (data local, inclusivo) — UI e server iguais.
      .gte('expires_at', getLocalISODate());
    return (data as Credit[]) ?? [];
  },
  ['aluno-credits'],
  { revalidate: 60, tags: ['aluno-credits'] }
);

// ─── Upcoming Lessons com Payments ───────────────────────────────────────────

export const cachedUpcomingLessonsWithPayments = unstable_cache(
  async (idusers_fk: string, studentName: string, today: string) => {
    const { data } = await createAdminClient()
      .from('lesson')
      .select(`
        idlesson, date, starttime, endtime, instrument, teachername, lessonstatus,
        payment!payment_lesson_fk_fkey (
          id, amount, status, duedate, asaas_invoice_url, asaas_pix_payload
        )
      `)
      .eq('idusers_fk', idusers_fk)
      .ilike('studentname', studentName)
      .in('lessonstatus', ['agendada', 'aguardando_pagamento'])
      .gte('date', today)
      .order('date', { ascending: true })
      .order('starttime', { ascending: true });
    return (data as any[]) ?? [];
  },
  ['aluno-upcoming-payments'],
  { revalidate: 30, tags: ['aluno-lessons', 'aluno-payments'] }
);

// ─── Notificações ────────────────────────────────────────────────────────────

export const cachedNotificationsByStudent = unstable_cache(
  async (idstudent_fk: string): Promise<Notification[]> => {
    const { data } = await createAdminClient()
      .from('notification')
      .select('*')
      .eq('idstudent_fk', idstudent_fk)
      .eq('recipient', 'student')
      .order('created_at', { ascending: false })
      .limit(50);
    return (data as Notification[]) ?? [];
  },
  ['aluno-notifications'],
  { revalidate: 30, tags: ['aluno-notifications', 'unread-count'] }
);
