'use server';

import { unstable_cache, updateTag } from 'next/cache';
import { getSessionUser, getSessionStudent } from '@/lib/session';
import { NotificationService } from '@/services/notification.service';
import { StudentService } from '@/services/student.service';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { EmailFailure } from '@/lib/email-failure';

const MANUAL_TITLE_MAX = 120;
const MANUAL_MESSAGE_MAX = 1000;

/** Valida e normaliza título/mensagem de um aviso manual. */
function validateManual(title?: string, message?: string): { title: string; message: string } | { error: string } {
  const t = (title || '').trim();
  const m = (message || '').trim();
  if (!t || !m) return { error: 'Preencha o título e a mensagem.' };
  if (t.length > MANUAL_TITLE_MAX) return { error: `O título deve ter no máximo ${MANUAL_TITLE_MAX} caracteres.` };
  if (m.length > MANUAL_MESSAGE_MAX) return { error: `A mensagem deve ter no máximo ${MANUAL_MESSAGE_MAX} caracteres.` };
  return { title: t, message: m };
}

/**
 * Professor envia um aviso manual para UM aluno seu. Confirma que o aluno
 * pertence ao professor logado antes de enviar.
 */
export async function sendManualNotification(
  studentId: string,
  input: { title: string; message: string; sendEmail: boolean },
): Promise<{ success: boolean; emailed?: number; emailTotal?: number; emailFail?: EmailFailure; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Sessão expirada. Faça login novamente.' };

  const valid = validateManual(input.title, input.message);
  if ('error' in valid) return { success: false, error: valid.error };

  const student = await StudentService.getStudentById(studentId);
  if (!student || student.idusers_fk !== user.idusers) {
    return { success: false, error: 'Aluno não encontrado.' };
  }

  const { sent, emailed, emailFail } = await NotificationService.sendManualToStudents({
    students: [{ idstudent: student.idstudent, idusers_fk: student.idusers_fk }],
    senderUserId: user.idusers,
    title: valid.title,
    message: valid.message,
    sendEmail: input.sendEmail,
  });

  if (sent === 0) return { success: false, error: 'Não foi possível enviar o aviso.' };
  return input.sendEmail
    ? { success: true, emailed, emailTotal: 1, emailFail }
    : { success: true };
}

/**
 * Professor envia um aviso manual para TODOS os seus alunos ativos.
 */
export async function broadcastToMyStudents(
  input: { title: string; message: string; sendEmail: boolean },
): Promise<{ success: boolean; count?: number; emailed?: number; emailTotal?: number; emailFail?: EmailFailure; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Sessão expirada. Faça login novamente.' };

  const valid = validateManual(input.title, input.message);
  if ('error' in valid) return { success: false, error: valid.error };

  const students = (await StudentService.getStudentsByUser(user.idusers)).filter(
    (s) => s.status === 'ativo',
  );
  if (students.length === 0) return { success: false, error: 'Você não tem alunos ativos para avisar.' };

  const { sent, emailed, emailFail } = await NotificationService.sendManualToStudents({
    students: students.map((s) => ({ idstudent: s.idstudent, idusers_fk: s.idusers_fk })),
    senderUserId: user.idusers,
    title: valid.title,
    message: valid.message,
    sendEmail: input.sendEmail,
  });

  if (sent === 0) return { success: false, error: 'Não foi possível enviar o aviso.' };
  return input.sendEmail
    ? { success: true, count: sent, emailed, emailTotal: students.length, emailFail }
    : { success: true, count: sent };
}

/**
 * Admin envia um comunicado manual para TODOS os alunos ativos da plataforma.
 * Guard de papel além do layout /admin (defesa em profundidade).
 */
