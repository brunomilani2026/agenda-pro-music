"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  apagarMinhaEntrega, concluirEntrega, enderecoMinhaEntrega, entregarLink, fetchMinhasTarefas,
  prepararEntrega, type TarefaDoAluno,
} from "../tarefas-actions";
import { enderecoMeuMaterial } from "../portal-actions";
import { MAX_BYTES, formatarTamanho } from "@/lib/materiais";
import { PRIORIDADE_STATUS, ROTULO_STATUS_TAREFA, type StatusTarefa } from "@/lib/tarefas";

const fmtData = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const COR: Record<StatusTarefa, string> = {
  pendente: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  atrasada: "bg-red-500/10 text-red-400 border-red-500/20",
  entregue: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  com_retorno: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  concluida: "bg-green-500/10 text-green-400 border-green-500/20",
};

async function abrirEm(buscar: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>, erro: (m: string) => void) {
  const janela = window.open("", "_blank");
  const r = await buscar();
  if (!r.ok) { janela?.close(); erro(r.error); return; }
  if (janela) { janela.opener = null; janela.location.href = r.url; } else window.location.href = r.url;
}

function FormEntrega({ tarefa, onFeito, onErro }: { tarefa: TarefaDoAluno; onFeito: () => void; onErro: (m: string) => void }) {
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      if (modo === "link") {
        const r = await entregarLink(tarefa.id, link, nota);
        if (!r.ok) { onErro(r.error); return; }
      } else {
        if (!arquivo) { onErro("Escolha um arquivo."); return; }
        if (arquivo.size > MAX_BYTES) { onErro(`O arquivo passa de ${formatarTamanho(MAX_BYTES)}.`); return; }
        const prep = await prepararEntrega(tarefa.id, { nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size });
        if (!prep.ok) { onErro(prep.error); return; }
        const { error } = await createClient().storage.from("entregas").uploadToSignedUrl(prep.path, prep.token, arquivo, { contentType: arquivo.type });
        if (error) { onErro("Não foi possível enviar o arquivo. Tente de novo."); return; }
        const fim = await concluirEntrega(tarefa.id, prep.path, nota, arquivo.name);
        if (!fim.ok) { onErro(fim.error); return; }
      }
      setArquivo(null); setLink(""); setNota(""); if (input.current) input.current.value = "";
      onFeito();
    } catch {
      onErro("Não foi possível concluir o envio. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  const campo = "w-full bg-gray-800/60 border border-gray-700 focus:border-amber-500 focus:outline-none rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600";
  return (
    <form onSubmit={enviar} className="rounded-2xl border border-gray-700 bg-gray-900/60 p-4 space-y-3">
      <div className="flex gap-2">
        {(["arquivo", "link"] as const).map(t => (
          <button key={t} type="button" onClick={() => setModo(t)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border ${modo === t ? "bg-amber-500 text-gray-900 border-amber-500" : "bg-gray-900 text-gray-400 border-gray-700"}`}>{t === "arquivo" ? "Enviar arquivo" : "Enviar link"}</button>
        ))}
      </div>
      {modo === "arquivo" ? (
        <div>
          <input ref={input} type="file" aria-label="Arquivo da entrega" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.mp3,.m4a,.wav,.ogg,.aac,.mp4,.mov,.webm,.txt" onChange={e => setArquivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-xl file:border-0 file:bg-gray-800 file:px-4 file:py-2 file:text-xs file:font-black file:uppercase file:tracking-widest file:text-white" />
          <p className="text-xs text-gray-600 mt-1.5">Áudio, vídeo, imagem, PDF ou texto, até {formatarTamanho(MAX_BYTES)}. Só você e o seu professor abrem.</p>
        </div>
      ) : (
        <input className={campo} placeholder="Endereço (https://...), por exemplo um vídeo não listado do YouTube" value={link} maxLength={2000} onChange={e => setLink(e.target.value)} aria-label="Endereço do link" />
      )}
      <textarea className={campo} rows={2} placeholder="Observação para o professor (opcional)" value={nota} maxLength={5000} onChange={e => setNota(e.target.value)} aria-label="Observação" />
      <div className="flex justify-end"><button type="submit" disabled={enviando} className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-40">{enviando ? "Enviando…" : "Entregar"}</button></div>
    </form>
  );
}

export default function MinhasTarefasPage() {
  const [tarefas, setTarefas] = useState<TarefaDoAluno[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [entregando, setEntregando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetchMinhasTarefas();
      if (r.ok) { setDisponivel(r.disponivel); setTarefas(r.tarefas); } else setErro(r.error);
    } catch { setErro("Não foi possível carregar suas tarefas."); }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const ordenadas = useMemo(() => [...tarefas].sort((a, b) => PRIORIDADE_STATUS[a.estado] - PRIORIDADE_STATUS[b.estado] || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")), [tarefas]);

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Minhas tarefas</h1>
        <p className="text-sm text-gray-500 mt-1">Exercícios que o seu professor passou. Envie a sua gravação e veja o retorno.</p>
      </div>

      {erro && <p role="alert" className="text-sm text-red-400 font-medium">{erro}</p>}
      {aviso && <p role="status" className="text-sm text-green-400 font-medium">{aviso}</p>}

      {carregando ? (
        <div className="space-y-3 animate-pulse" aria-busy="true"><div className="h-32 rounded-3xl bg-gray-800/60" /><div className="h-32 rounded-3xl bg-gray-800/60" /></div>
      ) : !disponivel || tarefas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 opacity-60 py-16 text-center">
          <ClipboardList className="w-12 h-12 text-gray-600" />
          <p className="text-gray-300 font-bold">Nenhuma tarefa por enquanto</p>
          <p className="text-sm text-gray-500 max-w-sm">Quando o seu professor passar um exercício, ele aparece aqui.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ordenadas.map(t => (
            <section key={t.id} className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-black text-white break-words">{t.title}</h2>
                  <p className="text-xs text-gray-500">{t.due_date ? `Prazo sugerido: ${fmtData(t.due_date)}` : "Sem prazo"}</p>
                </div>
                <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${COR[t.estado]}`}>{ROTULO_STATUS_TAREFA[t.estado]}</span>
              </div>
              {t.description && <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{t.description}</p>}
              {t.materiais.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Material de apoio</p>
                  <div className="flex flex-wrap gap-2">
                    {t.materiais.map(m => (
                      <button key={m.id} onClick={() => abrirEm(() => enderecoMeuMaterial(m.id), setErro)} className="px-3 py-1.5 rounded-xl bg-gray-800 border border-gray-700 hover:border-amber-500/50 text-xs font-bold text-white break-words text-left">{m.title}</button>
                    ))}
                  </div>
                </div>
              )}

              {t.entregas.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Suas entregas</p>
                  {t.entregas.map(e => (
                    <div key={e.id} className="rounded-2xl border border-gray-800 bg-gray-900/40 p-3 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">{fmtData(e.created_at)} · {e.kind === "link" ? "Link" : e.file_name ?? "Arquivo"}{e.size_bytes ? ` · ${formatarTamanho(e.size_bytes)}` : ""}</span>
                        <button onClick={() => abrirEm(() => enderecoMinhaEntrega(e.id), setErro)} className="text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400">Abrir</button>
                        {!e.feedback_at && t.estado !== "concluida" && (
                          <button onClick={async () => { if (!window.confirm("Apagar esta entrega?")) return; const r = await apagarMinhaEntrega(e.id); if (!r.ok) setErro(r.error); else { setErro(null); carregar(); } }} className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" />Apagar</button>
                        )}
                      </div>
                      {e.note && <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{e.note}</p>}
                      {e.feedback && (
                        <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">Retorno do professor · {fmtData(e.feedback_at)}</p>
                          <p className="text-sm text-gray-100 whitespace-pre-wrap break-words mt-0.5">{e.feedback}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {t.estado !== "concluida" && (
                entregando === t.id ? (
                  <FormEntrega tarefa={t} onErro={setErro} onFeito={() => { setEntregando(null); setErro(null); setAviso("Entrega enviada."); carregar(); }} />
                ) : (
                  <button onClick={() => { setEntregando(t.id); setAviso(null); }} className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-[10px] font-black uppercase tracking-widest">{t.entregas.length ? "Entregar de novo" : "Entregar"}</button>
                )
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
