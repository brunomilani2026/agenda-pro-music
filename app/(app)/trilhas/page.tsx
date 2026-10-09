"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Plus } from "lucide-react";
import { criarTrilha, listarTrilhas } from "./actions";
import type { Trilha } from "@/lib/estudos";

type Linha = Trilha & { modulos: number; itens: number };

export default function TrilhasPage() {
  const router = useRouter();
  const [trilhas, setTrilhas] = useState<Linha[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState({ name: "", instrument: "", level: "", description: "" });
  const [criando, setCriando] = useState(false);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await listarTrilhas().catch(() => null);
    if (!r) setErro("Não foi possível carregar as trilhas.");
    else if (!r.ok) setErro(r.error);
    else { setErro(null); setDisponivel(r.disponivel); setTrilhas(r.trilhas); }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCriando(true);
    setErro(null);
    const r = await criarTrilha(novo);
    setCriando(false);
    if (!r.ok) { setErro(r.error); return; }
    router.push(`/trilhas/${r.id}`);
  };

  const campo = "w-full bg-gray-800/60 border border-gray-700 focus:border-amber-500 focus:outline-none rounded-2xl px-4 py-3 text-sm text-white placeholder:text-gray-600";

  return (
    <div className="flex flex-col w-full h-full bg-gray-900 p-4 md:p-8 rounded-tl-[2rem] animate-fade-in gap-6 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter italic uppercase">Minhas <span className="text-amber-500">Trilhas</span></h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">Monte planos de estudo e aplique a um ou vários alunos.</p>
        </div>
        {disponivel && (
          <button onClick={() => setAberto(a => !a)} className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-gray-900 font-black py-4 px-8 rounded-2xl text-xs uppercase tracking-widest">
            <Plus className="w-4 h-4" />Nova trilha
          </button>
        )}
      </div>

      {erro && <p role="alert" className="text-sm text-red-400 font-medium">{erro}</p>}

      {!disponivel && !carregando && (
        <div className="rounded-3xl border border-gray-800 bg-gray-800/40 p-6 text-sm text-gray-400">Os planos de estudo ainda não foram ativados no banco.</div>
      )}

      {aberto && disponivel && (
        <form onSubmit={criar} className="rounded-3xl border border-gray-800 bg-gray-800/40 p-5 grid gap-3 md:grid-cols-2">
          <input className={`${campo} md:col-span-2`} placeholder="Nome da trilha (ex.: Cavaquinho iniciante)" value={novo.name} maxLength={120} onChange={e => setNovo({ ...novo, name: e.target.value })} aria-label="Nome da trilha" required />
          <input className={campo} placeholder="Instrumento (opcional)" value={novo.instrument} maxLength={60} onChange={e => setNovo({ ...novo, instrument: e.target.value })} aria-label="Instrumento" />
          <input className={campo} placeholder="Nível (opcional)" value={novo.level} maxLength={60} onChange={e => setNovo({ ...novo, level: e.target.value })} aria-label="Nível" />
          <textarea className={`${campo} md:col-span-2`} rows={2} placeholder="Descrição (opcional)" value={novo.description} maxLength={2000} onChange={e => setNovo({ ...novo, description: e.target.value })} aria-label="Descrição" />
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={criando || !novo.name.trim()} className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-40">{criando ? "Criando…" : "Criar e montar"}</button>
          </div>
        </form>
      )}

      {carregando ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 animate-pulse" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-32 rounded-3xl bg-gray-800/60" />)}</div>
      ) : disponivel && trilhas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 opacity-60 py-16 text-center">
          <Layers className="w-12 h-12 text-gray-600" />
          <p className="text-gray-300 font-bold">Nenhuma trilha ainda</p>
          <p className="text-sm text-gray-500 max-w-sm">Uma trilha é uma sequência de módulos e conteúdos que você aplica aos alunos e acompanha na ficha de cada um.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {trilhas.map(t => (
            <Link key={t.id} href={`/trilhas/${t.id}`} className={`rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5 hover:border-amber-500/40 transition-colors ${t.archived ? "opacity-50" : ""}`}>
              <p className="text-lg font-black text-white tracking-tight">{t.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{[t.instrument, t.level].filter(Boolean).join(" · ") || "Sem instrumento/nível"}{t.archived ? " · arquivada" : ""}</p>
              {t.description && <p className="text-sm text-gray-400 mt-2 line-clamp-2">{t.description}</p>}
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mt-4">{t.modulos} {t.modulos === 1 ? "módulo" : "módulos"} · {t.itens} {t.itens === 1 ? "conteúdo" : "conteúdos"}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
