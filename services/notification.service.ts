import { after } from 'next/server';
import { safeUpdateTag } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import { Notification } from '@/types/database.types';
import { emailStudent, emailTeacher } from '@/lib/notify-email';
import type { EmailFailure } from '@/lib/email-failure';

export class NotificationService {
  static async getByUser(idusers_fk: string): Promise<Notification[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('notification')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .eq('recipient', 'teacher')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching notifications:', error.message);
      return [];
    }
    return data || [];
  }

  static async getByStudent(idstudent_fk: string): Promise<Notification[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('notification')
      .select('*')
      .eq('idstudent_fk', idstudent_fk)
      .eq('recipient', 'student')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching student notifications:', error.message);
      return [];
    }
    return data || [];
  }

  static async create(
    notifData: Omit<Notification, 'id' | 'created_at' | 'read'>,
    options?: { emailTeacher?: boolean }
  ): Promise<Notification | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('notification')
      .insert([{ ...notifData, read: false }])
      .select()
      .single();

    if (error) {
      console.error('Error creating notification:', error.message);
      return null;
    }

    if (data) {
      // Badge do sino e lista do aluno atualizam na hora (fallback do Realtime).
      safeUpdateTag('unread-count');
      safeUpdateTag('aluno-notifications');
    }

    if (data && options?.emailTeacher && notifData.idusers_fk && process.env.EMAILJS_TEMPLATE_NOTIFICATION) {
      // `after` segura o runtime até o envio terminar. Uma promise solta era
      // congelada junto com a função serverless assim que a action respondia,
      // então o e-mail chegava ou não dependendo do tempo do fetch.
      const teacherId = notifData.idusers_fk;
      after(() =>
        emailTeacher(teacherId, {
          title: notifData.title || 'Nova notificação',
          message: notifData.message || '',
        }),
      );
    }

    return data;
  }

  /**
   * Envia uma notificação MANUAL (type 'manual') para um ou vários alunos —
   * usado pelo professor (aviso a um aluno ou a todos os seus) e pelo admin
   * (comunicado a todos os alunos da plataforma).
   *
   * Faz um único INSERT em lote e, se `sendEmail`, espelha por e-mail (best
   * effort). `senderUserId` é gravado em `idusers_fk`; se ausente (broadcast do
   * admin), usa o professor dono de cada aluno (`idusers_fk` do aluno).
   *
   * A RLS de `notif_insert` autoriza: professor (idusers_fk = auth.uid()) e
   * admin (is_admin()). O aluno enxerga via idstudent_fk.
   */
  static async sendManualToStudents(params: {
    students: { idstudent: string; idusers_fk?: string | null }[];
    senderUserId?: string;
    title: string;
    message: string;
    sendEmail: boolean;
  }): Promise<{ sent: number; emailed: number; emailFail?: EmailFailure }> {
    const { students, senderUserId, title, message, sendEmail } = params;
    if (students.length === 0) return { sent: 0, emailed: 0 };

    const supabase = await createClient();
    const rows = students.map((s) => ({
      idstudent_fk: s.idstudent,
      idusers_fk: senderUserId ?? s.idusers_fk ?? null,
      recipient: 'student' as const,
      type: 'manual' as const,
      title,
      message,
      read: false,
    }));

    const { data, error } = await supabase.from('notification').insert(rows).select('id');
    if (error) {
      console.error('Error sending manual notifications:', error.message);
      return { sent: 0, emailed: 0 };
    }

    let emailed = 0;
    let emailFail: EmailFailure | undefined;
    if (sendEmail) {
      const results = await Promise.allSettled(
        students.map((s) =>
          emailStudent(s.idstudent, {
            title,
            message,
            buttonLabel: 'Ver no app',
            buttonPath: '/aluno/notificacoes',
          }),
        ),
      );
      // emailStudent nunca rejeita — o sucesso real vem no EmailResult retornado.
      // A primeira falha vira `emailFail` para o toast dizer o motivo exato.
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) {
          emailed++;
        } else if (!emailFail) {
          emailFail =
            r.status === 'fulfilled' && !r.value.ok
              ? { reason: r.value.reason, detail: r.value.detail }
              : { reason: 'lookup' };
        }
      }
    }

    return { sent: data?.length ?? 0, emailed, emailFail };
  }

  static async markAsRead(id: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('notification')
      .update({ read: true })
      .eq('id', id);

    if (error) {
      console.error('Error marking notification as read:', error.message);
      return false;
    }
    return true;
  }

  static async markAllAsRead(idstudent_fk: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('notification')
      .update({ read: true })
      .eq('idstudent_fk', idstudent_fk)
      .eq('recipient', 'student')
      .eq('read', false);

    if (error) {
      console.error('Error marking all notifications as read:', error.message);
      return false;
    }
    return true;
  }

  static async markAllAsReadByUser(idusers_fk: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('notification')
      .update({ read: true })
      .eq('idusers_fk', idusers_fk)
      .eq('recipient', 'teacher')
      .eq('read', false);

    if (error) {
      console.error('Error marking all notifications as read for user:', error.message);
      return false;
    }
    return true;
  }
}
