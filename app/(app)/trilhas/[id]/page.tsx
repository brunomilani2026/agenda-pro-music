"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Archive, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { useAppContext } from "../../AppContext";
import {
  aplicarTrilha, apagarItem, apagarModulo, arquivarTrilha, criarItem, criarModulo, editarItem,
  editarTrilha, fetchTrilha, moverItem, moverModulo, renomearModulo,
} from "../actions";
import { ROTULO_DIFICULDADE, SUGESTOES_COMPETENCIA, type ItemTrilha, type ModuloTrilha, type Trilha } from "@/lib/estudos";

const campo = "w-full bg-gray-800/60 border border-gray-700 focus:border-amber-500 focus:outline-none rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600";
const btnIcone = "p-2 rounded-xl text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500";

type DadosItem = { title: string; objective: string; description: string; difficulty: number; competency: string };
const itemVazio: DadosItem = { title: "", objective: "", description: "", difficulty: 1, competency: "" };

function FormItem({ inicial, rotulo, onSalvar, onCancelar }: { inicial: DadosItem; rotulo: string; onSalvar: (d: DadosItem) => Promise<string | null>; onCancelar: () => void }) {
  const [d, setD] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true); setErro(null);
    const msg = await onSalvar(d);
    if (msg) { setErro(msg); setSalvando(false); }
  };
  return (
    <form onSubmit={enviar} className="rounded-2xl border border-gray-700 bg-gray-900/60 p-4 grid gap-3 md:grid-cols-2">
      <input className={`${campo} md:col-span-2`} placeholder="Título do conteúdo" value={d.title} maxLength={160} onChange={e => setD({ ...d, title: e.target.value })} aria-label="Título do conteúdo" required />
      <input className={campo} placeholder="Objetivo (opcional)" value={d.objective} maxLength={2000} onChange={e => setD({ ...d, objective: e.target.value })} aria-label="Objetivo" />
      <input className={campo} list="competencias" placeholder="Competência (ex.: Ritmo)" value={d.competency} maxLength={60} onChange={e => setD({ ...d, competency: e.target.value })} aria-label="Competência" />
      <select className={campo} value={d.difficulty} onChange={e => setD({ ...d, difficulty: Number(e.target.value) })} aria-label="Dificuldade">
        {[1, 2, 3].map(n => <option key={n} value={n}>{ROTULO_DIFICULDADE[n]}</option>)}
      </select>
      <textarea className={campo} rows={2} placeholder="Descrição (opcional)" value={d.description} maxLength={2000} onChange={e => setD({ ...d, description: e.target.value })} aria-label="Descrição" />
      {erro && <p role="alert" className="md:col-span-2 text-sm text-red-400 font-medium">{erro}</p>}
      <div className="md:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white">Cancelar</button>
        <button type="submit" disabled={salvando || !d.title.trim()} className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-40">{salvando ? "Salvando…" : rotulo}</button>
      </div>
    </form>
  );
}

