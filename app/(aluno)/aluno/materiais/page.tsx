"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, FolderOpen, Link2, Play } from "lucide-react";
import { enderecoMeuMaterial, fetchMeusMateriais, type MaterialDoAluno } from "../portal-actions";
import { filtrarMateriais, formatarTamanho, valoresDistintos } from "@/lib/materiais";

const ROTULO_TIPO: Record<string, string> = { arquivo: "Arquivo", link: "Link", youtube: "YouTube" };

export default function MeusMateriaisPage() {
  const [materiais, setMateriais] = useState<MaterialDoAluno[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("");

  useEffect(() => {
    fetchMeusMateriais().then(r => {
      if (r.ok) { setDisponivel(r.disponivel); setMateriais(r.materiais); } else setErro(r.error);
    }).catch(() => setErro("Não foi possível carregar seus materiais.")).finally(() => setCarregando(false));
  }, []);

  const categorias = useMemo(() => valoresDistintos(materiais.map(m => m.category)), [materiais]);
  const visiveis = useMemo(() => filtrarMateriais(materiais, { texto, categoria }), [materiais, texto, categoria]);

  const abrir = async (id: string) => {
    const janela = window.open("", "_blank");
    const r = await enderecoMeuMaterial(id);
    if (!r.ok) { janela?.close(); setErro(r.error); return; }
    setErro(null);
    if (janela) { janela.opener = null; janela.location.href = r.url; } else window.location.href = r.url;
  };

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Materiais</h1>
        <p className="text-sm text-gray-500 mt-1">Partituras, exercícios, áudios e links que o seu professor compartilhou com você.</p>
      </div>

      {erro && <p role="alert" className="text-sm text-red-400 font-medium">{erro}</p>}

      {!carregando && materiais.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar..." aria-label="Buscar materiais" className="bg-gray-800/60 border border-gray-700 focus:border-amber-500 focus:outline-none rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 w-full md:max-w-xs" />
          {categorias.length > 0 && (
            <select value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Filtrar por categoria" className="bg-gray-800/60 border border-gray-700 rounded-2xl px-4 py-2.5 text-sm text-white">
              <option value="">Todas as categorias</option>{categorias.map(c => <option key={c}>{c}</option>)}
            </select>
          )}
        </div>
      )}

      {carregando ? (
        <div className="grid gap-3 md:grid-cols-2 animate-pulse" aria-busy="true">{[0, 1].map(i => <div key={i} className="h-28 rounded-3xl bg-gray-800/60" />)}</div>
      ) : !disponivel || materiais.length === 0 ? (
        <div className="flex flex-col items-center gap-3 opacity-60 py-16 text-center">
          <FolderOpen className="w-12 h-12 text-gray-600" />
          <p className="text-gray-300 font-bold">Nenhum material por enquanto</p>
          <p className="text-sm text-gray-500 max-w-sm">Quando o seu professor compartilhar algo com você, aparece aqui.</p>
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
                  <p className="text-xs text-gray-500 break-words">{[ROTULO_TIPO[m.kind], m.category, m.level, formatarTamanho(m.size_bytes)].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
              {m.description && <p className="text-xs text-gray-400 break-words">{m.description}</p>}
              <button onClick={() => abrir(m.id)} className="mt-auto self-start px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-[10px] font-black uppercase tracking-widest">Abrir</button>
            </div>
          ))}
          {visiveis.length === 0 && <p className="text-sm text-gray-500 col-span-full">Nenhum material nesse filtro.</p>}
        </div>
      )}
    </div>
  );
}
