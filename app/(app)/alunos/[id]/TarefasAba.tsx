"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  apagarTarefa, concluirTarefa, criarTarefa, darRetorno, editarTarefa, enderecoEntrega, fetchTarefas,
  type TarefaCompleta,
} from "./tarefas-actions";
import { formatarTamanho } from "@/lib/materiais";
import { ROTULO_STATUS_TAREFA, type StatusTarefa } from "@/lib/tarefas";

const fmtData = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const COR: Record<StatusTarefa, string> = {
  pendente: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  atrasada: "bg-red-500/10 text-red-400 border-red-500/20",
  entregue: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  com_retorno: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  concluida: "bg-green-500/10 text-green-400 border-green-500/20",
};
const campo = "w-full bg-gray-800/60 border border-gray-700 focus:border-amber-500 focus:outline-none rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600";

type Form = { title: string; description: string; due_date: string; materiais: Set<string> };
const formVazio = (): Form => ({ title: "", description: "", due_date: "", materiais: new Set() });

function Painel({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5">
      <div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-xs font-black uppercase tracking-widest text-gray-400">{titulo}</h2>{acao}</div>
      {children}
    </section>
  );
}

function FormTarefa({ inicial, biblioteca, rotulo, onSalvar, onCancelar }: {
  inicial: Form; biblioteca: { id: string; title: string }[]; rotulo: string;
  onSalvar: (f: Form) => Promise<string | null>; onCancelar: () => void;
}) {
  const [f, setF] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <form onSubmit={async e => { e.preventDefault(); setSalvando(true); setErro(null); const m = await onSalvar(f); if (m) { setErro(m); setSalvando(false); } }} className="rounded-2xl border border-gray-700 bg-gray-900/60 p-4 grid gap-3 md:grid-cols-2">
      <input className={`${campo} md:col-span-2`} placeholder="Título da tarefa (ex.: Gravar a batida de samba)" value={f.title} maxLength={160} onChange={e => setF({ ...f, title: e.target.value })} aria-label="Título da tarefa" required />
      <textarea className={`${campo} md:col-span-2`} rows={3} placeholder="Descrição: o que o aluno deve fazer" value={f.description} maxLength={5000} onChange={e => setF({ ...f, description: e.target.value })} aria-label="Descrição" />
      <label className="text-xs text-gray-400 font-bold">Prazo sugerido (opcional)
        <input type="date" className={`${campo} mt-1`} value={f.due_date} onChange={e => setF({ ...f, due_date: e.target.value })} />
      </label>
      {biblioteca.length > 0 && (
        <fieldset className="rounded-2xl border border-gray-800 p-3 md:col-span-2">
          <legend className="px-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Material de apoio (compartilhado com o aluno)</legend>
          <ul className="max-h-36 overflow-y-auto divide-y divide-gray-800">
            {biblioteca.map(m => (
              <li key={m.id}><label className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input type="checkbox" className="accent-amber-500" checked={f.materiais.has(m.id)} onChange={() => setF(x => { const n = new Set(x.materiais); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return { ...x, materiais: n }; })} />
                <span className="text-sm text-white break-words">{m.title}</span>
              </label></li>
            ))}
          </ul>
        </fieldset>
      )}
      {erro && <p role="alert" className="md:col-span-2 text-sm text-red-400 font-medium">{erro}</p>}
      <div className="md:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white">Cancelar</button>
        <button type="submit" disabled={salvando || !f.title.trim()} className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-40">{salvando ? "Salvando…" : rotulo}</button>
      </div>
    </form>
  );
}

function RetornoBox({ onEnviar }: { onEnviar: (texto: string) => Promise<string | null> }) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <div className="space-y-2">
      <textarea className={campo} rows={2} placeholder="Escreva o retorno para o aluno" value={texto} maxLength={5000} onChange={e => setTexto(e.target.value)} aria-label="Retorno para o aluno" />
      {erro && <p role="alert" className="text-sm text-red-400 font-medium">{erro}</p>}
      <button disabled={enviando || !texto.trim()} onClick={async () => { setEnviando(true); const m = await onEnviar(texto); setEnviando(false); if (m) setErro(m); else { setErro(null); setTexto(""); } }} className="px-4 py-2 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-[10px] font-black uppercase tracking-widest disabled:opacity-40">Enviar retorno</button>
    </div>
  );
}