export default function TrilhaEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { students } = useAppContext();
  const [trilha, setTrilha] = useState<Trilha | null>(null);
  const [modulos, setModulos] = useState<ModuloTrilha[]>([]);
  const [itens, setItens] = useState<ItemTrilha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  const [editandoCabecalho, setEditandoCabecalho] = useState(false);
  const [cab, setCab] = useState({ name: "", instrument: "", level: "", description: "" });
  const [novoModulo, setNovoModulo] = useState("");
  const [renomeando, setRenomeando] = useState<{ id: string; titulo: string } | null>(null);
  const [formItem, setFormItem] = useState<{ moduloId: string; itemId?: string } | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    const r = await fetchTrilha(id).catch(() => null);
    if (!r) setErro("Não foi possível carregar a trilha.");
    else if (!r.ok) setErro(r.error);
    else { setErro(null); setTrilha(r.trilha); setModulos(r.modulos); setItens(r.itens); }
    setCarregando(false);
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  const itensPorModulo = useMemo(() => {
    const m = new Map<string, ItemTrilha[]>();
    for (const it of itens) { const l = m.get(it.module_fk) ?? []; l.push(it); m.set(it.module_fk, l); }
    for (const l of m.values()) l.sort((a, b) => a.position - b.position);
    return m;
  }, [itens]);

  const executar = async (p: Promise<{ ok: true } | { ok: false; error: string }>) => {
    const r = await p;
    if (!r.ok) { setErro(r.error); return false; }
    setErro(null);
    await carregar();
    return true;
  };

  if (carregando) return <div className="w-full h-full bg-gray-900 p-8 rounded-tl-[2rem] animate-pulse" aria-busy="true"><div className="h-10 w-64 rounded-2xl bg-gray-800" /></div>;
  if (!trilha) return (
    <div className="w-full h-full bg-gray-900 p-8 rounded-tl-[2rem] flex flex-col items-center justify-center gap-4 text-center">
      <p className="text-white font-bold">{erro ?? "Trilha não encontrada."}</p>
      <Link href="/trilhas" className="px-5 py-3 rounded-2xl bg-gray-800 border border-gray-700 text-xs font-black uppercase tracking-widest text-white">Voltar às trilhas</Link>
    </div>
  );

  const ativos = students.filter(s => s.status !== "inativo");
  const totalItens = itens.length;

  return (
    <div className="flex flex-col w-full h-full bg-gray-900 p-4 md:p-8 rounded-tl-[2rem] animate-fade-in gap-6 overflow-y-auto">
      <datalist id="competencias">{SUGESTOES_COMPETENCIA.map(c => <option key={c} value={c} />)}</datalist>

      <Link href="/trilhas" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-amber-500 w-fit"><ArrowLeft className="w-4 h-4" />Trilhas</Link>

      <div className="flex flex-col md:flex-row md:items-start gap-4">
        <div className="flex-1 min-w-0">
          {editandoCabecalho ? (
            <div className="grid gap-3 md:grid-cols-2">
              <input className={`${campo} md:col-span-2`} value={cab.name} maxLength={120} onChange={e => setCab({ ...cab, name: e.target.value })} aria-label="Nome da trilha" />
              <input className={campo} placeholder="Instrumento" value={cab.instrument} maxLength={60} onChange={e => setCab({ ...cab, instrument: e.target.value })} aria-label="Instrumento" />
              <input className={campo} placeholder="Nível" value={cab.level} maxLength={60} onChange={e => setCab({ ...cab, level: e.target.value })} aria-label="Nível" />
              <textarea className={`${campo} md:col-span-2`} rows={2} placeholder="Descrição" value={cab.description} maxLength={2000} onChange={e => setCab({ ...cab, description: e.target.value })} aria-label="Descrição" />
              <div className="md:col-span-2 flex gap-2 justify-end">
                <button onClick={() => setEditandoCabecalho(false)} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white">Cancelar</button>
                <button onClick={async () => { if (await executar(editarTrilha(trilha.id, cab))) setEditandoCabecalho(false); }} className="px-5 py-2.5 rounded-2xl bg-amber-500 text-gray-900 text-xs font-black uppercase tracking-widest">Salvar</button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">{trilha.name}{trilha.archived && <span className="text-sm text-gray-500 font-medium"> · arquivada</span>}</h1>
              <p className="text-sm text-gray-500">{[trilha.instrument, trilha.level].filter(Boolean).join(" · ") || "Sem instrumento/nível"} · {modulos.length} {modulos.length === 1 ? "módulo" : "módulos"} · {totalItens} {totalItens === 1 ? "conteúdo" : "conteúdos"}</p>
              {trilha.description && <p className="text-sm text-gray-400 mt-2 break-words">{trilha.description}</p>}
            </>
          )}
        </div>
        {!editandoCabecalho && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button onClick={() => { setCab({ name: trilha.name, instrument: trilha.instrument ?? "", level: trilha.level ?? "", description: trilha.description ?? "" }); setEditandoCabecalho(true); }} className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-gray-800 border border-gray-700 text-xs font-black uppercase tracking-widest text-white"><Pencil className="w-4 h-4 text-amber-500" />Editar</button>
            <button onClick={() => executar(arquivarTrilha(trilha.id, !trilha.archived))} className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-gray-800 border border-gray-700 text-xs font-black uppercase tracking-widest text-white"><Archive className="w-4 h-4 text-amber-500" />{trilha.archived ? "Restaurar" : "Arquivar"}</button>
            <button onClick={() => { setEscolhidos(new Set()); setAviso(null); setAplicando(true); }} disabled={totalItens === 0} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-40"><Send className="w-4 h-4" />Aplicar a alunos</button>
          </div>
        )}
      </div>

      {erro && <p role="alert" className="text-sm text-red-400 font-medium">{erro}</p>}
      {aviso && <p role="status" className="text-sm text-green-400 font-medium">{aviso}</p>}

      <div className="space-y-4">
        {modulos.map((m, mi) => {
          const lista = itensPorModulo.get(m.id) ?? [];
          return (
            <section key={m.id} className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                {renomeando?.id === m.id ? (
                  <>
                    <input className={campo} value={renomeando.titulo} maxLength={120} onChange={e => setRenomeando({ id: m.id, titulo: e.target.value })} aria-label="Título do módulo" />
                    <button onClick={async () => { if (await executar(renomearModulo(m.id, renomeando.titulo))) setRenomeando(null); }} className="px-4 py-2 rounded-xl bg-amber-500 text-gray-900 text-xs font-black uppercase tracking-widest">Salvar</button>
                    <button onClick={() => setRenomeando(null)} className={btnIcone} aria-label="Cancelar"><X className="w-4 h-4" /></button>
                  </>
                ) : (
                  <>
                    <h2 className="flex-1 min-w-0 text-sm font-black uppercase tracking-widest text-amber-500 truncate">{m.title}</h2>
                    <button className={btnIcone} disabled={mi === 0} onClick={() => executar(moverModulo(m.id, -1))} aria-label="Subir módulo"><ArrowUp className="w-4 h-4" /></button>
                    <button className={btnIcone} disabled={mi === modulos.length - 1} onClick={() => executar(moverModulo(m.id, 1))} aria-label="Descer módulo"><ArrowDown className="w-4 h-4" /></button>
                    <button className={btnIcone} onClick={() => setRenomeando({ id: m.id, titulo: m.title })} aria-label="Renomear módulo"><Pencil className="w-4 h-4" /></button>
                    <button className={btnIcone} onClick={() => { if (window.confirm(`Apagar o módulo "${m.title}" e seus conteúdos da trilha? Os planos dos alunos que já receberam não mudam.`)) executar(apagarModulo(m.id)); }} aria-label="Apagar módulo"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>

              <ul className="divide-y divide-gray-800">
                {lista.map((it, ii) => (
                  <li key={it.id} className="py-2.5">
                    {formItem?.itemId === it.id ? (
                      <FormItem inicial={{ title: it.title, objective: it.objective ?? "", description: it.description ?? "", difficulty: it.difficulty, competency: it.competency ?? "" }} rotulo="Salvar"
                        onCancelar={() => setFormItem(null)}
                        onSalvar={async d => { const r = await editarItem(it.id, d); if (!r.ok) return r.error; setFormItem(null); await carregar(); return null; }} />
                    ) : (
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white break-words">{it.title}</p>
                          <p className="text-xs text-gray-500">{ROTULO_DIFICULDADE[it.difficulty]}{it.competency ? ` · ${it.competency}` : ""}{it.objective ? ` · ${it.objective}` : ""}</p>
                        </div>
                        <button className={btnIcone} disabled={ii === 0} onClick={() => executar(moverItem(it.id, -1))} aria-label="Subir conteúdo"><ArrowUp className="w-4 h-4" /></button>
                        <button className={btnIcone} disabled={ii === lista.length - 1} onClick={() => executar(moverItem(it.id, 1))} aria-label="Descer conteúdo"><ArrowDown className="w-4 h-4" /></button>
                        <button className={btnIcone} onClick={() => setFormItem({ moduloId: m.id, itemId: it.id })} aria-label="Editar conteúdo"><Pencil className="w-4 h-4" /></button>
                        <button className={btnIcone} onClick={() => { if (window.confirm("Apagar este conteúdo da trilha?")) executar(apagarItem(it.id)); }} aria-label="Apagar conteúdo"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {lista.length === 0 && <p className="text-sm text-gray-500 py-2">Módulo vazio.</p>}

              {formItem?.moduloId === m.id && !formItem.itemId ? (
                <div className="mt-3"><FormItem inicial={itemVazio} rotulo="Adicionar" onCancelar={() => setFormItem(null)}
                  onSalvar={async d => { const r = await criarItem(m.id, d); if (!r.ok) return r.error; setFormItem(null); await carregar(); return null; }} /></div>
              ) : (
                <button onClick={() => setFormItem({ moduloId: m.id })} className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400"><Plus className="w-3.5 h-3.5" />Adicionar conteúdo</button>
              )}
            </section>
          );
        })}
      </div>

      <form onSubmit={async e => { e.preventDefault(); if (await executar(criarModulo(trilha.id, novoModulo))) setNovoModulo(""); }} className="flex gap-2">
        <input className={campo} placeholder="Novo módulo (ex.: Ritmo básico)" value={novoModulo} maxLength={120} onChange={e => setNovoModulo(e.target.value)} aria-label="Título do novo módulo" />
        <button type="submit" disabled={!novoModulo.trim()} className="px-5 rounded-2xl bg-gray-800 border border-gray-700 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40 whitespace-nowrap">Adicionar módulo</button>
      </form>

      {aplicando && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Aplicar trilha a alunos">
          <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-black text-white">Aplicar a alunos</h2><p className="text-xs text-gray-500">Os conteúdos são copiados para cada aluno. Aplicar de novo só acrescenta o que falta.</p></div>
              <button onClick={() => setAplicando(false)} className={btnIcone} aria-label="Fechar"><X className="w-5 h-5" /></button>
            </div>
            {ativos.length === 0 ? <p className="text-sm text-gray-500">Você não tem alunos ativos.</p> : (
              <>
                <button onClick={() => setEscolhidos(escolhidos.size === ativos.length ? new Set() : new Set(ativos.map(a => a.id)))} className="text-[10px] font-black uppercase tracking-widest text-amber-500">{escolhidos.size === ativos.length ? "Desmarcar todos" : "Marcar todos"}</button>
                <ul className="divide-y divide-gray-800">
                  {ativos.map(a => (
                    <li key={a.id}><label className="flex items-center gap-3 py-2.5 cursor-pointer">
                      <input type="checkbox" className="accent-amber-500" checked={escolhidos.has(a.id)} onChange={() => setEscolhidos(s => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })} />
                      <span className="text-sm text-white">{a.name}</span><span className="text-xs text-gray-500">{a.instrument}</span>
                    </label></li>
                  ))}
                </ul>
              </>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setAplicando(false)} className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white">Cancelar</button>
              <button disabled={enviando || escolhidos.size === 0} onClick={async () => {
                setEnviando(true);
                const r = await aplicarTrilha(trilha.id, [...escolhidos]);
                setEnviando(false);
                if (!r.ok) { setErro(r.error); setAplicando(false); return; }
                setErro(null); setAplicando(false);
                setAviso(`Aplicada a ${r.alunos} ${r.alunos === 1 ? "aluno" : "alunos"}: ${r.adicionados} ${r.adicionados === 1 ? "conteúdo adicionado" : "conteúdos adicionados"}${r.jaTinham ? `, ${r.jaTinham} já existiam` : ""}.`);
              }} className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-40">{enviando ? "Aplicando…" : `Aplicar (${escolhidos.size})`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
