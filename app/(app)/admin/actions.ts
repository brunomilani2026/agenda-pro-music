'use server';

import { InstrumentService } from '@/services/instrument.service';
import { AdminDashboardService } from '@/services/admin-dashboard.service';
import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/lib/session';

// Defesa em profundidade: a RLS já barra escritas de não-admin (update de 0
// linhas), mas sem este guard o chamador recebia um falso "sucesso".
async function requireAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  return user?.usertype === 'admin';
}

export async function fetchInstruments() {
  return await InstrumentService.getInstrumentCatalog();
}

export async function addInstrument(name: string) {
  if (!name) return { error: 'Nome é obrigatório' };
  const result = await InstrumentService.addInstrumentToCatalog(name);
  if (result) {
    revalidatePath('/admin');
    return { success: true };
  }
  return { error: 'Erro ao adicionar instrumento' };
}

export async function removeInstrument(id: string) {
  const result = await InstrumentService.deleteInstrumentFromCatalog(id);
  if (result) {
    revalidatePath('/admin');
    return { success: true };
  }
  return { error: 'Erro ao remover instrumento' };
}

export async function fetchAdminKPIs() {
  return await AdminDashboardService.getKPIs();
}

/**
 * Núcleo do painel: só o que a aba inicial (Dashboard/Overview) precisa —
 * KPIs + catálogo de instrumentos. É o caminho crítico do primeiro paint.
 */
export async function fetchAdminCore() {
  const [instruments, kpis] = await Promise.all([
    InstrumentService.getInstrumentCatalog(),
    AdminDashboardService.getKPIs(),
  ]);
  return { instruments, kpis };
}

/**
 * Diretório de usuários + pendências (abas Usuários/Professores).
 * Carregado em background, DEPOIS do núcleo, para não competir com o getKPIs
 * pelo pool de conexões (varre users/student/teacher/payment).
 */
export async function fetchAdminUsers() {
  const [pendingUsers, activeUsers] = await Promise.all([
    AdminDashboardService.getPendingUsers(),
    AdminDashboardService.fetchAllAdminUsersList(),
  ]);
  return { pendingUsers, activeUsers };
}

export type AdminFeedbackItem = {
  id: string;
  rating: number;
  message: string | null;
  created_at: string;
  authorName: string;
  authorEmail: string;
  authorType: string;
};

/**
 * Lista os feedbacks (nota + comentário) com os dados de quem enviou.
 * Via admin client: o RLS de `feedback` só autoriza cada usuário a ver o
 * próprio registro — o guard requireAdmin faz o controle de acesso aqui.
 */
export async function fetchFeedbacks(): Promise<AdminFeedbackItem[]> {
  if (!(await requireAdmin())) return [];
  const { createAdminClient } = await import('@/lib/supabase/server');
  const { data, error } = await createAdminClient()
    .from('feedback')
    .select('id, rating, message, created_at, users:idusers_fk (fname, email, usertype)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('Error fetching feedbacks:', error.message);
    return [];
  }
  return (data || []).map((f: any) => ({
    id: f.id,
    rating: f.rating,
    message: f.message,
    created_at: f.created_at,
    authorName: f.users?.fname || 'Usuário removido',
    authorEmail: f.users?.email || '',
    authorType: f.users?.usertype || '',
  }));
}

export async function fetchPendingUsers() {
  return await AdminDashboardService.getPendingUsers();
}

export async function fetchActiveUsersList() {
  return await AdminDashboardService.fetchAllAdminUsersList();
}

export async function approveUser(userId: string) {
  if (!(await requireAdmin())) return { error: 'Apenas administradores podem aprovar usuários.' };
  const success = await AdminDashboardService.approveUser(userId);
  if (success) {
    // A tela de cadastro promete "confirmação no seu e-mail em até 24 horas" —
    // cumpre a promessa avisando o usuário aprovado.
    try {
      const { createAdminClient } = await import('@/lib/supabase/server');
      const { data: approved } = await createAdminClient()
        .from('users')
        .select('email, fname')
        .eq('idusers', userId)
        .maybeSingle();
      if (approved?.email) {
        const { EmailService } = await import('@/services/email.service');
        await EmailService.sendNotification({
          toEmail: approved.email,
          toName: approved.fname || '',
          title: 'Conta aprovada!',
          message: `Olá, ${approved.fname || ''}! Sua conta no Agenda Pro Music foi aprovada. Você já pode entrar e começar a usar o painel.`,
          buttonLabel: 'Entrar agora',
          buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.agendapromusic.com.br'}/login`,
        });
      }
    } catch (e: any) {
      console.error('Erro ao enviar e-mail de aprovação:', e?.message);
    }
    revalidatePath('/admin');
    return { success: true };
  }
  return { error: 'Erro ao aprovar usuário' };
}

export async function rejectUser(userId: string) {
  if (!(await requireAdmin())) return { error: 'Apenas administradores podem rejeitar usuários.' };
  const success = await AdminDashboardService.rejectUser(userId);
  if (success) {
    revalidatePath('/admin');
    return { success: true };
  }
  return { error: 'Erro ao rejeitar usuário' };
}

export async function updateUserAdmin(id: string, type: 'Aluno' | 'Professor', data: { name?: string, email?: string, detail?: string }) {
  if (!(await requireAdmin())) return { error: 'Apenas administradores podem editar usuários.' };
  const success = await AdminDashboardService.updateUserAdmin(id, type, data);
  if (success) {
    revalidatePath('/admin');
    return { success: true };
  }
  return { error: 'Erro ao atualizar dados do usuário' };
}

export async function toggleUserStatusAdmin(id: string, type: 'Aluno' | 'Professor', newStatus: 'Ativo' | 'Bloqueado') {
  if (!(await requireAdmin())) return { error: 'Apenas administradores podem alterar status.' };
  const success = await AdminDashboardService.toggleUserStatusAdmin(id, type, newStatus);
  if (success) {
    revalidatePath('/admin');
    return { success: true };
  }
  return { error: 'Erro ao alterar status do usuário' };
}
