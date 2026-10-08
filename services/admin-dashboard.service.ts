import { createClient } from '@/lib/supabase/server';
import { User } from '@/types/database.types';
import { getLocalISODate } from '@/lib/utils';
import { safeUpdateTag } from '@/lib/cache';
import { syncStudentIntoLessons } from '@/services/student-sync.service';

export interface ActivityLog {
  id: string;
  type: 'payment' | 'student' | 'lesson' | 'user' | 'request';
  title: string;
  description: string;
  time: string;
  date: Date;
}

export interface KpiBreakdown {
  label: string;
  value: number;
  percentage?: number;
}

export interface ActiveUserItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  type: 'Aluno' | 'Professor';
  status: string;
  detail: string;
  avatarUrl?: string;
  tags?: string[];
}

export interface FinanceKPIs {
  totalRevenue: number;
  monthlyRevenue: number;
  delinquencyRate: number;
  totalInvoices: number;
  overdueInvoices: number;
  averageTicketPerStudent: number;
  revenueByMethod: KpiBreakdown[];
  renegotiatedVolume: number;
  arpu: number;
  agingProjection: { bucket: string; amount: number; count: number }[];
  revenueByInstrument: KpiBreakdown[];
}

export interface OperationsKPIs {
  lessonsCompleted: number;
  lessonsScheduled: number;
  lessonsCanceled: number;
  cancellationRate: number;
  reschedulingRequestsCount: number;
  teacherOccupancy: KpiBreakdown[];
  instrumentDemand: KpiBreakdown[];
  avgApprovalTimeHours: number | null;
  pendingRequestsCount: number;
}

export interface RetentionKPIs {
  creditUtilizationRate: number;
  totalCreditsBought: number;
  totalCreditsUsed: number;
  churnCount: number;
  expiredCreditsCount: number;
  avgCreditUsageDays: number | null;
  ltvTop: { student: string; ltv: number }[];
}

export interface EngagementKPIs {
  signupConversionRate: number;
  totalApprovedUsers: number;
  totalPendingUsers: number;
  packagePopularity: { name: string; sales: number; revenue: number }[];
  notificationReadRate: number;
  notificationsTotal: number;
  inactiveStudentsCount: number;
  baseGrowth: { month: string; newPayments: number; newRequests: number }[];
}

export interface SystemKPIs {
  passwordResetCount: number;
  studentsWithoutCpf: number;
  asaasIntegrationRate: number;
  totalStudents: number;
  studentsWithAsaas: number;
}

export interface AdminKPIs {
  // Visão geral (compatibilidade com layout anterior)
  totalStudents: number;
  totalTeachers: number;
  monthlyRevenue: number;
  lessonsThisMonth: number;
  activeStudents: number;
  pendingPaymentsCount: number;
  overdueAmount: number;
  completedLessonsMonth: number;
  recentActivity: ActivityLog[];
  instrumentDistribution: { label: string; percentage: number }[];

  // Categorias detalhadas
  finance: FinanceKPIs;
  operations: OperationsKPIs;
  retention: RetentionKPIs;
  engagement: EngagementKPIs;
  system: SystemKPIs;
}

const METHOD_LABELS: Record<string, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isoDate(date: Date): string {
  return getLocalISODate(date);
}

