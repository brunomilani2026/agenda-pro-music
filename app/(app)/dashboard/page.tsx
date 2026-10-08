"use client";

import { useState, useEffect, useMemo } from "react";
import { useAppContext } from "../AppContext";
import Link from "next/link";
import { formatName, getLocalISODate } from "@/lib/utils";

export default function DashboardPage() {
  const { lessons, payments, teacherProfile, pendingRequestsCount, refreshPayments } = useAppContext();

  // Timer isolado — só atualiza a string de tempo, não re-renderiza métricas de data
  const [currentTimeStr, setCurrentTimeStr] = useState(() => new Date().toTimeString().slice(0, 5));
  const today = useMemo(() => getLocalISODate(new Date()), []);
  const currentMonth = useMemo(() => today.slice(0, 7), [today]);

  useEffect(() => {
    const id = setInterval(() => setCurrentTimeStr(new Date().toTimeString().slice(0, 5)), 60000);
    return () => clearInterval(id);
  }, []);

  // Faturas que o cron gera/vence depois do carregamento (inadimplência) não
  // apareceriam até um F5 — o layout não re-executa em navegação client-side.
  // O maxAge evita refazer a busca logo após o seed do servidor.
  useEffect(() => {
    refreshPayments({ maxAgeMs: 30_000 });
  }, [refreshPayments]);

  // Todas as métricas memoizadas — só recalculam quando lessons/payments mudam
  // Inclui 'realizada': as aulas do dia viram realizadas sozinhas assim que o
  // horário termina, e contar só as agendadas fazia o número ENCOLHER ao longo
  // do dia — de manhã "3", à tarde "1", como se aulas tivessem sumido.
  const todayClasses = useMemo(
    () => lessons.filter(l => (l.status === "agendada" || l.status === "realizada") && l.date === today).length,
    [lessons, today]
  );

  const completedClasses = useMemo(
    () => lessons.filter(l => l.status === "realizada" && l.date.startsWith(currentMonth)).length,
    [lessons, currentMonth]
  );

  const canceledClasses = useMemo(
    () => lessons.filter(l => l.status === "cancelada" && l.date.startsWith(currentMonth)).length,
    [lessons, currentMonth]
  );

  const revenue = useMemo(
    () => payments.filter(p => p.status === "pago").reduce((acc, curr) => acc + curr.amount, 0),
    [payments]
  );

  const overduePayments = useMemo(
    () => payments.filter(p => p.status === "vencido" || (p.status === "pendente" && p.date < today)),
    [payments, today]
  );

  const overdueCount = overduePayments.length;
  const overdueAmount = useMemo(
    () => overduePayments.reduce((acc, curr) => acc + curr.amount, 0),
    [overduePayments]
  );

  const upcomingLessons = useMemo(
    () =>
      [...lessons]
        .filter(l => {
          if (l.status !== "agendada") return false;
          if (l.date > today) return true;
          if (l.date === today) return l.startTime >= currentTimeStr;
          return false;
        })
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.startTime.localeCompare(b.startTime);
        }),
    [lessons, today, currentTimeStr]
  );

  // Receita dos últimos 6 meses — depende de payments, não de um timer
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
      const total = payments
        .filter(p => p.status === "pago" && p.date.startsWith(key))
        .reduce((acc, p) => acc + p.amount, 0);
      return { label, total, key };
    });
  }, [payments]);

  const maxMonthRevenue = useMemo(
    () => Math.max(...monthlyRevenue.map(m => m.total), 1),
    [monthlyRevenue]
  );

  // Pagamentos pagos memoizados — reutilizados no modal sem re-filtrar
  const paidPayments = useMemo(
    () => payments.filter(p => p.status === "pago"),
    [payments]
  );

  const paidTotal = useMemo(
    () => paidPayments.reduce((a, p) => a + p.amount, 0),
    [paidPayments]
  );

  const pendingTotal = useMemo(
    () => payments.filter(p => p.status === "pendente").reduce((a, p) => a + p.amount, 0),
    [payments]
  );

  // ── KPIs financeiros (pago vs. não pago) ───────────────────────────────────
  // Recebido no mês atual (por vencimento da fatura)
  const currentMonthPaid = useMemo(
    () => payments.filter(p => p.status === "pago" && p.date.startsWith(currentMonth)).reduce((a, p) => a + p.amount, 0),
    [payments, currentMonth]
  );

  // Taxa de recebimento: pago / total faturado (pago + pendente + vencido)
  const collectionRate = useMemo(() => {
    const billed = payments
      .filter(p => p.status === "pago" || p.status === "pendente" || p.status === "vencido")
      .reduce((a, p) => a + p.amount, 0);
    return billed > 0 ? Math.round((paidTotal / billed) * 100) : 0;
  }, [payments, paidTotal]);

  // Ticket médio dos pagamentos confirmados
  const avgTicket = useMemo(
    () => (paidPayments.length > 0 ? paidTotal / paidPayments.length : 0),
    [paidPayments, paidTotal]
  );

  const sortedPaidPayments = useMemo(
    () => [...paidPayments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15),
    [paidPayments]
  );

  const [showDetails, setShowDetails] = useState(false);

  // Dados do professor vêm do AppContext — sem server action extra
  const teacherName = teacherProfile?.fname || teacherProfile?.name || "Professor(a)";

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-8 animate-fade-in">
      {/* HERO SECTION */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-amber-400 to-amber-300 p-8 sm:p-10 shadow-2xl shadow-amber-500/10 text-gray-900 border border-amber-300">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">Olá, {formatName(teacherName)}!</h1>
              <p className="mt-2 text-amber-900 font-medium max-w-xl text-lg leading-relaxed">
                O mês está produtivo! Você já garantiu <b className="font-extrabold text-gray-900">R$ {revenue},00</b> em faturamento e você tem {todayClasses} aulas marcadas para hoje.
              </p>
            </div>
          </div>
          <Link href="/alunos" className="shrink-0 bg-gray-900 hover:bg-black text-amber-500 font-bold py-4 px-8 rounded-2xl shadow-xl hover:shadow-[0_0_25px_rgba(0,0,0,0.4)] transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all flex items-center justify-center border border-gray-800 w-full md:w-auto text-center">
            Adicionar Novo Aluno
          </Link>
        </div>

        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-60"></div>
        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-amber-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      </div>

      {/* Métricas de Relatório */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
        <MetricCard
          title="Faturamento (Mês)"
          value={`R$ ${revenue},00`}
          subtitle="Geração de receita atual"
        />
        <MetricCard
          title="Aulas Hoje"
          value={todayClasses.toString()}
          subtitle="Na sua agenda de hoje"
        />
        <MetricCard
          title="Aulas Realizadas"
          value={completedClasses.toString()}
          subtitle="Neste mês"
        />
        <MetricCard
          title="Taxa de Canc."
          value={canceledClasses.toString()}
          subtitle="Aulas desmarcadas"
        />
        <Link href="/solicitacoes" className="block transition-transform hover:scale-[1.02] active:scale-95">
          <MetricCard
            title="Solicitações"
            value={pendingRequestsCount.toString()}
            subtitle="Pendentes de aprovação"
            accent={pendingRequestsCount > 0 ? "amber" : undefined}
          />
        </Link>
        <MetricCard
          title="Inadimplência"
          value={overdueCount.toString()}
          subtitle={`R$ ${overdueAmount},00 em atraso`}
          accent={overdueCount > 0 ? "red" : undefined}
        />
      </div>

      {/* KPIs Financeiros — pago vs. não pago */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <MetricCard
          title="Recebido (Mês)"
          value={`R$ ${Math.round(currentMonthPaid).toLocaleString("pt-BR")}`}
          subtitle="Pagamentos confirmados no mês"
          accent="emerald"
        />
        <MetricCard
          title="A Receber"
          value={`R$ ${Math.round(pendingTotal).toLocaleString("pt-BR")}`}
          subtitle="Faturas pendentes (ainda não pagas)"
          accent={pendingTotal > 0 ? "amber" : undefined}
        />
        <MetricCard
          title="Taxa de Recebimento"
          value={`${collectionRate}%`}
          subtitle="Pago vs. total faturado"
          accent={collectionRate >= 70 ? "emerald" : collectionRate >= 40 ? "amber" : "red"}
        />
        <MetricCard
          title="Ticket Médio"
          value={`R$ ${Math.round(avgTicket).toLocaleString("pt-BR")}`}
          subtitle="Média por pagamento recebido"
          accent="emerald"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        {/* Card: Próximas Aulas */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-700 bg-gray-800/80 flex justify-between items-center">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Próximas Aulas
            </h2>
            <Link href="/agenda" className="text-sm font-medium text-amber-500 hover:text-amber-400 transition-colors">
              Ver Agenda &rarr;
            </Link>
          </div>
          <div className="p-5 flex-1 flex flex-col gap-4">
            {upcomingLessons.length > 0 ? (
              upcomingLessons.slice(0, 3).map((lesson, i) => (
                <Link
                  key={i}
                  href="/alunos"
                  title={`Ver ficha de ${lesson.studentName}`}
                  className="flex items-center justify-between bg-gray-900/50 p-4 rounded-xl border border-gray-700/50 hover:border-amber-500/40 hover:bg-gray-900/70 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex flex-col items-center justify-center border border-amber-500/20">
                      <span className="text-[10px] uppercase font-bold leading-none">{lesson.date.split("-")[2]}</span>
                      <span className="text-[10px] uppercase font-medium leading-none">
                        {new Date(lesson.date + "T12:00:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold text-white truncate hover:text-amber-500 transition-colors">{lesson.studentName}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                        <span className="text-amber-500">{lesson.startTime}</span> &bull; <span className="capitalize">{lesson.instrument}</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1.5 bg-gray-800 group-hover:bg-amber-500/10 rounded-lg text-gray-300 border border-gray-600">
                    Ver
                  </span>
                </Link>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-60">
                <p className="text-gray-400 text-sm">Nenhuma próxima aula agendada.</p>
              </div>
            )}
          </div>
        </div>

        {/* Card: Resumo de Receitas */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-700 bg-gray-800/80 flex justify-between items-center">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Resumo de Receitas
            </h2>
            <button
              onClick={() => setShowDetails(true)}
              className="text-sm font-medium text-amber-500 hover:text-amber-400 transition-colors"
            >
              Detalhes &rarr;
            </button>
          </div>
          <div className="p-5 flex-1 flex flex-col justify-end">
            {monthlyRevenue.every(m => m.total === 0) ? (
              <div className="flex-1 flex items-center justify-center opacity-50">
                <p className="text-gray-500 text-sm">Nenhum recebimento registrado.</p>
              </div>
            ) : (
              <div className="flex w-full mt-2 gap-3 px-1">
                <div className="flex items-center justify-center shrink-0" style={{ width: 16 }}>
                  <span
                    className="text-[9px] text-gray-500 font-bold uppercase tracking-widest whitespace-nowrap"
                    style={{ transform: "rotate(-90deg)", display: "block" }}
                  >
                    Receita (R$)
                  </span>
                </div>

                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-end gap-2 h-[160px]">
                    {monthlyRevenue.map((m, i) => {
                      const pct = m.total > 0 ? Math.max((m.total / maxMonthRevenue) * 100, 5) : 0;
                      const isCurrent = m.key === currentMonth;
                      return (
                        <div key={i} className="flex-1 h-full flex flex-col justify-end group cursor-default">
                          <div className="relative w-full" style={{ height: `${pct}%` }}>
                            {m.total > 0 && (
                              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 px-2 py-1 rounded text-xs text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity font-bold shadow-lg border border-gray-700 whitespace-nowrap pointer-events-none z-10">
                                R$ {m.total.toFixed(2)}
                              </div>
                            )}
                            <div
                              className={`w-full h-full rounded-t transition-all ${
                                isCurrent
                                  ? "bg-emerald-500/60 hover:bg-emerald-500/80"
                                  : "bg-emerald-500/25 hover:bg-emerald-500/45"
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-2">
                    {monthlyRevenue.map((m, i) => (
                      <div key={i} className="flex-1 flex justify-center">
                        <span className={`text-[10px] uppercase font-bold ${m.key === currentMonth ? "text-emerald-400" : "text-gray-500"}`}>
                          {m.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-700/40 pt-1">
                    <p className="text-center text-[9px] text-gray-500 font-bold uppercase tracking-widest">Mês</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Detalhes de Receitas */}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 animate-fade-in">
          <div className="bg-gray-800/95 ring-1 ring-white/10 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-gray-700/50 flex flex-col max-h-[90vh]">
            <div className="px-7 py-5 border-b border-gray-700/50 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-black text-white">Detalhes de Receitas</h2>
                <p className="text-xs text-gray-400 mt-0.5">Últimos lançamentos recebidos</p>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-white transition-colors bg-gray-700/50 hover:bg-gray-700 p-2 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-7 pt-5 pb-3 grid grid-cols-3 gap-3 shrink-0">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest mb-1">Recebido</p>
                <p className="text-white font-black text-lg">R$ {paidTotal.toFixed(2)}</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-1">A Receber</p>
                <p className="text-white font-black text-lg">R$ {pendingTotal.toFixed(2)}</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                <p className="text-red-400 text-[10px] font-bold uppercase tracking-widest mb-1">Atrasado</p>
                <p className="text-white font-black text-lg">R$ {overdueAmount.toFixed(2)}</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-7 pb-7">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 mt-4">Últimos recebimentos</p>
              {paidPayments.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-8">Nenhum pagamento recebido ainda.</p>
              ) : (
                <div className="space-y-2">
                  {sortedPaidPayments.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-gray-900/50 border border-gray-700/40 rounded-xl px-4 py-3 hover:border-emerald-500/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-500/10 rounded-lg flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white leading-none">{p.studentName}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{p.date.split("-").reverse().join("/")} &bull; {p.method}</p>
                        </div>
                      </div>
                      <p className="text-emerald-400 font-black text-sm whitespace-nowrap">R$ {Number(p.amount).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, subtitle, accent }: {
  title: string;
  value: string;
  subtitle: string;
  accent?: 'red' | 'amber' | 'emerald';
}) {
  const accentColor = accent === 'red' ? 'text-red-500' : accent === 'emerald' ? 'text-emerald-500' : 'text-amber-500';
  return (
    <div className="bg-gray-800/40 rounded-3xl border border-gray-700/50 p-6 shadow-sm hover:bg-gray-800/80 transition-all duration-300">
      <div className="flex flex-col justify-between items-start h-full">
        <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-widest">{title}</p>
        <h3 className={`text-3xl sm:text-4xl font-black mb-1 ${accentColor}`}>{value}</h3>
        <p className="text-xs text-gray-500 font-medium mt-auto pt-2">{subtitle}</p>
      </div>
    </div>
  );
}
