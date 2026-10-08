"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Calendar, CreditCard, BookOpen, Award, Clock, AlertTriangle, ExternalLink, CheckCircle, RefreshCw } from "lucide-react";
import { fetchAlunoDashboard } from "../../actions";
import TeacherMarketplace from "./marketplace";
import { formatName, getLocalISODate } from "@/lib/utils";

export default function AlunoDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    fetchAlunoDashboard().then(d => { setData(d); setLoading(false); });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-pulse text-amber-500 font-bold">Carregando seu painel...</div>
    </div>
  );

  if (!data) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-red-500 font-bold">Erro ao carregar dados. Faça login novamente.</p>
    </div>
  );

  if (!data.student.idusers_fk) {
    return <TeacherMarketplace studentId={data.student.idstudent} />;
  }

  const packageLabels: Record<string, string> = {
    avulsa: 'Aula Avulsa',
    mensal: 'Mensal',
    trimestral: 'Trimestral',
    semestral: 'Semestral',
  };

  const today = getLocalISODate(now);
  const currentTime = now.toTimeString().slice(0, 5);
  const upcomingLessons = (data.upcomingLessons as any[]).filter(l => {
    if (l.date > today) return true;
    if (l.date === today) return l.startTime >= currentTime;
    return false;
  });

  const pkg = (data.student.packagetype || '').toLowerCase();
  // Sempre exibe o total histórico de aulas realizadas (não apenas no mês)
  const usedLessons = Number(data.realLessonCount ?? data.student.usedlessons ?? 0);
  const lessonsValue = pkg === '' ? 'Sem pacote' : `${usedLessons}`;
  const lessonsSubtitle = pkg === '' ? 'Compre créditos para agendar' : 'Aulas realizadas';

  // Avança a data de vencimento conforme o pacote: enquanto a data salva estiver
  // no passado e o aluno estiver em dia (sem pendência), pula para o próximo
  // período. Isso evita que mensalistas vejam "Vencido" mesmo pagando.
  const advanceByPackage = (iso: string, pkg: string): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const next = new Date(y, m - 1, d);
    const monthsToAdd = pkg === 'mensal' ? 1 : pkg === 'trimestral' ? 3 : pkg === 'semestral' ? 6 : 0;
    if (monthsToAdd === 0) return iso;
    next.setMonth(next.getMonth() + monthsToAdd);
    return getLocalISODate(next);
  };

  const expirationRaw = data.student.expirationdate || '';
  let expirationDisplay = 'Sem vencimento';
  let expirationExpired = false;
  let effectiveExpiration = expirationRaw;
  if (expirationRaw) {
    const todayStr = getLocalISODate();
    const recurring = pkg === 'mensal' || pkg === 'trimestral' || pkg === 'semestral';
    // Pacote recorrente + sem inadimplência => avança a janela do plano.
    if (recurring && !data.hasDebt) {
      let cursor = expirationRaw;
      // Limita a 60 iterações para nunca travar — equivale a 5 anos no mensal.
      for (let i = 0; i < 60 && cursor < todayStr; i++) {
        const next = advanceByPackage(cursor, pkg);
        if (next === cursor) break;
        cursor = next;
      }
      effectiveExpiration = cursor;
    }
    if (effectiveExpiration < todayStr) {
      expirationExpired = true;
      expirationDisplay = `Vencido em ${effectiveExpiration.split('-').reverse().join('/')}`;
    } else {
      expirationDisplay = `Vence em ${effectiveExpiration.split('-').reverse().join('/')}`;
    }
  }

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-8 animate-fade-in">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-amber-400 to-amber-300 p-8 sm:p-10 shadow-2xl shadow-amber-500/10 text-gray-900 border border-amber-300">
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
          <a
            href="/aluno/perfil"
            title="Editar perfil"
            className="w-24 h-24 md:w-32 md:h-32 rounded-3xl overflow-hidden bg-gray-900 border-4 border-gray-900/10 shadow-2xl shrink-0 flex items-center justify-center hover:scale-[1.03] active:scale-95 transition-transform cursor-pointer"
          >
            {data.student.avatar_url ? (
              <Image
                src={data.student.avatar_url}
                alt="Profile"
                width={128}
                height={128}
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <span className="text-amber-500 font-black text-4xl">
                {(data.student.name?.trim()?.[0] || 'A').toUpperCase()}
              </span>
            )}
          </a>
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Olá, {formatName(data.student.name)}! 🎶</h1>
            <p className="mt-2 text-amber-900 font-medium text-lg">
              Bem-vindo ao seu painel de aulas. Aqui você acompanha tudo sobre suas aulas de <b>{data.student.instrument}</b>.
            </p>
          </div>
        </div>
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-60" />
      </div>

      {/* Alerta de inadimplência */}
      {data.hasDebt && (
        <div className="flex items-center gap-3 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-red-400 font-black text-sm uppercase tracking-widest">Atenção!</p>
            <p className="text-red-400/80 text-xs mt-1">Você possui pagamentos em atraso. Regularize para solicitar novas aulas ou remarcações.</p>
          </div>
        </div>
      )}

      {/* Reposição liberada pelo professor — é a primeira tela que o aluno vê,
          e o crédito tem prazo. */}
      {data.awaitingRescheduleCount > 0 && (
        <Link href="/aluno/aulas"
          className="flex items-center gap-3 p-5 bg-purple-500/10 border border-purple-500/20 rounded-2xl hover:bg-purple-500/20 transition-colors">
          <RefreshCw className="w-6 h-6 text-purple-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-purple-400 font-black text-sm uppercase tracking-widest">
              {data.awaitingRescheduleCount > 1
                ? `${data.awaitingRescheduleCount} aulas de reposição`
                : 'Você tem direito a uma reposição'}
            </p>
            <p className="text-purple-400/80 text-xs mt-1">
              Seu professor liberou {data.awaitingRescheduleCount > 1 ? 'aulas' : 'uma aula'} para você remarcar. Escolha o novo horário — sem cobrança adicional.
            </p>
          </div>
          <ExternalLink className="w-4 h-4 text-purple-400 flex-shrink-0" />
        </Link>
      )}

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {data.plan?.kind === 'creditos' ? (
          <MetricCard icon={<BookOpen className="w-5 h-5" />} title="Plano Atual" value={data.plan.name}
            subtitle={data.plan.validUntil ? `Créditos válidos até ${data.plan.validUntil.split('-').reverse().join('/')}` : 'Créditos ativos'}
            cta={{ label: 'Comprar mais créditos', href: '/aluno/compra-creditos' }} />
        ) : data.plan?.kind === 'aguardando' ? (
          <MetricCard icon={<BookOpen className="w-5 h-5" />} title="Plano Atual" value={data.plan.name}
            subtitle="Aguardando pagamento" cta={{ label: 'Pagar agora', href: '/aluno/financeiro' }} />
        ) : data.plan?.kind === 'nenhum' ? (
          <MetricCard icon={<BookOpen className="w-5 h-5" />} title="Plano Atual" value="Nenhum plano"
            subtitle="Escolha um pacote para suas aulas" cta={{ label: 'Escolher meu plano', href: '/aluno/compra-creditos' }} />
        ) : (
          <MetricCard icon={<BookOpen className="w-5 h-5" />} title="Plano Atual" value={packageLabels[data.student.packagetype] || data.student.packagetype} subtitle={expirationDisplay} accent={expirationExpired ? 'red' : undefined} />
        )}
        <MetricCard icon={<Calendar className="w-5 h-5" />} title="Aulas" value={lessonsValue} subtitle={lessonsSubtitle} />
        <MetricCard icon={<Award className="w-5 h-5" />} title="Créditos" value={data.credits.toString()} subtitle="Reposições disponíveis" />
        <MetricCard icon={<CreditCard className="w-5 h-5" />} title="Financeiro" value={data.pendingPayment ? `R$ ${data.pendingPayment.amount}` : 'Em dia!'} subtitle={data.pendingPayment ? `Vence ${data.pendingPayment.duedate.split('-').reverse().join('/')}` : 'Nenhuma pendência'} accent={data.pendingPayment?.status === 'vencido' ? 'red' : undefined} />
      </div>

      {/* Próximas aulas + Pagamento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        {/* Próximas aulas */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-700 bg-gray-800/80">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" /> Próximas Aulas
            </h2>
          </div>
          <div className="p-5 flex-1 flex flex-col gap-3">
            {upcomingLessons.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Nenhuma aula agendada no momento.</p>
            ) : (
              upcomingLessons.slice(0, 3).map((lesson: any) => (
                <div key={lesson.id} className="flex items-center justify-between bg-gray-900/50 p-4 rounded-xl border border-gray-700/50 hover:border-amber-500/40 hover:bg-gray-900/70 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex flex-col items-center justify-center border border-amber-500/20">
                      <span className="text-[10px] uppercase font-bold leading-none">{lesson.date.split('-')[2]}</span>
                      <span className="text-[10px] uppercase font-medium leading-none">
                        {new Date(lesson.date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm capitalize">{lesson.instrument}</p>
                      <p className="text-xs text-gray-400">
                        <span className="text-amber-500">{lesson.startTime}</span> — {lesson.endTime}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${lesson.status === 'agendada' ? 'text-amber-500 bg-amber-500/10 border border-amber-500/20' : 'text-green-400 bg-green-500/10 border border-green-500/20'}`}>
                    {lesson.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Card de pagamento pendente — Fix 12: nunca fica vazio */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-700 bg-gray-800/80">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-500" /> Situação Financeira
            </h2>
          </div>
          <div className="p-5 flex-1 flex flex-col items-center justify-center gap-6 text-center">
            {data.pendingPayment ? (
              <>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-2">Próximo vencimento</p>
                  <p className="text-4xl font-black text-white">R$ {Number(data.pendingPayment.amount).toFixed(2).replace('.', ',')}</p>
                  <p className={`text-sm font-bold mt-2 ${data.pendingPayment.status === 'vencido' ? 'text-red-400' : 'text-amber-500'}`}>
                    {data.pendingPayment.status === 'vencido'
                      ? `⚠ Vencido em ${data.pendingPayment.duedate.split('-').reverse().join('/')}`
                      : `Vence em ${data.pendingPayment.duedate.split('-').reverse().join('/')}`}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-2 w-full">
                  {data.pendingPayment.invoiceUrl ? (
                    <a href={data.pendingPayment.invoiceUrl} target="_blank" rel="noopener noreferrer"
                      className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-black py-3 px-8 rounded-xl shadow-xl transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2">
                      <CreditCard className="w-5 h-5" /> Pagar Agora
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : (
                    <a href="/aluno/financeiro"
                      className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-black py-3 px-8 rounded-xl shadow-xl transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2">
                      <CreditCard className="w-5 h-5" /> Ver Fatura
                    </a>
                  )}
                  <a href="/aluno/financeiro" className="text-xs font-bold text-amber-500 hover:text-amber-400 underline underline-offset-2">
                    Histórico completo
                  </a>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/20">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  </div>
                  <p className="text-xl font-black text-green-400">Tudo em dia!</p>
                  <p className="text-sm text-gray-400 mt-2">Nenhuma pendência financeira no momento.</p>
                </div>
                <a href="/aluno/financeiro" className="text-xs font-bold text-amber-500 hover:text-amber-400 underline underline-offset-2">
                  Ver histórico financeiro
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, title, value, subtitle, accent, cta }: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  accent?: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="bg-gray-800/40 rounded-3xl border border-gray-700/50 p-6 shadow-sm hover:bg-gray-800/80 transition-all duration-300">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-amber-500">{icon}</div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</p>
      </div>
      <h3 className={`text-2xl sm:text-3xl font-black mb-1 ${accent === 'red' ? 'text-red-500' : 'text-amber-500'}`}>{value}</h3>
      <p className="text-xs text-gray-500 font-medium">{subtitle}</p>
      {cta && (
        <a href={cta.href}
          className="inline-block mt-3 bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black py-2 px-4 rounded-xl transition-all active:scale-95">
          {cta.label}
        </a>
      )}
    </div>
  );
}
