"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, FolderOpen, Link2, Pencil, Play, Share2, Trash2, Upload, X } from "lucide-react";
import { useAppContext } from "../AppContext";
import { createClient } from "@/lib/supabase/client";
import {
  apagarMaterial, concluirUpload, criarLink, definirCompartilhamento, editarMaterial,
  enderecoDoMaterial, fetchCompartilhamento, listarMateriais, prepararUpload, type MaterialLinha,
} from "./actions";
import { CATEGORIAS_SUGERIDAS, filtrarMateriais, formatarTamanho, MAX_BYTES, valoresDistintos } from "@/lib/materiais";

const campo = "w-full bg-gray-800/60 border border-gray-700 focus:border-amber-500 focus:outline-none rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600";
const btnIcone = "p-2 rounded-xl text-gray-500 hover:text-white hover:bg-gray-800";
const ROTULO_TIPO: Record<string, string> = { arquivo: "Arquivo", link: "Link", youtube: "YouTube" };

type Form = { title: string; category: string; instrument: string; level: string; content_tag: string; description: string; url: string };
const formVazio: Form = { title: "", category: "", instrument: "", level: "", content_tag: "", description: "", url: "" };

function Metadados({ f, setF, comUrl }: { f: Form; setF: (f: Form) => void; comUrl?: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <input className={`${campo} md:col-span-2`} placeholder="Título do material" value={f.title} maxLength={160} onChange={e => setF({ ...f, title: e.target.value })} aria-label="Título" />
      {comUrl && <input className={`${campo} md:col-span-2`} placeholder="Endereço (https://...)" value={f.url} maxLength={2000} onChange={e => setF({ ...f, url: e.target.value })} aria-label="Endereço do link" />}
      <input className={campo} list="cats-material" placeholder="Categoria (ex.: Partitura)" value={f.category} maxLength={60} onChange={e => setF({ ...f, category: e.target.value })} aria-label="Categoria" />
      <input className={campo} placeholder="Instrumento (opcional)" value={f.instrument} maxLength={60} onChange={e => setF({ ...f, instrument: e.target.value })} aria-label="Instrumento" />
      <input className={campo} placeholder="Nível (opcional)" value={f.level} maxLength={60} onChange={e => setF({ ...f, level: e.target.value })} aria-label="Nível" />
      <input className={campo} placeholder="Conteúdo/tema (opcional)" value={f.content_tag} maxLength={60} onChange={e => setF({ ...f, content_tag: e.target.value })} aria-label="Conteúdo" />
      <textarea className={`${campo} md:col-span-2`} rows={2} placeholder="Descrição (opcional)" value={f.description} maxLength={2000} onChange={e => setF({ ...f, description: e.target.value })} aria-label="Descrição" />
    </div>
  );
}

