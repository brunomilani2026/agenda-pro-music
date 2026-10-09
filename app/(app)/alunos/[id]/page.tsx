"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarClock, Edit3, Info, Package, RefreshCw, Repeat, Wallet } from "lucide-react";
import { fetchFichaAluno } from "./actions";
import type { FichaAluno, FichaAula, FichaFatura, FichaReposicao } from "@/lib/ficha-aluno";

type Aba = "geral" | "aulas" | "financeiro" | "reposicoes";

const ABAS: { id: Aba; label: string }[] = [
  { id: "geral", label: "Visão geral" },
  { id: "aulas", label: "Aulas" },
  { id: "financeiro", label: "Financeiro" },
  { id: "reposicoes", label: "Reposições" },
];

const fmtData = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const fmtMoeda = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return DIAS[new Date(y, m - 1, d).getDay()] ?? "";
};

const STATUS_AULA: Record<string, { label: string; cls: string; dot: string }> = {
  agendada: { label: "Agendada", cls: "bg-sky-500/10 text-sky-400 border-sky-500/20", dot: "bg-sky-400" },
  aguardando_pagamento: { label: "Aguardando pagamento", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
  realizada: { label: "Realizada", cls: "bg-green-500/10 text-green-400 border-green-500/20", dot: "bg-green-400" },
  cancelada: { label: "Cancelada", cls: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400" },
  remarcada: { label: "Remarcada", cls: "bg-violet-500/10 text-violet-400 border-violet-500/20", dot: "bg-violet-400" },
};
const statusAula = (s: string) => STATUS_AULA[s] ?? { label: s || "—", cls: "bg-gray-700/40 text-gray-300 border-gray-600/40", dot: "bg-gray-400" };

const STATUS_FATURA: Record<string, { label: string; cls: string }> = {
  pago: { label: "Paga", cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  pendente: { label: "Pendente", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  vencido: { label: "Vencida", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  renegociado: { label: "Renegociada", cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  cancelado: { label: "Cancelada", cls: "bg-gray-700/40 text-gray-400 border-gray-600/40" },
};

function Selo({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${cls}`}>{children}</span>;
}

function Cartao({ titulo, valor, detalhe, destaque }: { titulo: string; valor: React.ReactNode; detalhe?: string; destaque?: "aviso" | "perigo" }) {
  const base = destaque === "perigo" ? "bg-red-500/10 border-red-500/20" : destaque === "aviso" ? "bg-amber-500/10 border-amber-500/20" : "bg-gray-800/40 border-gray-800";
  const cor = destaque === "perigo" ? "text-red-400" : destaque === "aviso" ? "text-amber-400" : "text-white";
  return (
    <div className={`rounded-2xl border ring-1 ring-white/5 p-4 ${base}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-black tracking-tight ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-gray-500 font-medium">{detalhe}</p>}
    </div>
  );
}

function Painel({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function LinhaAula({ a }: { a: FichaAula }) {
  const st = statusAula(a.status);
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${st.dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">
          {fmtData(a.date)} <span className="text-gray-500 font-medium">{diaSemana(a.date)}</span>
          {a.startTime && <span className="text-gray-400 font-medium"> · {a.startTime}{a.endTime ? `–${a.endTime}` : ""}</span>}
        </p>
        {(a.motivo || a.nota) && <p className="text-xs text-gray-500 mt-0.5 break-words">{a.motivo ?? a.nota}</p>}
      </div>
      <Selo cls={st.cls}>{st.label}</Selo>
    </li>
  );
}

function LinhaFatura({ f }: { f: FichaFatura }) {
  const chave = f.atrasada && f.status === "pendente" ? "vencido" : f.status;
  const st = STATUS_FATURA[chave] ?? STATUS_FATURA.pendente;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">{fmtMoeda(f.amount)} <span className="text-gray-500 font-medium">· vence {fmtData(f.duedate)}</span></p>
        <p className="text-xs text-gray-500 mt-0.5">
          {f.status === "pago" ? `Paga em ${fmtData(f.paymentdate)}${f.method ? ` · ${f.method}` : ""}` : f.alunoAvisouEm ? `Aluno avisou que pagou em ${fmtData(f.alunoAvisouEm)}` : f.notes || "Em aberto"}
        </p>
      </div>
      <Selo cls={st.cls}>{st.label}</Selo>
    </li>
  );
}

function LinhaReposicao({ r }: { r: FichaReposicao }) {
  const st = r.situacao === "disponivel" ? { label: "Disponível", cls: "bg-green-500/10 text-green-400 border-green-500/20" }
    : r.situacao === "usada" ? { label: "Usada", cls: "bg-gray-700/40 text-gray-300 border-gray-600/40" }
    : { label: "Expirada", cls: "bg-red-500/10 text-red-400 border-red-500/20" };
  return (
    <li className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">
          {r.tipo === "reposicao" ? "Reposição" : "Crédito de pacote"}
          {r.origemData && <span className="text-gray-500 font-medium"> · aula cancelada de {fmtData(r.origemData)}</span>}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Gerado em {fmtData(r.geradoEm)} · válido até {fmtData(r.validade)}{r.usadoEm ? ` · usado em ${fmtData(r.usadoEm)}` : ""}
        </p>
      </div>
      <Selo cls={st.cls}>{st.label}</Selo>
    </li>
  );
}

export default function FichaAlunoPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [ficha, setFicha] = useState<FichaAluno | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>("geral");
  const [filtroStatus, setFiltroStatus] = useState("todas");
  const [filtroPeriodo, setFiltroPeriodo] = useState("todas");

  const carregar = useCallback(async () => {
    if (!id) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetchFichaAluno(id);
      if (r.ok) setFicha(r.ficha);
      else setErro(r.error);
    } catch {
      setErro("Não foi possível carregar a ficha. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  const aulasFiltradas = useMemo(() => {
    if (!ficha) return [];
    const hoje = new Date();
    const limite = (dias: number) => { const d = new Date(hoje); d.setDate(d.getDate() - dias); return d.toISOString().slice(0, 10); };
    return ficha.aulas.filter(a => {
      if (filtroStatus !== "todas" && a.status !== filtroStatus) return false;
      if (filtroPeriodo === "30" && a.date < limite(30)) return false;
      if (filtroPeriodo === "90" && a.date < limite(90)) return false;
      return true;
    });
  }, [ficha, filtroStatus, filtroPeriodo]);

  if (carregando && !ficha) {
    return (
      <div className="w-full h-full bg-gray-900 p-4 md:p-8 rounded-tl-[2rem] animate-pulse space-y-4" aria-busy="true">
        <div className="h-10 w-64 rounded-2xl bg-gray-800" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-800/60" />)}</div>
        <div className="h-64 rounded-3xl bg-gray-800/60" />
      </div>
    );
  }

  if (erro || !ficha) {
    return (
      <div className="w-full h-full bg-gray-900 p-4 md:p-8 rounded-tl-[2rem] flex flex-col items-center justify-center gap-4 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
        <p className="text-white font-bold">{erro ?? "Não foi possível carregar a ficha."}</p>
        <div className="flex gap-3">
          <Link href="/alunos" className="px-5 py-3 rounded-2xl bg-gray-800 border border-gray-700 text-xs font-black uppercase tracking-widest text-white">Voltar aos alunos</Link>
          <button onClick={carregar} className="px-5 py-3 rounded-2xl bg-amber-500 text-gray-900 text-xs font-black uppercase tracking-widest flex items-center gap-2"><RefreshCw className="w-4 h-4" />Tentar de novo</button>
        </div>
      </div>
    );
  }

  const { aluno, resumo, financeiro, alertas } = ficha;
  const statusAluno = aluno.status === "ativo" ? { t: "Ativo", c: "bg-green-500/10 text-green-400 border-green-500/20" }
    : aluno.status === "bloqueado" ? { t: "Inadimplente", c: "bg-orange-500/15 text-orange-400 border-orange-500/30" }
    : { t: "Inativo", c: "bg-red-500/10 text-red-400 border-red-500/20" };
  const situacaoFin = { em_dia: { t: "Em dia", c: "text-green-400" }, a_vencer: { t: "A vencer", c: "text-amber-400" }, atrasado: { t: "Em atraso", c: "text-red-400" }, sem_cobranca: { t: "Sem cobranças", c: "text-gray-400" } }[financeiro.situacao];
  const proximas = ficha.aulas.filter(a => (a.status === "agendada" || a.status === "aguardando_pagamento") && resumo.proximaAula && (a.date + a.startTime) >= (resumo.proximaAula.date + resumo.proximaAula.startTime)).reverse().slice(0, 4);
  const ultimas = ficha.aulas.filter(a => a.status === "realizada").slice(0, 5);
  const plano = aluno.packagetype && aluno.packagetype !== "avulsa" ? aluno.packagetype : "Aula avulsa";

  return (
    <div className="flex flex-col w-full h-full bg-gray-900 p-4 md:p-8 rounded-tl-[2rem] animate-fade-in gap-6 overflow-y-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4">
        <Link href="/alunos" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-amber-500 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />Meus alunos
        </Link>
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {aluno.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={aluno.avatarUrl} alt="" className="w-16 h-16 rounded-2xl object-cover border border-gray-700 shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-2xl font-black text-amber-500 border border-gray-700 shrink-0">{aluno.name.charAt(0)}</div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight truncate">{aluno.name}</h1>
              <p className="text-sm text-gray-500 font-medium truncate">
                {[aluno.instrument, plano, aluno.desde ? `aluno desde ${fmtData(aluno.desde).slice(3)}` : null].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs text-gray-600 truncate">{[aluno.email, aluno.phone].filter(Boolean).join(" · ") || "Sem contato cadastrado"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Selo cls={statusAluno.c}>{statusAluno.t}</Selo>
            <Link href={`/alunos?editar=${aluno.id}`} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-black uppercase tracking-widest text-white transition-all">
              <Edit3 className="w-4 h-4 text-amber-500" />Editar
            </Link>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="flex flex-col gap-2" role="list" aria-label="Alertas do aluno">
          {alertas.map((a, i) => (
            <div key={i} role="listitem" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${a.nivel === "perigo" ? "bg-red-500/10 border-red-500/20 text-red-300" : a.nivel === "aviso" ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-sky-500/10 border-sky-500/20 text-sky-300"}`}>
              {a.nivel === "info" ? <Info className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{a.texto}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cartões */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Cartao titulo="Aulas realizadas" valor={resumo.realizadas} detalhe={resumo.ultimaAula ? `última em ${fmtData(resumo.ultimaAula.date)}` : "nenhuma ainda"} />
        <Cartao titulo="Próximas aulas" valor={resumo.futuras} detalhe={resumo.proximaAula ? `próxima ${fmtData(resumo.proximaAula.date)} às ${resumo.proximaAula.startTime}` : "nenhuma agendada"} />
        <Cartao titulo="Canceladas" valor={resumo.canceladas} detalhe={resumo.remarcadas ? `${resumo.remarcadas} remarcada${resumo.remarcadas > 1 ? "s" : ""}` : undefined} />
        <Cartao titulo="Reposições livres" valor={resumo.reposicoesLivres} detalhe={resumo.creditosPacoteLivres ? `+ ${resumo.creditosPacoteLivres} crédito${resumo.creditosPacoteLivres > 1 ? "s" : ""} de pacote` : undefined} />
        <Cartao
          titulo="Próx. vencimento"
          valor={financeiro.proximoVencimento ? fmtData(financeiro.proximoVencimento.date).slice(0, 5) : "—"}
          detalhe={financeiro.proximoVencimento ? fmtMoeda(financeiro.proximoVencimento.amount) : "sem fatura em aberto"}
          destaque={financeiro.vencidasQtd > 0 ? "perigo" : financeiro.proximoVencimento ? "aviso" : undefined}
        />
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-gray-800 overflow-x-auto" role="tablist">
        {ABAS.map(t => (
          <button key={t.id} role="tab" aria-selected={aba === t.id} onClick={() => setAba(t.id)}
            className={`px-4 py-3 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors ${aba === t.id ? "border-amber-500 text-amber-500" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
            {t.label}
          </button>
        ))}
        {["Estudos", "Materiais"].map(t => (
          <span key={t} className="px-4 py-3 text-xs font-black uppercase tracking-widest whitespace-nowrap text-gray-700 cursor-default" title="Em breve">{t} <span className="text-[9px] normal-case tracking-normal">(em breve)</span></span>
        ))}
      </div>

      {aba === "geral" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Painel titulo="Próximas aulas" acao={<button onClick={() => setAba("aulas")} className="text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400">Ver todas</button>}>
            {proximas.length ? <ul className="divide-y divide-gray-800">{proximas.map(a => <LinhaAula key={a.id} a={a} />)}</ul> : <p className="text-sm text-gray-500">Nenhuma aula futura agendada.</p>}
          </Painel>
          <Painel titulo="Últimas aulas realizadas">
            {ultimas.length ? <ul className="divide-y divide-gray-800">{ultimas.map(a => <LinhaAula key={a.id} a={a} />)}</ul> : <p className="text-sm text-gray-500">Nenhuma aula realizada ainda.</p>}
          </Painel>
          <Painel titulo="Plano" acao={<Package className="w-4 h-4 text-amber-500" />}>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Plano contratado</dt><dd className="text-white font-bold capitalize">{plano}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Valor da aula</dt><dd className="text-white font-bold">{aluno.lessonPrice ? fmtMoeda(aluno.lessonPrice) : "—"}</dd></div>
              {aluno.expirationdate && <div className="flex justify-between gap-4"><dt className="text-gray-500">Vencimento do plano</dt><dd className="text-white font-bold">{fmtData(aluno.expirationdate)}</dd></div>}
              {resumo.restantesPacote !== null && <div className="flex justify-between gap-4"><dt className="text-gray-500">Aulas restantes no pacote</dt><dd className="text-white font-bold">{resumo.restantesPacote} de {aluno.totalLessons}</dd></div>}
            </dl>
            {aluno.notes && <p className="mt-4 text-xs text-gray-500 border-t border-gray-800 pt-3 break-words">{aluno.notes}</p>}
          </Painel>
          <Painel titulo="Situação financeira" acao={<Wallet className="w-4 h-4 text-amber-500" />}>
            <p className={`text-xl font-black ${situacaoFin.c}`}>{situacaoFin.t}</p>
            <dl className="text-sm space-y-2 mt-3">
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Em aberto</dt><dd className="text-white font-bold">{financeiro.emAbertoQtd} · {fmtMoeda(financeiro.emAbertoValor)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Vencidas</dt><dd className={`font-bold ${financeiro.vencidasQtd ? "text-red-400" : "text-white"}`}>{financeiro.vencidasQtd} · {fmtMoeda(financeiro.vencidasValor)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Último pagamento</dt><dd className="text-white font-bold">{financeiro.ultimoPagamento ? `${fmtData(financeiro.ultimoPagamento.date)} · ${fmtMoeda(financeiro.ultimoPagamento.amount)}` : "—"}</dd></div>
            </dl>
            <button onClick={() => setAba("financeiro")} className="mt-4 text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400">Ver faturas</button>
          </Painel>
        </div>
      )}

      {aba === "aulas" && (
        <Painel titulo={`Histórico de aulas (${aulasFiltradas.length})`} acao={<CalendarClock className="w-4 h-4 text-amber-500" />}>
          <div className="flex flex-wrap gap-3 mb-3">
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} aria-label="Filtrar por status" className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs font-bold text-white">
              <option value="todas">Todos os status</option>
              {Object.entries(STATUS_AULA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)} aria-label="Filtrar por período" className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs font-bold text-white">
              <option value="todas">Todo o período</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
            </select>
          </div>
          {aulasFiltradas.length ? <ul className="divide-y divide-gray-800">{aulasFiltradas.map(a => <LinhaAula key={a.id} a={a} />)}</ul> : <p className="text-sm text-gray-500">Nenhuma aula nesse filtro.</p>}
        </Painel>
      )}

      {aba === "financeiro" && (
        <Painel titulo={`Faturas (${ficha.faturas.length})`} acao={<Link href="/financeiro" className="text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400">Abrir o Financeiro</Link>}>
          <p className="text-xs text-gray-600 mb-3">Dados oficiais do Financeiro. Para registrar pagamento, use a tela Financeiro.</p>
          {ficha.faturas.length ? <ul className="divide-y divide-gray-800">{ficha.faturas.map(f => <LinhaFatura key={f.id} f={f} />)}</ul> : <p className="text-sm text-gray-500">Nenhuma fatura registrada.</p>}
        </Painel>
      )}

      {aba === "reposicoes" && (
        <Painel titulo={`Reposições e créditos (${ficha.reposicoes.length})`} acao={<Repeat className="w-4 h-4 text-amber-500" />}>
          {ficha.reposicoes.length ? <ul className="divide-y divide-gray-800">{ficha.reposicoes.map(r => <LinhaReposicao key={r.id} r={r} />)}</ul> : <p className="text-sm text-gray-500">Nenhum crédito ou reposição registrado.</p>}
        </Painel>
      )}
    </div>
  );
}
