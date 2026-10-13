"use client";

import { useEffect, useState } from "react";
import { fetchOpcoesNovaTarefa, criarTarefaEmLote, type AlunoParaTarefa } from "./lote-actions";
import GravadorAudio from "@/components/GravadorAudio";
import { enviarAudioComoMaterial } from "@/lib/enviar-audio-material";
import { anexarTexto } from "@/lib/gravacao";

const fmtData = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const campo = "w-full bg-gray-800/60 border border-gray-700 focus:border-amber-500 focus:outline-none rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600";
const opcao = "flex items-center gap-2 text-sm text-gray-200 cursor-pointer";

export default function NovaTarefaLote({ onCriada, onFechar }: { onCriada: (msg: string) => void; onFechar: () => void }) {
  const [alunos, setAlunos] = useState<AlunoParaTarefa[]>([]);
  const [biblioteca, setBiblioteca] = useState<{ id: string; title: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [modo, setModo] = useState<"proxima" | "data" | "nenhum">("proxima");
  const [data, setData] = useState("");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [materiais, setMateriais] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [audio, setAudio] = useState<File | null>(null);
  const [audioId, setAudioId] = useState<string | null>(null);

  useEffect(() => {
    fetchOpcoesNovaTarefa().then(r => {
      if (r.ok) { setAlunos(r.alunos); setBiblioteca(r.biblioteca); } else setErro(r.error);
    }).catch(() => setErro("Não foi possível carregar os alunos.")).finally(() => setCarregando(false));
  }, []);

  const alternar = (set: Set<string>, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n; };
  const semAulaEntreEscolhidos = alunos.filter(a => escolhidos.has(a.id) && !a.proxima).length;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (escolhidos.size === 0) { setErro("Escolha pelo menos um aluno."); return; }
    setSalvando(true);
    let ids = [...materiais];
    if (audio) {
      let id = audioId;
      if (!id) {
        const up = await enviarAudioComoMaterial(audio, titulo);
        if (!up.ok) { setErro(up.error); setSalvando(false); return; }
        id = up.id; setAudioId(id);
      }
      ids = [...ids, id];
    }
    const r = await criarTarefaEmLote([...escolhidos], { title: titulo, description: descricao, modo, due_date: data }, ids);
    setSalvando(false);
    if (!r.ok) { setErro(r.error); return; }
    onCriada(`Tarefa criada para ${r.criadas} ${r.criadas === 1 ? "aluno" : "alunos"}.${r.semAula ? ` ${r.semAula} ${r.semAula === 1 ? "aluno não tem" : "alunos não têm"} aula agendada e ficou sem prazo.` : ""}`);
  };

  return (
    <form onSubmit={enviar} className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5 grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">Nova tarefa para vários alunos</h2>
        <button type="button" onClick={onFechar} className="text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white">Fechar</button>
      </div>

      <input className={`${campo} md:col-span-2`} placeholder="Título da tarefa (ex.: Gravar a batida de samba)" value={titulo} maxLength={160} onChange={e => setTitulo(e.target.value)} aria-label="Título da tarefa" required />
      <textarea className={`${campo} md:col-span-2`} rows={3} placeholder="Descrição: o que o aluno deve fazer" value={descricao} maxLength={5000} onChange={e => setDescricao(e.target.value)} aria-label="Descrição" />

      <div className="md:col-span-2">
        <GravadorAudio onAudio={a => { setAudio(a); setAudioId(null); }} onTranscricao={t => setDescricao(d => anexarTexto(d, t))} />
      </div>

      <fieldset className="rounded-2xl border border-gray-800 p-3 space-y-2">
        <legend className="px-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Prazo sugerido</legend>
        <label className={opcao}><input type="radio" name="prazo-lote" className="accent-amber-500" checked={modo === "proxima"} onChange={() => setModo("proxima")} /><span>Até a próxima aula <strong className="text-white">de cada aluno</strong></span></label>
        <label className={opcao}>
          <input type="radio" name="prazo-lote" className="accent-amber-500" checked={modo === "data"} onChange={() => setModo("data")} /><span>Mesma data para todos</span>
          {modo === "data" && <input type="date" className="bg-gray-800/60 border border-gray-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-1.5 text-sm text-white" value={data} onChange={e => setData(e.target.value)} aria-label="Data do prazo" />}
        </label>
        <label className={opcao}><input type="radio" name="prazo-lote" className="accent-amber-500" checked={modo === "nenhum"} onChange={() => setModo("nenhum")} /><span>Sem prazo</span></label>
        {modo === "proxima" && semAulaEntreEscolhidos > 0 && <p className="text-xs text-amber-400">{semAulaEntreEscolhidos} {semAulaEntreEscolhidos === 1 ? "aluno escolhido não tem" : "alunos escolhidos não têm"} aula agendada e ficará sem prazo.</p>}
      </fieldset>

      {biblioteca.length > 0 && (
        <fieldset className="rounded-2xl border border-gray-800 p-3">
          <legend className="px-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Material de apoio (opcional)</legend>
          <ul className="max-h-40 overflow-y-auto divide-y divide-gray-800">
            {biblioteca.map(m => (
              <li key={m.id}><label className="flex items-center gap-3 py-1.5 cursor-pointer"><input type="checkbox" className="accent-amber-500" checked={materiais.has(m.id)} onChange={() => setMateriais(s => alternar(s, m.id))} /><span className="text-sm text-white break-words">{m.title}</span></label></li>
            ))}
          </ul>
        </fieldset>
      )}

      <fieldset className="rounded-2xl border border-gray-800 p-3 md:col-span-2">
        <legend className="px-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Alunos ({escolhidos.size} escolhidos)</legend>
        {carregando ? <p className="text-sm text-gray-500">Carregando…</p> : alunos.length === 0 ? <p className="text-sm text-gray-500">Você não tem alunos ativos.</p> : (
          <>
            <button type="button" onClick={() => setEscolhidos(escolhidos.size === alunos.length ? new Set() : new Set(alunos.map(a => a.id)))} className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1">{escolhidos.size === alunos.length ? "Desmarcar todos" : "Marcar todos"}</button>
            <ul className="max-h-60 overflow-y-auto divide-y divide-gray-800">
              {alunos.map(a => (
                <li key={a.id}><label className="flex items-center gap-3 py-2 cursor-pointer">
                  <input type="checkbox" className="accent-amber-500" checked={escolhidos.has(a.id)} onChange={() => setEscolhidos(s => alternar(s, a.id))} />
                  <span className="text-sm text-white flex-1 min-w-0 break-words">{a.name}<span className="text-xs text-gray-500"> {a.instrument}</span></span>
                  <span className="text-xs text-gray-500 shrink-0">{a.proxima ? `próxima aula ${fmtData(a.proxima.date)}` : "sem aula agendada"}</span>
                </label></li>
              ))}
            </ul>
          </>
        )}
      </fieldset>

      {erro && <p role="alert" className="md:col-span-2 text-sm text-red-400 font-medium">{erro}</p>}
      <div className="md:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onFechar} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white">Cancelar</button>
        <button type="submit" disabled={salvando || !titulo.trim() || escolhidos.size === 0} className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-40">{salvando ? "Criando…" : `Criar para ${escolhidos.size} ${escolhidos.size === 1 ? "aluno" : "alunos"}`}</button>
      </div>
    </form>
  );
}