export default function TarefasAba({ alunoId }: { alunoId: string }) {
  const [tarefas, setTarefas] = useState<TarefaCompleta[]>([]);
  const [biblioteca, setBiblioteca] = useState<{ id: string; title: string }[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetchTarefas(alunoId);
      if (r.ok) { setErro(null); setDisponivel(r.disponivel); setTarefas(r.tarefas); setBiblioteca(r.biblioteca); } else setErro(r.error);
    } catch { setErro("Não foi possível carregar as tarefas."); }
    setCarregando(false);
  }, [alunoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const agir = async (p: Promise<{ ok: true } | { ok: false; error: string }>) => {
    const r = await p;
    if (!r.ok) { setErro(r.error); return false; }
    setErro(null); await carregar(); return true;
  };

  const abrirEntrega = async (id: string) => {
    const janela = window.open("", "_blank");
    const r = await enderecoEntrega(alunoId, id);
    if (!r.ok) { janela?.close(); setErro(r.error); return; }
    if (janela) { janela.opener = null; janela.location.href = r.url; } else window.location.href = r.url;
  };

  if (carregando) return <div className="h-32 rounded-3xl bg-gray-800/60 animate-pulse" aria-busy="true" />;
  if (!disponivel) return <Painel titulo="Tarefas"><p className="text-sm text-gray-500">As tarefas ainda não foram ativadas no banco.</p></Painel>;

  return (
    <div className="space-y-4">
      {erro && <p role="alert" className="text-sm text-red-400 font-medium">{erro}</p>}
      <Painel titulo={`Tarefas (${tarefas.length})`} acao={!criando && <button onClick={() => setCriando(true)} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400"><Plus className="w-3.5 h-3.5" />Nova tarefa</button>}>
        {criando && (
          <div className="mb-4">
            <FormTarefa inicial={formVazio()} biblioteca={biblioteca} rotulo="Criar tarefa" onCancelar={() => setCriando(false)}
              onSalvar={async f => { const r = await criarTarefa([alunoId], { title: f.title, description: f.description, due_date: f.due_date }, [...f.materiais]); if (!r.ok) return r.error; setCriando(false); await carregar(); return null; }} />
          </div>
        )}
        {tarefas.length === 0 && !criando ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center opacity-70"><ClipboardList className="w-8 h-8 text-gray-600" /><p className="text-sm text-gray-500">Nenhuma tarefa para este aluno ainda.</p></div>
        ) : (
          <ul className="space-y-4">
            {tarefas.map(t => (
              <li key={t.id} className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 space-y-3">
                {editando === t.id ? (
                  <FormTarefa inicial={{ title: t.title, description: t.description ?? "", due_date: t.due_date ?? "", materiais: new Set(t.materiais.map(m => m.id)) }} biblioteca={biblioteca} rotulo="Salvar" onCancelar={() => setEditando(null)}
                    onSalvar={async f => { const r = await editarTarefa(alunoId, t.id, { title: f.title, description: f.description, due_date: f.due_date }, [...f.materiais]); if (!r.ok) return r.error; setEditando(null); await carregar(); return null; }} />
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-white break-words">{t.title}</p>
                        <p className="text-xs text-gray-500">{t.due_date ? `Prazo: ${fmtData(t.due_date)}` : "Sem prazo"} · criada em {fmtData(t.created_at)}</p>
                      </div>
                      <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${COR[t.estado]}`}>{ROTULO_STATUS_TAREFA[t.estado]}</span>
                    </div>
                    {t.description && <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{t.description}</p>}
                    {t.materiais.length > 0 && <p className="text-xs text-gray-500">Apoio: {t.materiais.map(m => m.title).join(", ")}</p>}

                    {t.entregas.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Entregas do aluno</p>
                        {t.entregas.map(e => (
                          <div key={e.id} className="rounded-2xl border border-gray-800 bg-gray-800/30 p-3 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-gray-400">{fmtData(e.created_at)} · {e.kind === "link" ? "Link" : e.file_name ?? "Arquivo"}{e.size_bytes ? ` · ${formatarTamanho(e.size_bytes)}` : ""}</span>
                              <button onClick={() => abrirEntrega(e.id)} className="px-3 py-1 rounded-lg bg-amber-500 text-gray-900 text-[10px] font-black uppercase tracking-widest">Abrir</button>
                            </div>
                            {e.note && <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">“{e.note}”</p>}
                            {e.feedback ? (
                              <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">Seu retorno · {fmtData(e.feedback_at)}</p>
                                <p className="text-sm text-gray-100 whitespace-pre-wrap break-words mt-0.5">{e.feedback}</p>
                              </div>
                            ) : null}
                            <RetornoBox onEnviar={async texto => { const r = await darRetorno(alunoId, e.id, texto); if (!r.ok) return r.error; await carregar(); return null; }} />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {t.estado === "concluida" ? (
                        <button onClick={() => agir(concluirTarefa(alunoId, t.id, false))} className="px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-[10px] font-black uppercase tracking-widest text-white">Reabrir</button>
                      ) : (
                        <button onClick={() => agir(concluirTarefa(alunoId, t.id, true))} className="px-4 py-2 rounded-xl bg-green-500/20 border border-green-500/30 text-green-300 text-[10px] font-black uppercase tracking-widest">Marcar como concluída</button>
                      )}
                      <button onClick={() => setEditando(t.id)} className="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-gray-800" aria-label="Editar tarefa"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => { if (window.confirm("Apagar esta tarefa, as entregas e os arquivos enviados pelo aluno?")) agir(apagarTarefa(alunoId, t.id)); }} className="p-2 rounded-xl text-gray-500 hover:text-red-400 hover:bg-gray-800" aria-label="Apagar tarefa"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