export class AdminDashboardService {
  /**
   * Fallback de admin_lesson_kpis: mesmas métricas calculadas em memória.
   * Varre a tabela `lesson` inteira — só use enquanto a RPC não existir.
   */
  private static async computeLessonKpisInMemory(
    supabase: Awaited<ReturnType<typeof createClient>>,
    monthIsoDate: string
  ) {
    const { data } = await supabase
      .from('lesson')
      .select('lessonstatus, instrument, teachername, date');
    const rows = data ?? [];

    const top5 = (counts: Record<string, number>): KpiBreakdown[] =>
      Object.entries(counts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    const teacherCounts: Record<string, number> = {};
    const instrumentCounts: Record<string, number> = {};
    for (const l of rows) {
      if (l.teachername) teacherCounts[l.teachername] = (teacherCounts[l.teachername] || 0) + 1;
      const key = l.instrument || 'Não definido';
      instrumentCounts[key] = (instrumentCounts[key] || 0) + 1;
    }

    return {
      total: rows.length,
      completed: rows.filter(l => l.lessonstatus === 'realizada').length,
      scheduled: rows.filter(l => l.lessonstatus === 'agendada').length,
      canceled: rows.filter(l => l.lessonstatus === 'cancelada').length,
      this_month: rows.filter(l => l.date && l.date >= monthIsoDate).length,
      completed_month: rows.filter(l => l.lessonstatus === 'realizada' && l.date && l.date >= monthIsoDate).length,
      by_teacher: top5(teacherCounts),
      by_instrument: top5(instrumentCounts),
    };
  }

  static async getKPIs(): Promise<AdminKPIs> {
    const supabase = await createClient();
    const now = new Date();
    const firstDayOfMonth = startOfMonth(now);
    const monthIsoDate = isoDate(firstDayOfMonth);
    const todayIso = isoDate(now);
    // Health score: alunos sem aula realizada nos últimos 15 dias.
    const cutoffIso = isoDate(new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000));

    // ============================================================
    // TODAS as leituras independentes numa ÚNICA leva concorrente.
    // Antes eram ~15 round-trips em cascata (payment → lesson →
    // request → student → credit → ...); agora um só batch paralelo.
    // Também eliminamos 3 varreduras redundantes da tabela `student`
    // (contagens + distribuição + receita por instrumento agora saem
    // de um único fetch de alunos, calculado em memória).
    // ============================================================
    const [
      teachersRes,
      paymentsRes,
      lessonsRes,
      requestsRes,
      studentsRes,
      creditsRes,
      approvedUsersRes,
      pendingUsersRes,
      notifTotalRes,
      notifReadRes,
      pwTokensRes,
      recentActivity,
      recentLessonStudentsRes,
    ] = await Promise.all([
      supabase.from('teacher').select('*', { count: 'exact', head: true }),
      supabase
        .from('payment')
        .select('id, amount, status, method, duedate, paymentdate, created_at, idstudent_fk, renegotiated_from, credits_qty'),
      // Agregado no Postgres (~12 linhas) em vez de baixar a tabela `lesson`
      // inteira da plataforma para contar em JS. Ver admin_lesson_kpis.
      supabase.rpc('admin_lesson_kpis', { month_start: monthIsoDate }),
      supabase.from('lesson_request').select('id, type, status, created_at, updated_at'),
      supabase
        .from('student')
        .select('idstudent, name, instrument, status, totallessons, usedlessons, expirationdate, cpf, asaas_customer_id'),
      supabase.from('credit').select('id, expires_at, used, used_at, created_at'),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('accountstatus', 'approved'),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('accountstatus', 'waiting_approvement'),
      supabase.from('notification').select('*', { count: 'exact', head: true }),
      supabase.from('notification').select('*', { count: 'exact', head: true }).eq('read', true),
      supabase.from('password_reset_token').select('*', { count: 'exact', head: true }),
      this.getRecentActivity(),
      // Só os nomes das últimas 2 semanas — antes isto saía de uma varredura
      // da tabela `lesson` inteira filtrada em memória.
      supabase
        .from('lesson')
        .select('studentname')
        .eq('lessonstatus', 'realizada')
        .gte('date', cutoffIso),
    ]);

    const payments = paymentsRes.data || [];
    const allRequests = requestsRes.data || [];
    const studentRows = studentsRes.data || [];
    const credits = creditsRes.data || [];

    // Mapas de aluno reaproveitados em várias métricas (evita queries extras).
    const instrumentByStudent: Record<string, string> = {};
    const studentNameById: Record<string, string> = {};
    studentRows.forEach(s => {
      instrumentByStudent[s.idstudent] = s.instrument || 'Não definido';
      studentNameById[s.idstudent] = s.name;
    });

    // === Contagens básicas (derivadas em memória, sem queries extras) ===
    const totalTeachers = teachersRes.count || 0;
    const totalStudents = studentRows.length;
    const activeStudents = studentRows.filter(s => s.status === 'ativo').length;
    const studentsWithAsaas = studentRows.filter(s => (s as any).asaas_customer_id != null).length;
    const studentsWithoutCpf = studentRows.filter(s => !(s as any).cpf).length;

    // === Pagamentos (faturamento, inadimplência, métodos, renegociação) ===
    const paid = payments.filter(p => p.status === 'pago');
    const overdue = payments.filter(p => p.status === 'pendente' && p.duedate && p.duedate < todayIso);
    const pendingPaymentsCount = payments.filter(p => p.status === 'pendente').length;

    const totalRevenue = paid.reduce((acc, p) => acc + toNumber(p.amount), 0);
    const monthlyRevenue = paid
      .filter(p => p.paymentdate && p.paymentdate >= monthIsoDate)
      .reduce((acc, p) => acc + toNumber(p.amount), 0);
    const overdueAmount = overdue.reduce((acc, p) => acc + toNumber(p.amount), 0);

    const totalInvoices = payments.length;
    const delinquencyRate = totalInvoices > 0 ? (overdue.length / totalInvoices) * 100 : 0;

    const payingStudentIds = new Set(paid.map(p => p.idstudent_fk));
    const averageTicketPerStudent = payingStudentIds.size > 0 ? totalRevenue / payingStudentIds.size : 0;
    const arpu = totalStudents > 0 ? totalRevenue / totalStudents : 0;

    // Receita por método
    const methodTotals: Record<string, number> = {};
    paid.forEach(p => {
      const key = p.method || 'desconhecido';
      methodTotals[key] = (methodTotals[key] || 0) + toNumber(p.amount);
    });
    const revenueByMethod: KpiBreakdown[] = Object.entries(methodTotals)
      .map(([method, value]) => ({
        label: METHOD_LABELS[method] || method,
        value,
        percentage: totalRevenue > 0 ? Math.round((value / totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    // Renegociação
    const renegotiatedVolume = payments
      .filter(p => p.renegotiated_from)
      .reduce((acc, p) => acc + toNumber(p.amount), 0);

    // Aging — projeção de pendentes por faixa de vencimento
    const agingBuckets = {
      'Vencidos': 0,
      'A vencer (0-7d)': 0,
      'A vencer (8-30d)': 0,
      'A vencer (30+d)': 0,
    };
    const agingCounts = { ...agingBuckets };
    payments
      .filter(p => p.status === 'pendente' && p.duedate)
      .forEach(p => {
        const diffDays = Math.floor(
          (new Date(p.duedate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        let bucket: keyof typeof agingBuckets;
        if (diffDays < 0) bucket = 'Vencidos';
        else if (diffDays <= 7) bucket = 'A vencer (0-7d)';
        else if (diffDays <= 30) bucket = 'A vencer (8-30d)';
        else bucket = 'A vencer (30+d)';
        agingBuckets[bucket] += toNumber(p.amount);
        agingCounts[bucket] += 1;
      });
    const agingProjection = Object.entries(agingBuckets).map(([bucket, amount]) => ({
      bucket,
      amount,
      count: agingCounts[bucket as keyof typeof agingCounts],
    }));

    // Receita por instrumento — usa o mapa já carregado (sem query extra)
    const revenueByInstrument = this.computeRevenueByInstrument(paid, instrumentByStudent);

    // Distribuição de alunos por instrumento (compat) — em memória
    const instrumentDistribution = this.computeInstrumentDistribution(studentRows);

    // === Aulas (agregadas pelo Postgres) ===
    type LessonKpis = {
      total?: number; completed?: number; scheduled?: number; canceled?: number;
      this_month?: number; completed_month?: number;
      by_teacher?: KpiBreakdown[]; by_instrument?: KpiBreakdown[];
    };

    let lk: LessonKpis;
    if (lessonsRes.error) {
      // A RPC é criada por migração aplicada à mão no Supabase. Enquanto ela
      // não existir, calculamos como antes para o painel não regredir —
      // é a versão lenta (varre a tabela), por isso só como fallback.
      console.warn(
        'admin_lesson_kpis indisponível — usando cálculo em memória. ' +
        'Aplique migrations/2026-07-18-admin-kpi-rpc.sql para o caminho rápido. ' +
        `Motivo: ${lessonsRes.error.message}`
      );
      lk = await this.computeLessonKpisInMemory(supabase, monthIsoDate);
    } else {
      lk = (lessonsRes.data ?? {}) as LessonKpis;
    }

    const totalLessons = lk.total ?? 0;
    const lessonsThisMonth = lk.this_month ?? 0;
    const completedLessonsMonth = lk.completed_month ?? 0;
    const lessonsCompleted = lk.completed ?? 0;
    const lessonsScheduled = lk.scheduled ?? 0;
    const lessonsCanceled = lk.canceled ?? 0;
    const cancellationRate = totalLessons > 0 ? (lessonsCanceled / totalLessons) * 100 : 0;

    // Top 5 por professor e por instrumento — já ordenados e cortados no SQL.
    const teacherOccupancy: KpiBreakdown[] = lk.by_teacher ?? [];
    const instrumentDemand: KpiBreakdown[] = lk.by_instrument ?? [];

    // === Solicitações ===
    const reschedulingRequestsCount = allRequests.filter(r => r.type === 'remarcacao').length;
    const pendingRequestsCount = allRequests.filter(r => r.status === 'pendente').length;

    const approved = allRequests.filter(r => r.status === 'aprovada' && r.updated_at);
    let avgApprovalTimeHours: number | null = null;
    if (approved.length > 0) {
      const totalMs = approved.reduce((acc, r) => {
        const created = new Date(r.created_at).getTime();
        const updated = new Date(r.updated_at!).getTime();
        return acc + Math.max(0, updated - created);
      }, 0);
      avgApprovalTimeHours = totalMs / approved.length / (1000 * 60 * 60);
    }

    // === Créditos e retenção ===
    const totalCreditsBought = studentRows.reduce((acc, s) => acc + toNumber(s.totallessons), 0);
    const totalCreditsUsed = studentRows.reduce((acc, s) => acc + toNumber(s.usedlessons), 0);
    const creditUtilizationRate = totalCreditsBought > 0
      ? (totalCreditsUsed / totalCreditsBought) * 100
      : 0;

    // Churn: alunos com expirationdate passado OU status diferente de 'ativo'
    const churnCount = studentRows.filter(s => {
      const expired = s.expirationdate && s.expirationdate < todayIso;
      const inactive = s.status && s.status !== 'ativo';
      return expired || inactive;
    }).length;

    const expiredCreditsCount = credits.filter(
      c => !c.used && c.expires_at && c.expires_at < todayIso
    ).length;

    const usedCredits = credits.filter(c => c.used && c.used_at);
    let avgCreditUsageDays: number | null = null;
    if (usedCredits.length > 0) {
      const totalMs = usedCredits.reduce((acc, c) => {
        const created = new Date(c.created_at).getTime();
        const used = new Date(c.used_at!).getTime();
        return acc + Math.max(0, used - created);
      }, 0);
      avgCreditUsageDays = totalMs / usedCredits.length / (1000 * 60 * 60 * 24);
    }

    // LTV por aluno — top 5
    const ltvMap: Record<string, number> = {};
    paid.forEach(p => {
      if (!p.idstudent_fk) return;
      ltvMap[p.idstudent_fk] = (ltvMap[p.idstudent_fk] || 0) + toNumber(p.amount);
    });
    const ltvTop = Object.entries(ltvMap)
      .map(([id, ltv]) => ({ student: studentNameById[id] || 'Aluno', ltv }))
      .sort((a, b) => b.ltv - a.ltv)
      .slice(0, 5);

    // === Engajamento e crescimento ===
    const totalApprovedUsers = approvedUsersRes.count || 0;
    const totalPendingUsers = pendingUsersRes.count || 0;
    const totalUsers = totalApprovedUsers + totalPendingUsers;
    const signupConversionRate = totalUsers > 0 ? (totalApprovedUsers / totalUsers) * 100 : 0;

    // Popularidade dos pacotes — agrupa por credits_qty (proxy do pacote vendido)
    const packageSales: Record<number, { sales: number; revenue: number }> = {};
    paid
      .filter(p => p.credits_qty && p.credits_qty > 0)
      .forEach(p => {
        const qty = p.credits_qty as number;
        if (!packageSales[qty]) packageSales[qty] = { sales: 0, revenue: 0 };
        packageSales[qty].sales += 1;
        packageSales[qty].revenue += toNumber(p.amount);
      });
    const packagePopularity = Object.entries(packageSales)
      .map(([credits, stats]) => ({
        name: `${credits} crédito${Number(credits) > 1 ? 's' : ''}`,
        sales: stats.sales,
        revenue: stats.revenue,
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    // Notificações
    const notificationsTotal = notifTotalRes.count || 0;
    const notificationReadRate = notificationsTotal > 0
      ? ((notifReadRes.count || 0) / notificationsTotal) * 100
      : 0;

    // Health score — alunos sem aula nos últimos 15 dias.
    // lesson não tem idstudent direto — usamos studentName como proxy.
    const studentsWithRecentLessons = new Set<string>(
      (recentLessonStudentsRes.data ?? [])
        .map((l: { studentname: string | null }) => l.studentname)
        .filter((n): n is string => !!n)
    );
    const inactiveStudentsCount = studentRows.filter(
      s => !studentsWithRecentLessons.has(s.name) && s.status === 'ativo'
    ).length;

    // Crescimento da base — últimos 6 meses, baseado em pagamentos e solicitações
    const baseGrowth = this.computeBaseGrowth(payments, allRequests, now);

    // === Segurança e sistema ===
    const passwordResetCount = pwTokensRes.count || 0;
    const asaasIntegrationRate = totalStudents > 0
      ? (studentsWithAsaas / totalStudents) * 100
      : 0;

    return {
      totalStudents,
      totalTeachers,
      monthlyRevenue,
      lessonsThisMonth,
      activeStudents,
      pendingPaymentsCount,
      overdueAmount,
      completedLessonsMonth,
      recentActivity,
      instrumentDistribution,

      finance: {
        totalRevenue,
        monthlyRevenue,
        delinquencyRate,
        totalInvoices,
        overdueInvoices: overdue.length,
        averageTicketPerStudent,
        revenueByMethod,
        renegotiatedVolume,
        arpu,
        agingProjection,
        revenueByInstrument,
      },
      operations: {
        lessonsCompleted,
        lessonsScheduled,
        lessonsCanceled,
        cancellationRate,
        reschedulingRequestsCount,
        teacherOccupancy,
        instrumentDemand,
        avgApprovalTimeHours,
        pendingRequestsCount,
      },
      retention: {
        creditUtilizationRate,
        totalCreditsBought,
        totalCreditsUsed,
        churnCount,
        expiredCreditsCount,
        avgCreditUsageDays,
        ltvTop,
      },
      engagement: {
        signupConversionRate,
        totalApprovedUsers,
        totalPendingUsers,
        packagePopularity,
        notificationReadRate,
        notificationsTotal,
        inactiveStudentsCount,
        baseGrowth,
      },
      system: {
        passwordResetCount,
        studentsWithoutCpf,
        asaasIntegrationRate,
        totalStudents,
        studentsWithAsaas,
      },
    };
  }

  // Receita por instrumento a partir do mapa (idstudent → instrumento) já
  // carregado no getKPIs. Puro/síncrono: não faz nenhuma query.
  private static computeRevenueByInstrument(
    paidPayments: any[],
    instrumentByStudent: Record<string, string>
  ): KpiBreakdown[] {
    if (paidPayments.length === 0) return [];

    const totals: Record<string, number> = {};
    let grandTotal = 0;
    paidPayments.forEach(p => {
      const inst = instrumentByStudent[p.idstudent_fk] || 'Não definido';
      const amt = toNumber(p.amount);
      totals[inst] = (totals[inst] || 0) + amt;
      grandTotal += amt;
    });

    return Object.entries(totals)
      .map(([label, value]) => ({
        label,
        value,
        percentage: grandTotal > 0 ? Math.round((value / grandTotal) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }

  // Distribuição de alunos por instrumento a partir das linhas já carregadas.
  // Puro/síncrono: não faz nenhuma query.
  private static computeInstrumentDistribution(
    studentRows: { instrument?: string | null }[]
  ): { label: string; percentage: number }[] {
    if (studentRows.length === 0) return [];

    const counts: Record<string, number> = {};
    studentRows.forEach(s => {
      const inst = s.instrument || 'Outros';
      counts[inst] = (counts[inst] || 0) + 1;
    });

    const total = studentRows.length;
    return Object.entries(counts)
      .map(([label, count]) => ({
        label,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5);
  }

  private static computeBaseGrowth(
    payments: any[],
    requests: any[],
    now: Date
  ): { month: string; newPayments: number; newRequests: number }[] {
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      months.push({ key, label });
    }

    const paymentsByMonth: Record<string, Set<string>> = {};
    payments.forEach(p => {
      if (!p.created_at || !p.idstudent_fk) return;
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!paymentsByMonth[key]) paymentsByMonth[key] = new Set();
      paymentsByMonth[key].add(p.idstudent_fk);
    });

    const requestsByMonth: Record<string, number> = {};
    requests.forEach(r => {
      if (!r.created_at) return;
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      requestsByMonth[key] = (requestsByMonth[key] || 0) + 1;
    });

    return months.map(m => ({
      month: m.label,
      newPayments: paymentsByMonth[m.key]?.size || 0,
      newRequests: requestsByMonth[m.key] || 0,
    }));
  }

  static async getRecentActivity(): Promise<ActivityLog[]> {
    const supabase = await createClient();
    const logs: ActivityLog[] = [];

    try {
      // Pagamentos e solicitações recentes em paralelo (2 queries concorrentes).
      const [{ data: payments }, { data: requests }] = await Promise.all([
        supabase
          .from('payment')
          .select('id, amount, status, created_at, student:student(name)')
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('lesson_request')
          .select('id, type, created_at, student:student(name)')
          .order('created_at', { ascending: false })
          .limit(3),
      ]);

      payments?.forEach(p => {
        logs.push({
          id: p.id,
          type: 'payment',
          title: p.status === 'pago' ? 'Pagamento Recebido' : 'Cobrança Gerada',
          description: `${(p as any).student?.name || 'Aluno'} - R$ ${Number(p.amount).toFixed(2)}`,
          time: this.formatRelativeTime(new Date(p.created_at)),
          date: new Date(p.created_at),
        });
      });

      requests?.forEach(r => {
        logs.push({
          id: r.id,
          type: 'request',
          title: `Solicitação: ${r.type}`,
          description: `Por ${(r as any).student?.name || 'Aluno'}.`,
          time: this.formatRelativeTime(new Date(r.created_at)),
          date: new Date(r.created_at),
        });
      });
    } catch (e) {
      console.error('Error in getRecentActivity:', e);
    }

    return logs.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 6);
  }

  private static formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMins < 1) return 'Agora';
    if (diffInMins < 60) return `${diffInMins}m atrás`;
    if (diffInHours < 24) return `${diffInHours}h atrás`;
    return `${diffInDays}d atrás`;
  }

  static async getPendingUsers(): Promise<User[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('accountstatus', 'waiting_approvement')
      .order('idusers', { ascending: false });

    return (data as User[]) || [];
  }

  static async approveUser(userId: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase.from('users').update({ accountstatus: 'approved' }).eq('idusers', userId);
    return !error;
  }

  static async rejectUser(userId: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase.from('users').delete().eq('idusers', userId);
    return !error;
  }

  static async fetchAllAdminUsersList(): Promise<ActiveUserItem[]> {
    const supabase = await createClient();
    const usersList: ActiveUserItem[] = [];

    // Todas as leituras em paralelo — antes eram 4 queries em cascata.
    const todayIso = isoDate(new Date());
    const [
      { data: allUsers },
      { data: students },
      { data: overduePayments },
      { data: teachers },
    ] = await Promise.all([
      supabase.from('users').select('idusers, email, fname, accountstatus'),
      supabase.from('student').select('idstudent, name, email, status, instrument, avatar_url'),
      supabase.from('payment').select('idstudent_fk').eq('status', 'pendente').lt('duedate', todayIso),
      supabase.from('teacher').select('idteacher, idusers_fk, avatar_url'),
    ]);

    const usersByEmail = new Map((allUsers || []).map(u => [u.email, u]));
    const usersById = new Map((allUsers || []).map(u => [u.idusers, u]));
    const studentsWithOverdue = new Set((overduePayments || []).map(p => p.idstudent_fk));

    if (students) {
      for (const s of students) {
        const u = s.email ? usersByEmail.get(s.email) : null;
        const tags: string[] = [];
        if (studentsWithOverdue.has(s.idstudent)) {
          tags.push('inadimplente');
        }

        usersList.push({
          id: s.idstudent,
          userId: u?.idusers || '',
          name: s.name || 'Sem nome',
          email: s.email || '',
          type: 'Aluno',
          status: s.status === 'ativo' ? 'Ativo' : (s.status === 'inativo' || s.status === 'bloqueado' ? 'Inativo' : s.status),
          detail: s.instrument || 'Não definido',
          avatarUrl: s.avatar_url || undefined,
          tags,
        });
      }
    }

    if (teachers) {
      for (const t of teachers) {
        const u = usersById.get(t.idusers_fk);
        // Trazemos todos, mas se o accountstatus for 'rejected', marcamos como Inativo
        if (u) {
          usersList.push({
            id: t.idteacher,
            userId: t.idusers_fk,
            name: u.fname || 'Professor',
            email: u.email || '',
            type: 'Professor',
            status: u.accountstatus === 'approved' ? 'Ativo' : 'Inativo',
            detail: '',
            avatarUrl: t.avatar_url || undefined,
            tags: [],
          });
        }
      }
    }

    // Sort by name
    return usersList.sort((a, b) => a.name.localeCompare(b.name));
  }



  static async updateUserAdmin(id: string, type: 'Aluno' | 'Professor', data: { name?: string, email?: string, detail?: string }): Promise<boolean> {
    const supabase = await createClient();
    if (type === 'Aluno') {
      const payload: any = {};
      if (data.name) payload.name = data.name;
      if (data.email) payload.email = data.email;
      if (data.detail) payload.instrument = data.detail;

      // Lido ANTES do update: o nome anterior é o que casa as aulas legadas, e
      // o idusers_fk (professor dono da ficha) escopa a sincronização.
      const { data: before } = await supabase
        .from('student')
        .select('name, instrument, idusers_fk')
        .eq('idstudent', id)
        .maybeSingle();

      const { error } = await supabase.from('student').update(payload).eq('idstudent', id);
      if (error) return false;

      // Sem isto, renomear pelo painel deixava o nome antigo em todas as aulas
      // da agenda do professor — este era o único dos três caminhos de edição
      // que não propagava nada.
      if ((data.name || data.detail) && before?.idusers_fk) {
        await syncStudentIntoLessons({
          studentId: id,
          teacherId: before.idusers_fk,
          previousName: before.name,
          name: data.name || before.name,
          instrument: data.detail || before.instrument,
        });
        safeUpdateTag('aluno-lessons');
      }

      if (data.email || data.name) {
        // Find user by email and update it if possible
        const { data: std } = await supabase.from('student').select('email').eq('idstudent', id).single();
        if (std && std.email) {
          const userPayload: any = {};
          if (data.name) userPayload.fname = data.name;
          if (data.email) userPayload.email = data.email;
          await supabase.from('users').update(userPayload).eq('email', std.email);
        }
      }
      return true;
    } else {
      // Professor
      const { data: t } = await supabase.from('teacher').select('idusers_fk').eq('idteacher', id).single();
      if (t && t.idusers_fk) {
        const payload: any = {};
        if (data.name) payload.fname = data.name;
        if (data.email) payload.email = data.email;
        const { error } = await supabase.from('users').update(payload).eq('idusers', t.idusers_fk);
        return !error;
      }
      return false;
    }
  }

  static async toggleUserStatusAdmin(id: string, type: 'Aluno' | 'Professor', newStatus: 'Ativo' | 'Bloqueado'): Promise<boolean> {
    const supabase = await createClient();
    if (type === 'Aluno') {
      const dbStatus = newStatus === 'Ativo' ? 'ativo' : 'inativo';
      const { error } = await supabase.from('student').update({ status: dbStatus }).eq('idstudent', id);
      return !error;
    } else {
      // Professor
      const { data: t } = await supabase.from('teacher').select('idusers_fk').eq('idteacher', id).single();
      if (t && t.idusers_fk) {
        const accStatus = newStatus === 'Ativo' ? 'approved' : 'rejected'; // Or blocked, depending on how users are blocked
        const { error } = await supabase.from('users').update({ accountstatus: accStatus }).eq('idusers', t.idusers_fk);
        return !error;
      }
      return false;
    }
  }
}