export async function adminBroadcastNotification(
  input: { title: string; message: string; sendEmail: boolean },
): Promise<{ success: boolean; count?: number; emailed?: number; emailTotal?: number; emailFail?: EmailFailure; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Sessão expirada. Faça login novamente.' };
  if (user.usertype !== 'admin') return { success: false, error: 'Ação restrita ao administrador.' };

  const valid = validateManual(input.title, input.message);
  if ('error' in valid) return { success: false, error: valid.error };

  // is_admin() na RLS libera a leitura de todos os alunos.
  const supabase = await createClient();
  const { data: students, error } = await supabase
    .from('student')
    .select('idstudent, idusers_fk')
    .eq('status', 'ativo');
  if (error) return { success: false, error: 'Erro ao carregar os alunos.' };
  if (!students || students.length === 0) return { success: false, error: 'Nenhum aluno ativo encontrado.' };

  const { sent, emailed, emailFail } = await NotificationService.sendManualToStudents({
    students: students.map((s: any) => ({ idstudent: s.idstudent, idusers_fk: s.idusers_fk })),
    senderUserId: undefined,
    title: valid.title,
    message: valid.message,
    sendEmail: input.sendEmail,
  });

  if (sent === 0) return { success: false, error: 'Não foi possível enviar o comunicado.' };
  return input.sendEmail
    ? { success: true, count: sent, emailed, emailTotal: students.length, emailFail }
    : { success: true, count: sent };
}

/**
 * Retorna as notificações de acordo com o papel do usuário (Aluno ou Professor)
 */
export async function fetchMyNotifications() {
  const user = await getSessionUser();
  if (!user) return [];

  // Se for aluno, busca as notificações do aluno
  if (user.usertype === 'aluno') {
    const student = await getSessionStudent();
    if (!student) return [];
    return await NotificationService.getByStudent(student.idstudent);
  } 
  
  // Se for professor ou admin, busca pelo idusers
  return await NotificationService.getByUser(user.idusers);
}

// Contagem de não lidas cacheada por 30s — o sino de notificações dispara em toda navegação.
const cachedUnreadCountStudent = unstable_cache(
  async (idstudent_fk: string) => {
    const { count } = await createAdminClient()
      .from('notification')
      .select('*', { count: 'exact', head: true })
      .eq('idstudent_fk', idstudent_fk)
      .eq('recipient', 'student')
      .eq('read', false);
    return count ?? 0;
  },
  ['unread-count-student'],
  { revalidate: 30, tags: ['unread-count'] }
);

const cachedUnreadCountUser = unstable_cache(
  async (idusers_fk: string) => {
    const { count } = await createAdminClient()
      .from('notification')
      .select('*', { count: 'exact', head: true })
      .eq('idusers_fk', idusers_fk)
      .eq('recipient', 'teacher')
      .eq('read', false);
    return count ?? 0;
  },
  ['unread-count-user'],
  { revalidate: 30, tags: ['unread-count'] }
);

/**
 * Identifica o escopo do sino de notificações para a assinatura Realtime no
 * navegador: professor filtra por idusers_fk, aluno por idstudent_fk.
 * Chamada uma única vez na montagem do componente.
 */
export async function getNotificationScope(): Promise<
  { role: 'teacher' | 'student'; id: string } | null
> {
  const user = await getSessionUser();
  if (!user) return null;

  if (user.usertype === 'aluno') {
    const student = await getSessionStudent();
    if (!student) return null;
    return { role: 'student', id: student.idstudent };
  }

  return { role: 'teacher', id: user.idusers };
}

/**
 * Retorna a contagem de notificações não lidas
 */
export async function getUnreadCount() {
  const user = await getSessionUser();
  if (!user) return 0;

  if (user.usertype === 'aluno') {
    const student = await getSessionStudent();
    if (!student) return 0;
    return await cachedUnreadCountStudent(student.idstudent);
  }

  return await cachedUnreadCountUser(user.idusers);
}

/**
 * Marca uma notificação específica como lida
 */
export async function markAsRead(id: string) {
  const result = await NotificationService.markAsRead(id);
  updateTag('unread-count');
  return result;
}

/**
 * Marca todas as notificações como lidas para o usuário atual
 */
export async function markAllAsRead() {
  const user = await getSessionUser();
  if (!user) return false;

  let result: boolean;
  if (user.usertype === 'aluno') {
    const student = await getSessionStudent();
    if (!student) return false;
    result = await NotificationService.markAllAsRead(student.idstudent);
  } else {
    result = await NotificationService.markAllAsReadByUser(user.idusers);
  }

  if (result) updateTag('unread-count');
  return result;
}
