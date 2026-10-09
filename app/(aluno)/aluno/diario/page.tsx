"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Lock, Plus, Trash2 } from "lucide-react";
import { apagarMinhaNota, fetchMeuDiario, salvarMinhaNota, type AulaLiberada, type NotaDoAluno } from "../portal-actions";
import { MAX_CAMPO } from "@/lib/diario-aluno";

const fmtData = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export default function MeuDiarioPage() {
  const [aulas, setAulas] = useState<AulaLiberada[]>([]);
  const [notas, setNotas] = useState<NotaDoAluno[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetchMeuDiario();
      if (r.ok) { setErro(null); setDisponivel(r.disponivel); setAulas(r.aulas); setNotas(r.notas); } else setErro(r.error);
    } catch { setErro("Não foi possível carregar seu diário."); }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const recados = notas.filter(n => n.visibility === "compartilhada");
  const minhas = notas.filter(n => n.visibility === "aluno_pessoal");

  const salvar = async () => {
    setSalvando(true);
    const r = await salvarMinhaNota(texto, editando ?? undefined);
    setSalvando(false);
    if (!r.ok) { setErro(r.error); return; }
    setErro(null); setTexto(""); setEditando(null);
    carregar();
  };

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Meu diário</h1>
        <p className="text-sm text-gray-500 mt-1">O que você estudou nas aulas, as tarefas para casa e as suas anotações.</p>
      </div>

      {erro && <p role="alert" className="text-sm text-red-400 font-medium">{erro}</p>}

      {carregando ? (
        <div className="space-y-3 animate-pulse" aria-busy="true"><div className="h-32 rounded-3xl bg-gray-800/60" /><div className="h-32 rounded-3xl bg-gray-800/60" /></div>
      ) : !disponivel ? (
        <p className="text-sm text-gray-500">O diário ainda não está disponível.</p>
      ) : (
        <>
          <section className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5">
            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400 mb-4"><BookOpen className="w-4 h-4 text-amber-500" />Minhas aulas</h2>
            {aulas.length === 0 ? <p className="text-sm text-gray-500">Seu professor ainda não liberou nenhum registro de aula.</p> : (
              <ul className="space-y-3">
                {aulas.map(a => (
                  <li key={a.idlesson_fk} className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
                    <p className="text-sm font-bold text-white">{fmtData(a.date)}{a.starttime ? <span className="text-gray-500 font-medium"> · {a.starttime}</span> : null}{a.instrument ? <span className="text-gray-500 font-medium"> · {a.instrument}</span> : null}</p>
                    <dl className="text-sm mt-2 space-y-2">
                      {a.content_worked && <div><dt className="text-[10px] font-black uppercase tracking-widest text-gray-500">O que estudamos</dt><dd className="text-gray-200 whitespace-pre-wrap break-words">{a.content_worked}</dd></div>}
                      {a.homework && <div><dt className="text-[10px] font-black uppercase tracking-widest text-amber-500">Para praticar em casa</dt><dd className="text-gray-200 whitespace-pre-wrap break-words">{a.homework}</dd></div>}
                      {a.next_plan && <div><dt className="text-[10px] font-black uppercase tracking-widest text-gray-500">Próxima aula</dt><dd className="text-gray-200 whitespace-pre-wrap break-words">{a.next_plan}</dd></div>}
                      {a.shared_note && <div><dt className="text-[10px] font-black uppercase tracking-widest text-sky-400">Recado do professor</dt><dd className="text-gray-200 whitespace-pre-wrap break-words">{a.shared_note}</dd></div>}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {recados.length > 0 && (
            <section className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5">
              <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">Recados do professor</h2>
              <ul className="space-y-2">
                {recados.map(n => (
                  <li key={n.id} className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
                    <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{n.body}</p>
                    <p className="text-xs text-gray-600 mt-1.5">{fmtData(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5">
            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400 mb-1"><Lock className="w-4 h-4 text-amber-500" />Minhas anotações</h2>
            <p className="text-xs text-gray-500 mb-4">Só você vê estas anotações. Nem o seu professor tem acesso.</p>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 space-y-3 mb-4">
              <textarea value={texto} maxLength={MAX_CAMPO} rows={3} onChange={e => setTexto(e.target.value)} placeholder="Escreva o que quiser lembrar: dúvidas, dicas, o que praticar..." aria-label="Minha anotação"
                className="w-full bg-gray-800/60 border border-gray-700 focus:border-amber-500 focus:outline-none rounded-2xl px-4 py-3 text-sm text-white placeholder:text-gray-600 resize-y" />
              <div className="flex justify-end gap-2">
                {editando && <button onClick={() => { setEditando(null); setTexto(""); }} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white">Cancelar</button>}
                <button onClick={salvar} disabled={salvando || !texto.trim()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-40"><Plus className="w-4 h-4" />{editando ? "Salvar edição" : "Adicionar"}</button>
              </div>
            </div>
            {minhas.length === 0 ? <p className="text-sm text-gray-500">Você ainda não tem anotações.</p> : (
              <ul className="space-y-2">
                {minhas.map(n => (
                  <li key={n.id} className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
                    <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{n.body}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs text-gray-600">{fmtData(n.created_at)}</span>
                      <button onClick={() => { setEditando(n.id); setTexto(n.body); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400">Editar</button>
                      <button onClick={async () => { if (!window.confirm("Apagar esta anotação?")) return; const r = await apagarMinhaNota(n.id); if (!r.ok) setErro(r.error); else carregar(); }} className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" />Apagar</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
