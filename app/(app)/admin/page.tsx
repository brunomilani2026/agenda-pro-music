'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from "next/image";
import {
  fetchInstruments,
  addInstrument,
  removeInstrument,
  fetchAdminCore,
  fetchAdminUsers,
  fetchFeedbacks,
  approveUser,
  rejectUser,
  updateUserAdmin,
  toggleUserStatusAdmin
} from './actions';
import { adminBroadcastNotification } from '@/app/actions/notification.actions';
import { emailFailureText } from '@/lib/email-failure';
import NotificationComposer from '@/components/NotificationComposer';
import {
  Music,
  Plus,
  Trash2,
  ShieldCheck,
  Loader2,
  Users,
  UsersRound,
  DollarSign,
  CalendarCheck,
  UserPlus,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
  History,
  Activity,
  ArrowUpRight,
  Inbox,
  TrendingUp,
  CreditCard,
  Clock,
  Settings2,
  Receipt,
  Percent,
  RefreshCcw,
  Repeat,
  Calendar,
  PieChart,
  Award,
  Bell,
  KeyRound,
  ShieldAlert,
  Link2,
  Wallet,
  TimerReset,
  UserX,
  CalendarX,
  User as UserIcon,
  Star,
  MessageCircleHeart,
} from 'lucide-react';
import type { User } from '@/types/database.types';
import type { AdminKPIs, ActiveUserItem } from '@/services/admin-dashboard.service';
import type { AdminFeedbackItem } from './actions';

type AdminSection = 'overview' | 'students' | 'teachers' | 'settings' | 'logs' | 'users' | 'feedbacks';

const SECTION_META: Record<AdminSection, { title: string; description: string }> = {
  overview: { title: 'Dashboard', description: 'Visão executiva consolidada da plataforma' },
  students: { title: 'Alunos', description: 'KPIs centrados em base, retenção e valor do aluno' },
  teachers: { title: 'Professores', description: 'Equipe, operação de aulas e controle de acesso' },
  settings: { title: 'Configurações', description: 'Catálogo, saúde e parâmetros globais' },
  logs: { title: 'Logs de Uso', description: 'Eventos, segurança e auditoria do sistema' },
  users: { title: 'Usuários', description: 'Diretório completo de usuários da plataforma' },
  feedbacks: { title: 'Feedbacks', description: 'Avaliações e relatos enviados pelos usuários da plataforma' },
};

function parseSection(value: string | null): AdminSection {
  if (value === 'students' || value === 'teachers' || value === 'settings' || value === 'logs' || value === 'users' || value === 'feedbacks') return value;
  return 'overview';
}

const DEFAULT_KPIS: AdminKPIs = {
  totalStudents: 0,
  totalTeachers: 0,
  monthlyRevenue: 0,
  lessonsThisMonth: 0,
  activeStudents: 0,
  pendingPaymentsCount: 0,
  overdueAmount: 0,
  completedLessonsMonth: 0,
  recentActivity: [],
  instrumentDistribution: [],
  finance: {
    totalRevenue: 0, monthlyRevenue: 0, delinquencyRate: 0, totalInvoices: 0, overdueInvoices: 0,
    averageTicketPerStudent: 0, revenueByMethod: [], renegotiatedVolume: 0, arpu: 0,
    agingProjection: [], revenueByInstrument: [],
  },
  operations: {
    lessonsCompleted: 0, lessonsScheduled: 0, lessonsCanceled: 0, cancellationRate: 0,
    reschedulingRequestsCount: 0, teacherOccupancy: [], instrumentDemand: [],
    avgApprovalTimeHours: null, pendingRequestsCount: 0,
  },
  retention: {
    creditUtilizationRate: 0, totalCreditsBought: 0, totalCreditsUsed: 0, churnCount: 0,
    expiredCreditsCount: 0, avgCreditUsageDays: null, ltvTop: [],
  },
  engagement: {
    signupConversionRate: 0, totalApprovedUsers: 0, totalPendingUsers: 0, packagePopularity: [],
    notificationReadRate: 0, notificationsTotal: 0, inactiveStudentsCount: 0, baseGrowth: [],
  },
  system: {
    passwordResetCount: 0, studentsWithoutCpf: 0, asaasIntegrationRate: 0,
    totalStudents: 0, studentsWithAsaas: 0,
  },
};

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number) => `${v.toFixed(1).replace('.0', '')}%`;

// Troca de seção 100% no cliente: atualiza a URL via History API. O Next
// sincroniza isso com useSearchParams SEM round-trip RSC nem re-execução dos
// layouts (que fariam getUser + query de sessão a cada clique). Os dados do
// painel já estão em memória, então a troca de aba fica instantânea.
function navigateAdmin(href: string) {
  window.history.pushState(null, '', href);
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminPageInner />
    </Suspense>
  );
}

function AdminLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />
      <p className="text-gray-400 font-medium animate-pulse">Carregando painel administrativo...</p>
    </div>
  );
}