export default function MateriaisPage() {
  const { students } = useAppContext();
  const [materiais, setMateriais] = useState<MaterialLinha[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [novo, setNovo] = useState<Form>(formVazio);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const [filtro, setFiltro] = useState({ texto: "", instrumento: "", categoria: "", tipo: "" });
  const [editando, setEditando] = useState<{ id: string; kind: string; f: Form } | null>(null);
  const [compartilhando, setCompartilhando] = useState<{ id: string; titulo: string; escolhidos: Set<string> } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await listarMateriais().catch(() => null);
    if (!r) setErro("Não foi possível carregar os materiais.");
    else if (!r.ok) setErro(r.error);
    else { setErro(null); setDisponivel(r.disponivel); setMateriais(r.materiais); }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => filtrarMateriais(materiais, filtro), [materiais, filtro]);
  const instrumentos = useMemo(() => valoresDistintos(materiais.map(m => m.instrument)), [materiais]);
  const categorias = useMemo(() => valoresDistintos([...CATEGORIAS_SUGERIDAS, ...materiais.map(m => m.category)]), [materiais]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null); setAviso(null);
    if (!novo.title.trim()) { setErro("Informe o título do material."); return; }
    setEnviando(true);
    try {
      if (modo === "link") {
        const r = await criarLink(novo);
        if (!r.ok) { setErro(r.error); return; }
      } else {
        if (!arquivo) { setErro("Escolha um arquivo."); return; }
        if (arquivo.size > MAX_BYTES) { setErro(`O arquivo passa de ${formatarTamanho(MAX_BYTES)}.`); return; }
        const prep = await prepararUpload({ nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size });
        if (!prep.ok) { setErro(prep.error); return; }
        const { error } = await createClient().storage.from("materials").uploadToSignedUrl(prep.path, prep.token, arquivo, { contentType: arquivo.type });
        if (error) { setErro("Não foi possível enviar o arquivo. Tente de novo."); return; }
        const fim = await concluirUpload(prep.path, { ...novo, file_name: arquivo.name });
        if (!fim.ok) { setErro(fim.error); return; }
      }
      setNovo(formVazio); setArquivo(null); if (inputArquivo.current) inputArquivo.current.value = "";
      setAberto(false); setAviso("Material adicionado.");
      await carregar();
    } catch {
      setErro("Não foi possível concluir o envio. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  const abrir = async (id: string) => {
    const janela = window.open("", "_blank");
    const r = await enderecoDoMaterial(id);
    if (!r.ok) { janela?.close(); setErro(r.error); return; }
    if (janela) { janela.opener = null; janela.location.href = r.url; } else window.location.href = r.url;
  };

  const abrirCompartilhar = async (m: MaterialLinha) => {
    const r = await fetchCompartilhamento(m.id);
    if (!r.ok) { setErro(r.error); return; }
    setCompartilhando({ id: m.id, titulo: m.title, escolhidos: new Set(r.alunos) });
  };

  return (
    <div className="flex flex-col w-full h-full bg-gray-900 p-4 md:p-8 rounded-tl-[2rem] animate-fade-in gap-6 overflow-y-auto">
      <datalist id="cats-material">{categorias.map(c => <option key={c} value={c} />)}</datalist>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter italic uppercase">Meus <span className="text-amber-500">Materiais</span></h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">PDFs, partituras, áudios, vídeos e links. Cadastre uma vez e compartilhe com quem quiser.</p>
        </div>
        {disponivel && (
          <button onClick={() => setAberto(a => !a)} className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-gray-900 font-black py-4 px-8 rounded-2xl text-xs uppercase tracking-widest">
            <Upload className="w-4 h-4" />Adicionar material
          </button>
        )}
      </div>

      {erro && <p role="alert" className="text-sm text-red-400 font-medium">{erro}</p>}
      {aviso && <p role="status" className="text-sm text-green-400 font-medium">{aviso}</p>}
      {!disponivel && !carregando && <div className="rounded-3xl border border-gray-800 bg-gray-800/40 p-6 text-sm text-gray-400">A biblioteca de materiais ainda não foi ativada no banco.</div>}

      {aberto && disponivel && (
        <form onSubmit={enviar} className="rounded-3xl border border-gray-800 bg-gray-800/40 p-5 space-y-4">
          <div className="flex gap-2">
            {(["arquivo", "link"] as const).map(t => (
              <button key={t} type="button" onClick={() => setModo(t)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border ${modo === t ? "bg-amber-500 text-gray-900 border-amber-500" : "bg-gray-900 text-gray-400 border-gray-700"}`}>{t === "arquivo" ? "Arquivo" : "Link ou YouTube"}</button>
            ))}
          </div>
          {modo === "arquivo" && (
            <div>
              <input ref={inputArquivo} type="file" aria-label="Arquivo" onChange={e => { const f = e.target.files?.[0] ?? null; setArquivo(f); if (f && !novo.title) setNovo(n => ({ ...n, title: f.name.replace(/\.[^.]+$/, "") })); }}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.mp3,.m4a,.wav,.ogg,.aac,.mp4,.mov,.webm,.doc,.docx,.txt"
                className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-xl file:border-0 file:bg-gray-800 file:px-4 file:py-2 file:text-xs file:font-black file:uppercase file:tracking-widest file:text-white" />
              <p className="text-xs text-gray-600 mt-1.5">PDF, imagem, áudio, vídeo, Word ou texto, até {formatarTamanho(MAX_BYTES)}. O arquivo fica em área privada.</p>
            </div>
          )}
          <Metadados f={novo} setF={setNovo} comUrl={modo === "link"} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAberto(false)} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white">Cancelar</button>
            <button type="submit" disabled={enviando} className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-40">{enviando ? "Enviando…" : "Salvar material"}</button>
          </div>
        </form>
      )}

      {disponivel && materiais.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <input className={`${campo} md:max-w-xs`} placeholder="Buscar..." value={filtro.texto} onChange={e => setFiltro({ ...filtro, texto: e.target.value })} aria-label="Buscar materiais" />
          <select className={`${campo} md:max-w-[12rem]`} value={filtro.categoria} onChange={e => setFiltro({ ...filtro, categoria: e.target.value })} aria-label="Filtrar por categoria"><option value="">Todas as categorias</option>{categorias.map(c => <option key={c}>{c}</option>)}</select>
          {instrumentos.length > 0 && <select className={`${campo} md:max-w-[12rem]`} value={filtro.instrumento} onChange={e => setFiltro({ ...filtro, instrumento: e.target.value })} aria-label="Filtrar por instrumento"><option value="">Todos os instrumentos</option>{instrumentos.map(c => <option key={c}>{c}</option>)}</select>}
          <select className={`${campo} md:max-w-[10rem]`} value={filtro.tipo} onChange={e => setFiltro({ ...filtro, tipo: e.target.value })} aria-label="Filtrar por tipo"><option value="">Todos os tipos</option>{Object.entries(ROTULO_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      )}

      {carregando ? (
        <div className="grid gap-3 md:grid-cols-2 animate-pulse" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-3xl bg-gray-800/60" />)}</div>
      ) : disponivel && materiais.length === 0 ? (
        <div className="flex flex-col items-center gap-3 opacity-60 py-16 text-center">
          <FolderOpen className="w-12 h-12 text-gray-600" />
          <p className="text-gray-300 font-bold">Nenhum material ainda</p>
          <p className="text-sm text-gray-500 max-w-sm">Adicione um PDF, uma partitura, um áudio ou um link do YouTube e compartilhe com seus alunos.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.map(m => (
            <div key={m.id} className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-700 flex items-center justify-center shrink-0">
                  {m.kind === "arquivo" ? <FileText className="w-5 h-5 text-amber-500" /> : m.kind === "youtube" ? <Play className="w-5 h-5 text-red-400" /> : <Link2 className="w-5 h-5 text-sky-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-white break-words">{m.title}</p>
                  <p className="text-xs text-gray-500 break-words">{[ROTULO_TIPO[m.kind], m.category, m.instrument, m.level, formatarTamanho(m.size_bytes)].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
              {m.description && <p className="text-xs text-gray-400 break-words line-clamp-2">{m.description}</p>}
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                {m.alunos === 0 ? "Privado (só você)" : `Compartilhado com ${m.alunos} ${m.alunos === 1 ? "aluno" : "alunos"}`}{m.aulas > 0 ? ` · usado em ${m.aulas} ${m.aulas === 1 ? "aula" : "aulas"}` : ""}
              </p>
              <div className="flex items-center gap-1 mt-auto">
                <button onClick={() => abrir(m.id)} className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-[10px] font-black uppercase tracking-widest">Abrir</button>
                <button onClick={() => abrirCompartilhar(m)} className={btnIcone} aria-label={`Compartilhar ${m.title}`}><Share2 className="w-4 h-4" /></button>
                <button onClick={() => setEditando({ id: m.id, kind: m.kind, f: { title: m.title, category: m.category ?? "", instrument: m.instrument ?? "", level: m.level ?? "", content_tag: m.content_tag ?? "", description: m.description ?? "", url: m.url ?? "" } })} className={btnIcone} aria-label={`Editar ${m.title}`}><Pencil className="w-4 h-4" /></button>
                <button onClick={async () => { if (!window.confirm(`Apagar "${m.title}"? O arquivo e os compartilhamentos serão removidos.`)) return; const r = await apagarMaterial(m.id); if (!r.ok) setErro(r.error); else { setAviso("Material apagado."); await carregar(); } }} className={btnIcone} aria-label={`Apagar ${m.title}`}><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
          {visiveis.length === 0 && <p className="text-sm text-gray-500 col-span-full">Nenhum material nesse filtro.</p>}
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Editar material">
          <form onSubmit={async e => { e.preventDefault(); setSalvando(true); const r = await editarMaterial(editando.id, editando.kind === "arquivo" ? { ...editando.f, url: undefined } : editando.f); setSalvando(false); if (!r.ok) { setErro(r.error); return; } setEditando(null); setAviso("Material atualizado."); await carregar(); }}
            className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between"><h2 className="text-lg font-black text-white">Editar material</h2><button type="button" onClick={() => setEditando(null)} className={btnIcone} aria-label="Fechar"><X className="w-5 h-5" /></button></div>
            <Metadados f={editando.f} setF={f => setEditando({ ...editando, f })} comUrl={editando.kind !== "arquivo"} />
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setEditando(null)} className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white">Cancelar</button><button type="submit" disabled={salvando} className="px-6 py-3 rounded-2xl bg-amber-500 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-40">Salvar</button></div>
          </form>
        </div>
      )}

      {compartilhando && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Compartilhar material">
          <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-black text-white">Quem pode ver</h2><p className="text-xs text-gray-500 break-words">{compartilhando.titulo}. Sem ninguém marcado, o material fica privado.</p></div>
              <button onClick={() => setCompartilhando(null)} className={btnIcone} aria-label="Fechar"><X className="w-5 h-5" /></button>
            </div>
            {students.length === 0 ? <p className="text-sm text-gray-500">Você ainda não tem alunos.</p> : (
              <ul className="divide-y divide-gray-800">
                {students.map(a => (
                  <li key={a.id}><label className="flex items-center gap-3 py-2.5 cursor-pointer">
                    <input type="checkbox" className="accent-amber-500" checked={compartilhando.escolhidos.has(a.id)}
                      onChange={() => setCompartilhando(c => { if (!c) return c; const n = new Set(c.escolhidos); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return { ...c, escolhidos: n }; })} />
                    <span className="text-sm text-white">{a.name}</span><span className="text-xs text-gray-500">{a.instrument}{a.status === "inativo" ? " · inativo" : ""}</span>
                  </label></li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setCompartilhando(null)} className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white">Cancelar</button>
              <button disabled={salvando} onClick={async () => { setSalvando(true); const r = await definirCompartilhamento(compartilhando.id, [...compartilhando.escolhidos]); setSalvando(false); if (!r.ok) { setErro(r.error); return; } setCompartilhando(null); setAviso(r.total === 0 ? "Material privado (ninguém tem acesso)." : `Material compartilhado com ${r.total} ${r.total === 1 ? "aluno" : "alunos"}.`); await carregar(); }}
                className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-40">{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