function AdminPageInner() {
  const searchParams = useSearchParams();
  const activeSection = parseSection(searchParams.get('section'));

  const [instruments, setInstruments] = useState<{ id: string; name: string }[]>([]);
  const [kpis, setKpis] = useState<AdminKPIs>(DEFAULT_KPIS);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUserItem[]>([]);
  const [feedbacks, setFeedbacks] = useState<AdminFeedbackItem[]>([]);
  const [feedbacksLoading, setFeedbacksLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [newInstrument, setNewInstrument] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyToast, setNotifyToast] = useState<string | null>(null);

  const handleAdminBroadcast = async (title: string, message: string, sendEmail: boolean) => {
    const res = await adminBroadcastNotification({ title, message, sendEmail });
    if (res.success) {
      const failed = sendEmail ? (res.emailTotal ?? 0) - (res.emailed ?? 0) : 0;
      setNotifyToast(
        failed > 0
          ? `Comunicado salvo no app de ${res.count} aluno(s), mas o e-mail falhou para ${failed} dele(s): ${emailFailureText(res.emailFail)}`
          : `Comunicado enviado para ${res.count} aluno(s).`
      );
      setTimeout(() => setNotifyToast(null), 5000);
      return { ok: true };
    }
    return { ok: false, msg: res.error };
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    // Núcleo (KPIs + catálogo): libera a tela assim que chega.
    const core = await fetchAdminCore();
    setInstruments(core.instruments || []);
    setKpis(core.kpis);
    setLoading(false);

    // Diretório/pendências em background — abas Usuários/Professores.
    setUsersLoading(true);
    setFeedbacksLoading(true);
    const [users, fb] = await Promise.all([fetchAdminUsers(), fetchFeedbacks()]);
    setPendingUsers(users.pendingUsers || []);
    setActiveUsers(users.activeUsers || []);
    setUsersLoading(false);
    setFeedbacks(fb || []);
    setFeedbacksLoading(false);
  }

  async function handleAddInstrument() {
    if (!newInstrument.trim()) return;
    setIsAdding(true);
    const res = await addInstrument(newInstrument);
    if (res.success) {
      setNewInstrument('');
      const data = await fetchInstruments();
      setInstruments(data || []);
    } else {
      alert(res.error);
    }
    setIsAdding(false);
  }

  async function handleDeleteInstrument(id: string) {
    if (!confirm('Tem certeza que deseja remover este instrumento do catálogo?')) return;
    const res = await removeInstrument(id);
    if (res.success) {
      const data = await fetchInstruments();
      setInstruments(data || []);
    } else {
      alert(res.error);
    }
  }

  async function handleApprove(userId: string) {
    setActionLoading(userId);
    const res = await approveUser(userId);
    if (res.success) loadDashboardData();
    else alert(res.error);
    setActionLoading(null);
  }

  async function handleReject(userId: string) {
    if (!confirm('Tem certeza que deseja rejeitar este usuário? O registro será removido.')) return;
    setActionLoading(userId);
    const res = await rejectUser(userId);
    if (res.success) loadDashboardData();
    else alert(res.error);
    setActionLoading(null);
  }

  if (loading) {
    return <AdminLoading />;
  }

  const meta = SECTION_META[activeSection];

  return (
    <div className="p-3 md:p-5 space-y-6 animate-fade-in max-w-7xl mx-auto pb-16">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-4 border-b border-gray-800">
        <div>
          <p className="text-amber-500/80 font-bold text-[10px] uppercase tracking-[0.3em] mb-1.5 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3" />
            Painel de Controle
          </p>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-none">{meta.title}</h1>
          <p className="text-gray-400 mt-1.5 text-xs font-medium">{meta.description}</p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <button
            onClick={() => setNotifyOpen(true)}
            className="group flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-full transition-all"
            title="Enviar um comunicado para todos os alunos da plataforma"
          >
            <Bell className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
            <span className="text-white text-[10px] font-bold uppercase tracking-wider">Comunicado</span>
          </button>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider">Online</span>
          </div>
        </div>
      </header>

      {activeSection === 'overview' && <OverviewTab kpis={kpis} />}
      {activeSection === 'students' && <StudentsTab kpis={kpis} />}
      {activeSection === 'teachers' && (
        <TeachersTab
          kpis={kpis}
          pendingUsers={pendingUsers}
          actionLoading={actionLoading}
          loading={usersLoading}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
      {activeSection === 'settings' && (
        <SettingsTab
          instruments={instruments}
          newInstrument={newInstrument}
          isAdding={isAdding}
          setNewInstrument={setNewInstrument}
          onAdd={handleAddInstrument}
          onDelete={handleDeleteInstrument}
        />
      )}
      {activeSection === 'logs' && <LogsTab kpis={kpis} />}
      {activeSection === 'users' && <UsersTab activeUsers={activeUsers} loading={usersLoading} />}
      {activeSection === 'feedbacks' && <FeedbacksTab feedbacks={feedbacks} loading={feedbacksLoading} />}

      {/* COMUNICADO A TODOS OS ALUNOS */}
      <NotificationComposer
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        heading="Comunicado a todos os alunos"
        subheading={`${kpis.activeStudents} aluno(s) ativo(s) na plataforma receberão`}
        onSend={handleAdminBroadcast}
      />

      {notifyToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[70] animate-fade-in-up">
          <div className="flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border bg-green-500/10 border-green-500/20 text-green-400 backdrop-blur-xl">
            <CheckCircle className="w-6 h-6" />
            <p className="font-bold text-sm">{notifyToast}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* ABA: DASHBOARD                                               */
/* ============================================================ */
function OverviewTab({ kpis }: { kpis: AdminKPIs }) {
  const { finance, engagement, operations } = kpis;
  return (
    <div className="space-y-6">
      {/* Hero KPIs */}
      <section className="space-y-3">
        <SectionHeader icon={<TrendingUp />} title="Visão Geral" accent="border-amber-500" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="Alunos" value={kpis.totalStudents} subtitle={`${kpis.activeStudents} ativos`} icon={<Users />} color="blue" href="/admin?section=users&filter=Alunos Ativos" />
          <KPICard title="Professores" value={kpis.totalTeachers} subtitle="Equipe ativa" icon={<UsersRound />} color="indigo" href="/admin?section=users&filter=Professores" />
          <KPICard title="Faturamento (Mês)" value={brl(finance.monthlyRevenue)} subtitle="Receita do mês" icon={<DollarSign />} color="emerald" href="/admin?section=users&filter=Alunos Ativos" />
          <KPICard title="Aulas (Mês)" value={kpis.lessonsThisMonth} subtitle={`${kpis.completedLessonsMonth} realizadas`} icon={<CalendarCheck />} color="amber" />
        </div>
      </section>

      {/* Financeiro */}
      <section className="space-y-3">
        <SectionHeader icon={<Wallet />} title="Financeiro" accent="border-emerald-500" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="Faturamento Bruto" value={brl(finance.totalRevenue)} subtitle="Todos os pagamentos pagos" icon={<DollarSign />} color="emerald" />
          <KPICard title="Inadimplência" value={pct(finance.delinquencyRate)} subtitle={`${finance.overdueInvoices}/${finance.totalInvoices} faturas`} icon={<Percent />} color="red" href="/admin?section=users&filter=Inadimplentes" />
          <KPICard title="Ticket Médio" value={brl(finance.averageTicketPerStudent)} subtitle="Por aluno pagante" icon={<Receipt />} color="cyan" />
          <KPICard title="ARPU" value={brl(finance.arpu)} subtitle="Receita / usuário" icon={<TrendingUp />} color="purple" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Panel title="Receita por Método" icon={<CreditCard className="text-emerald-400" />}>
            {finance.revenueByMethod.length > 0 ? finance.revenueByMethod.map((m, i) => (
              <StatBar key={m.label} label={m.label} rightLabel={brl(m.value)} percentage={m.percentage || 0}
                color={['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500'][i % 5]} />
            )) : <EmptyState>Nenhum pagamento registrado.</EmptyState>}
          </Panel>

          <Panel title="Projeção de Receita (Aging)" icon={<Calendar className="text-amber-400" />}>
            <div className="grid grid-cols-2 gap-2">
              {finance.agingProjection.map(a => (
                <div key={a.bucket} className="px-3 py-2 bg-gray-900/40 rounded-lg border border-gray-800">
                  <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">{a.bucket}</p>
                  <p className="text-sm font-bold text-white mt-0.5 break-words">{brl(a.amount)}</p>
                  <p className="text-[10px] text-gray-500">{a.count} fatura{a.count === 1 ? '' : 's'}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      {/* Operacional + Crescimento */}
      <section className="space-y-3">
        <SectionHeader icon={<TrendingUp />} title="Operacional e Crescimento" accent="border-purple-500" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="Solicitações Pendentes" value={operations.pendingRequestsCount} subtitle="Aguardando resposta" icon={<Inbox />} color="rose" />
          <KPICard title="Pagamentos Pendentes" value={kpis.pendingPaymentsCount} subtitle={`${brl(kpis.overdueAmount)} em atraso`} icon={<Clock />} color="amber" />
          <KPICard title="Conversão Cadastro" value={pct(engagement.signupConversionRate)} subtitle={`${engagement.totalApprovedUsers} aprovados`} icon={<UserPlus />} color="emerald" />
          <KPICard title="Leitura de Avisos" value={pct(engagement.notificationReadRate)} subtitle={`${engagement.notificationsTotal} enviados`} icon={<Bell />} color="cyan" />
        </div>

        <Panel title="Crescimento da Base (6 meses)" icon={<BarChart3 className="text-blue-400" />}>
          <BaseGrowthChart data={engagement.baseGrowth} />
        </Panel>
      </section>
    </div>
  );
}

/* ============================================================ */
/* ABA: ALUNOS                                                  */
/* ============================================================ */
function StudentsTab({ kpis }: { kpis: AdminKPIs }) {
  const { retention, system, engagement, finance } = kpis;
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader icon={<Users className="w-5 h-5 text-blue-400" />} title="Resumo de Alunos" accent="border-blue-500" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="Total de Alunos" value={kpis.totalStudents} subtitle="Cadastrados" icon={<Users className="w-6 h-6" />} color="blue" href="/admin?section=users&filter=Todos" />
          <KPICard title="Alunos Ativos" value={kpis.activeStudents} subtitle="Status = ativo" icon={<CheckCircle className="w-6 h-6" />} color="emerald" href="/admin?section=users&filter=Alunos Ativos" />
          <KPICard title="Churn (Evasão)" value={retention.churnCount} subtitle="Inativos/Expirados" icon={<UserX className="w-6 h-6" />} color="red" href="/admin?section=users&filter=Alunos Inativos" />
          <KPICard title="Alunos Parados" value={engagement.inactiveStudentsCount} subtitle="Sem aulas há 15+ dias" icon={<AlertCircle className="w-6 h-6" />} color="rose" />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader icon={<Wallet className="w-5 h-5 text-emerald-400" />} title="Valor do Aluno" accent="border-emerald-500" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <KPICard title="Ticket Médio" value={brl(finance.averageTicketPerStudent)} subtitle="Por aluno pagante" icon={<Receipt className="w-6 h-6" />} color="cyan" />
          <KPICard title="ARPU" value={brl(finance.arpu)} subtitle="Receita / total de alunos" icon={<TrendingUp className="w-6 h-6" />} color="purple" />
          <KPICard title="Faturamento Bruto" value={brl(finance.totalRevenue)} subtitle="LTV agregado" icon={<DollarSign className="w-6 h-6" />} color="emerald" />
        </div>

        <Panel title="Top 5 LTV (Alunos)" icon={<Award className="w-5 h-5 text-amber-400" />}>
          {retention.ltvTop.length > 0 ? retention.ltvTop.map((s, i) => {
            const max = retention.ltvTop[0]?.ltv || 1;
            return (
              <StatBar key={s.student + i} label={s.student} rightLabel={brl(s.ltv)}
                percentage={Math.round((s.ltv / max) * 100)}
                color={['bg-amber-500', 'bg-emerald-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500'][i % 5]} />
            );
          }) : <EmptyState>Nenhum pagamento registrado.</EmptyState>}
        </Panel>
      </section>

      <section className="space-y-3">
        <SectionHeader icon={<CreditCard className="w-5 h-5 text-amber-400" />} title="Créditos e Pacotes" accent="border-amber-500" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="Uso de Créditos" value={pct(retention.creditUtilizationRate)}
            subtitle={`${retention.totalCreditsUsed}/${retention.totalCreditsBought}`}
            icon={<Activity className="w-6 h-6" />} color="emerald" />
          <KPICard title="Créditos Expirados" value={retention.expiredCreditsCount} subtitle="Perderam validade"
            icon={<CalendarX className="w-6 h-6" />} color="rose" />
          <KPICard title="Tempo Médio de Uso"
            value={retention.avgCreditUsageDays !== null ? `${retention.avgCreditUsageDays.toFixed(1)}d` : '—'}
            subtitle="Geração → uso" icon={<TimerReset className="w-6 h-6" />} color="cyan" />
          <KPICard title="Conversão de Cadastro" value={pct(engagement.signupConversionRate)}
            subtitle={`${engagement.totalApprovedUsers} aprovados`} icon={<UserPlus className="w-6 h-6" />} color="purple" />
        </div>

        <Panel title="Popularidade de Pacotes" icon={<CreditCard className="w-5 h-5 text-amber-400" />}>
          {engagement.packagePopularity.length > 0 ? engagement.packagePopularity.map((p, i) => {
            const max = engagement.packagePopularity[0]?.sales || 1;
            return (
              <StatBar key={p.name + i} label={p.name}
                rightLabel={`${p.sales} venda${p.sales === 1 ? '' : 's'} • ${brl(p.revenue)}`}
                percentage={Math.round((p.sales / max) * 100)}
                color={['bg-amber-500', 'bg-emerald-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500'][i % 5]} />
            );
          }) : <EmptyState>Nenhum pacote vendido ainda.</EmptyState>}
        </Panel>
      </section>

      <section className="space-y-3">
        <SectionHeader icon={<PieChart className="w-5 h-5 text-indigo-400" />} title="Distribuição e Integridade" accent="border-indigo-500" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <KPICard title="Alunos sem CPF" value={system.studentsWithoutCpf} subtitle="Cadastros incompletos"
            icon={<AlertCircle className="w-6 h-6" />} color="red" />
          <KPICard title="Integração Asaas" value={pct(system.asaasIntegrationRate)}
            subtitle={`${system.studentsWithAsaas}/${system.totalStudents} vinculados`}
            icon={<Link2 className="w-6 h-6" />} color="emerald" />
          <KPICard title="Faturamento por Instrumento" value={brl(finance.revenueByInstrument[0]?.value || 0)}
            subtitle={finance.revenueByInstrument[0]?.label || 'Sem dados'}
            icon={<Music className="w-6 h-6" />} color="indigo" />
        </div>

        <Panel title="Mix de Alunos por Instrumento" icon={<BarChart3 className="w-5 h-5 text-indigo-400" />}>
          {kpis.instrumentDistribution.length > 0 ? kpis.instrumentDistribution.map((item, i) => (
            <StatBar key={item.label} label={item.label} rightLabel={`${item.percentage}%`}
              percentage={item.percentage}
              color={['bg-blue-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'][i % 5]} />
          )) : <EmptyState>Nenhum dado estatístico.</EmptyState>}
        </Panel>
      </section>
    </div>
  );
}

/* ============================================================ */
/* ABA: PROFESSORES                                             */
/* ============================================================ */
function TeachersTab({
  kpis, pendingUsers, actionLoading, loading, onApprove, onReject,
}: {
  kpis: AdminKPIs;
  pendingUsers: User[];
  actionLoading: string | null;
  loading?: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const { operations } = kpis;
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader icon={<UsersRound className="w-5 h-5 text-indigo-400" />} title="Resumo da Equipe" accent="border-indigo-500" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="Professores" value={kpis.totalTeachers} subtitle="Total ativo" icon={<UsersRound className="w-6 h-6" />} color="indigo" />
          <KPICard title="Aprovações Pendentes" value={pendingUsers.length} subtitle="Aguardando análise" icon={<Clock className="w-6 h-6" />} color="amber" />
          <KPICard title="Solicitações Pendentes" value={operations.pendingRequestsCount} subtitle="Pedidos de aluno" icon={<Inbox className="w-6 h-6" />} color="rose" />
          <KPICard title="Tempo Médio Aprovação"
            value={operations.avgApprovalTimeHours !== null ? `${operations.avgApprovalTimeHours.toFixed(1)}h` : '—'}
            subtitle="Criação → aprovada" icon={<TimerReset className="w-6 h-6" />} color="cyan" />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader icon={<CalendarCheck className="w-5 h-5 text-emerald-400" />} title="Aulas e Operação" accent="border-emerald-500" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="Aulas Realizadas" value={operations.lessonsCompleted} subtitle="Total histórico" icon={<CheckCircle className="w-6 h-6" />} color="emerald" />
          <KPICard title="Aulas Agendadas" value={operations.lessonsScheduled} subtitle="Próximos encontros" icon={<Calendar className="w-6 h-6" />} color="blue" />
          <KPICard title="Taxa de Cancelamento" value={pct(operations.cancellationRate)} subtitle={`${operations.lessonsCanceled} canceladas`} icon={<CalendarX className="w-6 h-6" />} color="red" />
          <KPICard title="Remarcações" value={operations.reschedulingRequestsCount} subtitle="Pedidos de troca" icon={<Repeat className="w-6 h-6" />} color="amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Ocupação de Professores" icon={<Award className="w-5 h-5 text-amber-400" />}>
            {operations.teacherOccupancy.length > 0 ? operations.teacherOccupancy.map((t, i) => {
              const max = operations.teacherOccupancy[0]?.value || 1;
              return (
                <StatBar key={t.label} label={t.label} rightLabel={`${t.value} aulas`}
                  percentage={Math.round((t.value / max) * 100)}
                  color={['bg-amber-500', 'bg-emerald-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500'][i % 5]} />
              );
            }) : <EmptyState>Nenhuma aula registrada.</EmptyState>}
          </Panel>

          <Panel title="Demanda por Instrumento" icon={<PieChart className="w-5 h-5 text-blue-400" />}>
            {operations.instrumentDemand.length > 0 ? operations.instrumentDemand.map((t, i) => {
              const max = operations.instrumentDemand[0]?.value || 1;
              return (
                <StatBar key={t.label} label={t.label} rightLabel={`${t.value} aulas`}
                  percentage={Math.round((t.value / max) * 100)}
                  color={['bg-blue-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'][i % 5]} />
              );
            }) : <EmptyState>Sem dados de aulas.</EmptyState>}
          </Panel>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader icon={<UserPlus className="w-5 h-5 text-blue-500" />} title="Controle de Acesso" accent="border-blue-500" />

        <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-4 md:p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Solicitações de Cadastro</h3>
              <p className="text-gray-400 text-xs mt-0.5">Aprovação manual de novos professores</p>
            </div>
            <span className="bg-amber-500 text-gray-900 font-bold px-2.5 py-0.5 rounded-full text-[10px]">
              {pendingUsers.length} Pendentes
            </span>
          </div>

          <div className="space-y-2">
            {pendingUsers.length > 0 ? pendingUsers.map(user => (
              <div key={user.idusers} className="flex flex-col md:flex-row md:items-center justify-between p-3 bg-gray-900/40 rounded-xl border border-gray-800 hover:border-amber-500/30 transition-all gap-3 group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center text-amber-500 font-bold text-sm border border-gray-700">
                    {user.fname?.[0] || '?'}
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-sm">{user.fname}</h4>
                    <p className="text-gray-400 text-xs">{user.email}</p>
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full font-bold uppercase mt-0.5 inline-block">
                      {user.usertype}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => onApprove(user.idusers)} disabled={!!actionLoading}
                    className="flex-1 md:flex-none bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white border border-emerald-500/20 px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5">
                    {actionLoading === user.idusers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Aprovar
                  </button>
                  <button onClick={() => onReject(user.idusers)} disabled={!!actionLoading}
                    className="flex-1 md:flex-none bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5">
                    {actionLoading === user.idusers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Rejeitar
                  </button>
                </div>
              </div>
            )) : loading ? (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-900/20 rounded-xl border border-dashed border-gray-800">
                <Loader2 className="w-6 h-6 text-amber-500 animate-spin mb-2" />
                <p className="text-gray-500 text-xs font-medium">Carregando solicitações...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-900/20 rounded-xl border border-dashed border-gray-800">
                <AlertCircle className="w-8 h-8 text-gray-700 mb-2" />
                <p className="text-gray-500 text-xs font-medium">Nenhuma aprovação pendente no momento.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ============================================================ */
/* ABA: CONFIGURAÇÕES                                           */
/* ============================================================ */
function SettingsTab({
  instruments, newInstrument, isAdding, setNewInstrument, onAdd, onDelete,
}: {
  instruments: { id: string; name: string }[];
  newInstrument: string;
  isAdding: boolean;
  setNewInstrument: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader icon={<Settings2 className="w-5 h-5 text-purple-500" />} title="Configurações Globais" accent="border-purple-500" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-4 shadow-lg">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
              <Music className="w-4 h-4 text-amber-400" />
              Catálogo de Instrumentos
            </h3>

            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newInstrument}
                  onChange={e => setNewInstrument(e.target.value)}
                  placeholder="Adicionar instrumento..."
                  className="flex-1 bg-gray-950 border border-gray-800 focus:border-amber-500/50 rounded-lg px-3 py-1.5 text-white outline-none transition-all text-xs"
                />
                <button
                  onClick={onAdd}
                  disabled={isAdding || !newInstrument.trim()}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-900 font-bold p-1.5 rounded-lg transition-all"
                >
                  {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>

              <div className="max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                <div className="grid grid-cols-1 gap-1.5">
                  {instruments.map(inst => (
                    <div key={inst.id} className="flex items-center justify-between px-3 py-1.5 bg-gray-900/50 rounded-lg border border-gray-800 group hover:border-amber-500/30 transition-all">
                      <span className="text-gray-300 font-medium text-xs">{inst.name}</span>
                      <button onClick={() => onDelete(inst.id)}
                        className="text-gray-600 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-4 shadow-lg">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-emerald-400" />
              Saúde do Sistema
            </h3>

            <div className="grid grid-cols-1 gap-2">
              <div className="p-2 bg-gray-900/40 rounded-lg border border-gray-800 text-center">
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Versão</p>
                <p className="text-xs font-bold text-gray-300 mt-0.5">Pro Music v1.0</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ============================================================ */
/* ABA: LOGS                                                    */
/* ============================================================ */
function LogsTab({ kpis }: { kpis: AdminKPIs }) {
  const { system, engagement } = kpis;
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader icon={<ShieldAlert className="w-5 h-5 text-red-400" />} title="Segurança e Sistema" accent="border-red-500" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <KPICard title="Recuperações de Senha" value={system.passwordResetCount} subtitle="Tokens emitidos"
            icon={<KeyRound className="w-6 h-6" />} color="amber" />
          <KPICard title="Avisos Enviados" value={engagement.notificationsTotal}
            subtitle={`${pct(engagement.notificationReadRate)} lidos`}
            icon={<Bell className="w-6 h-6" />} color="emerald" />
          <KPICard title="Integração Asaas" value={pct(system.asaasIntegrationRate)}
            subtitle={`${system.studentsWithAsaas}/${system.totalStudents} vinculados`}
            icon={<Link2 className="w-6 h-6" />} color="cyan" />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader icon={<History className="w-5 h-5 text-indigo-500" />} title="Eventos do Sistema" accent="border-indigo-500" />

        <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-4 md:p-5 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-white">Logs de Atividade</h3>
              <p className="text-gray-400 text-xs mt-0.5">Monitoramento em tempo real de ações críticas</p>
            </div>
          </div>

          <div className="space-y-3">
            {kpis.recentActivity.length > 0 ? kpis.recentActivity.map(log => (
              <ActivityItem
                key={log.id}
                icon={
                  log.type === 'payment' ? <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> :
                  log.type === 'request' ? <Inbox className="w-3.5 h-3.5 text-amber-400" /> :
                  log.type === 'student' ? <Users className="w-3.5 h-3.5 text-blue-400" /> :
                  <Activity className="w-3.5 h-3.5 text-gray-400" />
                }
                title={log.title}
                description={log.description}
                time={log.time}
              />
            )) : (
              <p className="text-gray-500 text-xs italic text-center py-6">Nenhum evento registrado.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ============================================================ */
/* ABA: FEEDBACKS                                               */
/* ============================================================ */
function FeedbacksTab({ feedbacks, loading }: { feedbacks: AdminFeedbackItem[]; loading?: boolean }) {
  const total = feedbacks.length;
  const avg = total > 0 ? feedbacks.reduce((s, f) => s + f.rating, 0) / total : 0;
  const withComment = feedbacks.filter(f => (f.message || '').trim().length > 0).length;
  const lowRatings = feedbacks.filter(f => f.rating <= 2).length;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader icon={<MessageCircleHeart className="w-5 h-5 text-amber-400" />} title="Resumo" accent="border-amber-500" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="Feedbacks" value={total} subtitle="Total recebido" icon={<MessageCircleHeart />} color="amber" />
          <KPICard title="Nota Média" value={total > 0 ? avg.toFixed(1) : '—'} subtitle="De 1 a 5 estrelas" icon={<Star />} color="emerald" />
          <KPICard title="Com Comentário" value={withComment} subtitle="Relatos escritos" icon={<Inbox />} color="blue" />
          <KPICard title="Notas Baixas" value={lowRatings} subtitle="1 ou 2 estrelas" icon={<AlertCircle />} color="red" />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader icon={<History className="w-5 h-5 text-indigo-400" />} title="Feedbacks Recebidos" accent="border-indigo-500" />
        <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-4 md:p-5 shadow-lg">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin mb-2" />
              <p className="text-gray-500 text-xs font-medium">Carregando feedbacks...</p>
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <MessageCircleHeart className="w-8 h-8 text-gray-700 mb-2" />
              <p className="text-gray-500 text-xs font-medium">Nenhum feedback recebido ainda.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedbacks.map(fb => (
                <div key={fb.id} className="p-4 bg-gray-900/40 rounded-xl border border-gray-800 hover:border-amber-500/30 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center text-amber-500 font-bold text-sm border border-gray-700 shrink-0">
                        {fb.authorName?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-white font-bold text-sm truncate">{fb.authorName}</h4>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0 ${fb.authorType === 'aluno' ? 'bg-emerald-500/20 text-emerald-400' : fb.authorType === 'professor' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-500/20 text-gray-400'}`}>
                            {fb.authorType || 'usuário'}
                          </span>
                        </div>
                        <p className="text-gray-500 text-xs truncate">{fb.authorEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-0.5" title={`${fb.rating} de 5 estrelas`}>
                        {[1, 2, 3, 4, 5].map(i => (
                          <Star key={i} className={`w-3.5 h-3.5 ${i <= fb.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-700'}`} />
                        ))}
                      </div>
                      <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">
                        {new Date(fb.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                  </div>
                  {(fb.message || '').trim() && (
                    <p className="text-gray-300 text-sm mt-3 leading-relaxed whitespace-pre-wrap break-words border-l-2 border-gray-700 pl-3">
                      {fb.message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ============================================================ */
/* COMPONENTES AUXILIARES                                       */
/* ============================================================ */
const SECTION_TONE: Record<string, { bg: string; text: string }> = {
  'border-amber-500':   { bg: 'bg-amber-500',   text: 'text-amber-400' },
  'border-emerald-500': { bg: 'bg-emerald-500', text: 'text-emerald-400' },
  'border-blue-500':    { bg: 'bg-blue-500',    text: 'text-blue-400' },
  'border-indigo-500':  { bg: 'bg-indigo-500',  text: 'text-indigo-400' },
  'border-rose-500':    { bg: 'bg-rose-500',    text: 'text-rose-400' },
  'border-red-500':     { bg: 'bg-red-500',     text: 'text-red-400' },
  'border-purple-500':  { bg: 'bg-purple-500',  text: 'text-purple-400' },
  'border-cyan-500':    { bg: 'bg-cyan-500',    text: 'text-cyan-400' },
};

function SectionHeader({ icon, title, accent }: { icon: React.ReactNode; title: string; accent: string }) {
  const tone = SECTION_TONE[accent] || SECTION_TONE['border-amber-500'];
  return (
    <div className="flex items-center gap-3">
      <span className={`inline-block w-1 h-4 rounded-full ${tone.bg}`} />
      <h2 className={`text-[11px] font-black uppercase tracking-[0.25em] flex items-center gap-2 ${tone.text} [&_svg]:w-4 [&_svg]:h-4`}>
        {icon}
        {title}
      </h2>
      <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-700/60 to-transparent" />
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-4 shadow-lg">
      <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3 [&_svg]:w-4 [&_svg]:h-4">
        {icon}
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-500 text-xs italic text-center py-4">{children}</p>;
}

function ActivityItem({ icon, title, description, time }: { icon: React.ReactNode; title: string; description: string; time: string }) {
  return (
    <div className="flex gap-3 group">
      <div className="mt-0.5 w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center shrink-0 border border-gray-800 group-hover:border-gray-700 transition-all">
        {icon}
      </div>
      <div className="flex-1 border-b border-gray-800 pb-2 group-last:border-0 group-last:pb-0">
        <div className="flex justify-between items-start gap-2">
          <h4 className="text-white font-bold text-xs">{title}</h4>
          <span className="text-[9px] text-gray-500 font-medium shrink-0">{time}</span>
        </div>
        <p className="text-gray-400 text-[11px] mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function StatBar({ label, percentage, color, rightLabel }: { label: string; percentage: number; color: string; rightLabel?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-bold gap-2">
        <span className="text-gray-300 truncate">{label}</span>
        <span className="text-gray-400 shrink-0">{rightLabel ?? `${percentage}%`}</span>
      </div>
      <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-1000`}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} />
      </div>
    </div>
  );
}

function BaseGrowthChart({ data }: { data: { month: string; newPayments: number; newRequests: number }[] }) {
  if (data.length === 0) return <EmptyState>Sem dados de crescimento.</EmptyState>;
  const max = Math.max(1, ...data.map(b => b.newPayments));
  return (
    <>
      <div className="flex items-end justify-between gap-2 h-28">
        {data.map((m, i) => {
          const h = Math.round((m.newPayments / max) * 100);
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
              <div className="relative w-full flex items-end justify-center" style={{ height: '100%' }}>
                <div
                  className="w-full bg-blue-500/60 hover:bg-blue-500 rounded-t-md transition-all min-h-[6px]"
                  style={{ height: `${h}%` }}
                  title={`${m.newPayments} pagantes / ${m.newRequests} solicitações`}
                />
              </div>
              <span className="text-[10px] font-bold uppercase text-gray-500">{m.month}</span>
              <span className="text-[10px] text-gray-400">{m.newPayments}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-500 italic mt-3 text-center">
        Alunos com pagamento no mês (proxy de crescimento da base)
      </p>
    </>
  );
}

function KPICard({ title, value, subtitle, icon, color, href }: { title: string; value: string | number; subtitle: string; icon: React.ReactNode; color: string; href?: string }) {
  const accents: Record<string, { bar: string; iconBg: string; iconColor: string }> = {
    blue:    { bar: 'bg-blue-500',    iconBg: 'bg-blue-500/10',    iconColor: 'text-blue-400' },
    indigo:  { bar: 'bg-indigo-500',  iconBg: 'bg-indigo-500/10',  iconColor: 'text-indigo-400' },
    emerald: { bar: 'bg-emerald-500', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
    amber:   { bar: 'bg-amber-500',   iconBg: 'bg-amber-500/10',   iconColor: 'text-amber-400' },
    rose:    { bar: 'bg-rose-500',    iconBg: 'bg-rose-500/10',    iconColor: 'text-rose-400' },
    red:     { bar: 'bg-red-500',     iconBg: 'bg-red-500/10',     iconColor: 'text-red-400' },
    cyan:    { bar: 'bg-cyan-500',    iconBg: 'bg-cyan-500/10',    iconColor: 'text-cyan-400' },
    purple:  { bar: 'bg-purple-500',  iconBg: 'bg-purple-500/10',  iconColor: 'text-purple-400' },
  };
  const c = accents[color] || accents.blue;

  const content = (
    <div className={`relative bg-gray-800/40 border border-gray-700/60 rounded-xl p-3 shadow-sm transition-all flex items-start gap-3 overflow-hidden ${href ? 'hover:bg-gray-800/70 hover:border-amber-500 cursor-pointer active:scale-[0.98]' : 'hover:bg-gray-800/70 hover:border-gray-600'}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${c.bar}`} />
      <div className={`p-1.5 rounded-lg shrink-0 [&_svg]:w-4 [&_svg]:h-4 ${c.iconBg} ${c.iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest truncate">{title}</p>
        <h3 className="text-lg font-bold text-white mt-0.5 break-words leading-tight">{value}</h3>
        <p className="text-gray-500 text-[10px] font-medium mt-0.5 truncate">{subtitle}</p>
      </div>
    </div>
  );

  // Botão que troca a seção no cliente (History API), sem navegação RSC.
  return href ? (
    <button type="button" onClick={() => navigateAdmin(href)} className="block w-full text-left">
      {content}
    </button>
  ) : content;
}

/* ============================================================ */
/* ABA: USUÁRIOS ATIVOS (DIRETÓRIO)                             */
/* ============================================================ */
function UsersTab({ activeUsers, loading }: { activeUsers: ActiveUserItem[]; loading?: boolean }) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>(searchParams?.get('filter') || 'Todos');
  const [selectedUser, setSelectedUser] = useState<ActiveUserItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', detail: '' });
  const [actionLoading, setActionLoading] = useState(false);

  const handleEditOpen = () => {
    if (selectedUser) {
      setEditForm({
        name: selectedUser.name,
        email: selectedUser.email,
        detail: selectedUser.detail
      });
      setIsEditing(true);
    }
  };

  const handleEditSave = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    const res = await updateUserAdmin(selectedUser.id, selectedUser.type, editForm);
    if (res.success) {
      // Update local state smoothly
      setSelectedUser({ ...selectedUser, ...editForm });
      // We should ideally reload active users but this avoids a full page flash
      alert('Dados atualizados com sucesso!');
      setIsEditing(false);
    } else {
      alert(res.error);
    }
    setActionLoading(false);
  };

  const handleToggleStatus = async () => {
    if (!selectedUser) return;
    const isCurrentlyActive = selectedUser.status.toLowerCase() === 'ativo';
    const newStatus = isCurrentlyActive ? 'Bloqueado' : 'Ativo';
    
    if (!confirm(`Tem certeza que deseja ${isCurrentlyActive ? 'bloquear' : 'ativar'} o acesso deste usuário?`)) return;
    
    setActionLoading(true);
    const res = await toggleUserStatusAdmin(selectedUser.id, selectedUser.type, newStatus);
    if (res.success) {
      setSelectedUser({ ...selectedUser, status: newStatus });
      alert(`Usuário ${newStatus.toLowerCase()} com sucesso!`);
    } else {
      alert(res.error);
    }
    setActionLoading(false);
  };

  const filteredUsers = activeUsers.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    
    let matchType = true;
    if (filterType === 'Alunos Ativos') matchType = u.type === 'Aluno' && u.status === 'Ativo';
    else if (filterType === 'Alunos Inativos') matchType = u.type === 'Aluno' && (u.status === 'Inativo' || u.status === 'Bloqueado');
    else if (filterType === 'Inadimplentes') matchType = u.type === 'Aluno' && !!u.tags?.includes('inadimplente');
    else if (filterType === 'Professores') matchType = u.type === 'Professor';
    else if (filterType === 'students') matchType = u.type === 'Aluno';
    else if (filterType === 'teachers') matchType = u.type === 'Professor';

    return matchSearch && matchType;
  });

  return (
    <div className="space-y-6">
      {/* Header com Filtros */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 bg-gray-900 p-4 rounded-2xl border border-gray-800 shadow-xl">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
          />
        </div>
        <div className="flex bg-gray-950 p-1 rounded-xl border border-gray-800 overflow-x-auto hide-scrollbar">
          {['Todos', 'Alunos Ativos', 'Alunos Inativos', 'Inadimplentes', 'Professores'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${filterType === type ? 'bg-gray-800 text-amber-500 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {type === 'Inadimplentes' && <div className="w-1.5 h-1.5 rounded-full bg-red-500" />}
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-950/50 border-b border-gray-800">
              <tr>
                <th className="px-6 py-4 font-bold text-gray-400 uppercase tracking-wider text-[10px]">Usuário</th>
                <th className="px-6 py-4 font-bold text-gray-400 uppercase tracking-wider text-[10px]">E-mail</th>
                <th className="px-6 py-4 font-bold text-gray-400 uppercase tracking-wider text-[10px]">Perfil</th>
                <th className="px-6 py-4 font-bold text-gray-400 uppercase tracking-wider text-[10px]">Detalhe / Instrumento</th>
                <th className="px-6 py-4 font-bold text-gray-400 uppercase tracking-wider text-[10px] text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredUsers.length > 0 ? filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                        {user.avatarUrl ? (
                          <Image src={user.avatarUrl} alt={user.name} width={32} height={32} className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon className="w-4 h-4 text-gray-500" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-gray-200 group-hover:text-amber-500 transition-colors">{user.name}</p>
                        <p className="text-[10px] text-gray-500">ID: {user.id.split('-')[0]}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-400">{user.email || '—'}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${user.type === 'Professor' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                        {user.type}
                      </span>
                      {user.tags?.includes('inadimplente') && (
                        <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                          Inadimplente
                        </span>
                      )}
                      {(user.status === 'Inativo' || user.status === 'Bloqueado') && (
                        <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-500/10 text-gray-400 border border-gray-500/20">
                          {user.status}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-400 capitalize">{user.detail}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setSelectedUser(user)}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-amber-500 text-gray-300 hover:text-gray-950 font-bold text-xs rounded-lg transition-colors border border-gray-700 hover:border-amber-500 flex items-center gap-1.5 ml-auto"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" /> Detalhes
                    </button>
                  </td>
                </tr>
              )) : loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                      Carregando usuários...
                    </span>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Nenhum usuário encontrado para esse filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalhes do Usuário */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-gray-950/50">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-500" />
                Ficha do Usuário
              </h3>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white p-1">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gray-800 border-2 border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                  {selectedUser.avatarUrl ? (
                    <Image src={selectedUser.avatarUrl} alt={selectedUser.name} width={64} height={64} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-8 h-8 text-gray-500" />
                  )}
                </div>
                <div>
                  <h4 className="text-xl font-bold text-gray-200">{selectedUser.name}</h4>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mt-1 inline-block ${selectedUser.type === 'Professor' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {selectedUser.type}
                  </span>
                </div>
              </div>

              <div className="space-y-3 bg-gray-950 p-4 rounded-xl border border-gray-800">
                <div className="flex justify-between border-b border-gray-800 pb-2 items-center">
                  <span className="text-xs text-gray-500 w-24">E-mail</span>
                  {isEditing ? (
                    <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="flex-1 bg-gray-900 border border-gray-700 text-sm text-gray-300 rounded px-2 py-1 outline-none" />
                  ) : (
                    <span className="text-sm font-medium text-gray-300">{selectedUser.email || 'Não informado'}</span>
                  )}
                </div>
                {isEditing && (
                  <div className="flex justify-between border-b border-gray-800 pb-2 items-center">
                    <span className="text-xs text-gray-500 w-24">Nome</span>
                    <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="flex-1 bg-gray-900 border border-gray-700 text-sm text-gray-300 rounded px-2 py-1 outline-none" />
                  </div>
                )}
                {selectedUser.type === 'Aluno' && (
                  <div className="flex justify-between border-b border-gray-800 pb-2 items-center">
                    <span className="text-xs text-gray-500 w-24">Detalhe</span>
                    {isEditing ? (
                      <input type="text" value={editForm.detail} onChange={e => setEditForm({ ...editForm, detail: e.target.value })} className="flex-1 bg-gray-900 border border-gray-700 text-sm text-gray-300 rounded px-2 py-1 outline-none" placeholder="Instrumento" />
                    ) : (
                      <span className="text-sm font-medium text-gray-300 capitalize">{selectedUser.detail}</span>
                    )}
                  </div>
                )}
                <div className="flex justify-between border-b border-gray-800 pb-2 items-center">
                  <span className="text-xs text-gray-500 w-24">Conta</span>
                  <span className={`text-sm font-medium flex items-center gap-1 ${
                    selectedUser.status.toLowerCase() === 'pendente' ? 'text-amber-400' :
                    selectedUser.status.toLowerCase() === 'bloqueado' || selectedUser.status.toLowerCase() === 'inativo' ? 'text-rose-500' : 'text-emerald-400'
                  }`}>
                    {selectedUser.status.toLowerCase() === 'pendente' ? <Clock className="w-3.5 h-3.5" /> :
                     selectedUser.status.toLowerCase() === 'bloqueado' || selectedUser.status.toLowerCase() === 'inativo' ? <XCircle className="w-3.5 h-3.5" /> :
                     <CheckCircle className="w-3.5 h-3.5" />} {selectedUser.status}
                  </span>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="pt-2 flex flex-col gap-3">
                {isEditing ? (
                  <div className="flex gap-2">
                    <button onClick={() => setIsEditing(false)} disabled={actionLoading} className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 font-bold text-sm transition-all disabled:opacity-50">
                      Cancelar
                    </button>
                    <button onClick={handleEditSave} disabled={actionLoading} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold text-sm transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">
                      {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      Salvar
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={handleEditOpen} className="w-full py-2.5 rounded-xl border border-amber-500/50 text-amber-500 hover:bg-amber-500/10 font-bold text-sm transition-all flex items-center justify-center gap-2">
                      <Settings2 className="w-4 h-4" /> Editar Dados
                    </button>
                    <button onClick={handleToggleStatus} disabled={actionLoading} className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${selectedUser.status.toLowerCase() === 'ativo' ? 'border border-rose-500/50 text-rose-500 hover:bg-rose-500/10' : 'border border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10'}`}>
                      {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {selectedUser.status.toLowerCase() === 'ativo' ? <><UserX className="w-4 h-4" /> Bloquear Acesso</> : <><CheckCircle className="w-4 h-4" /> Ativar Acesso</>}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
