"use client";

import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { fetchMeusEstudos } from "../portal-actions";
import { agruparPlano, calcularEvolucao, ROTULO_DIFICULDADE, ROTULO_STATUS, type ItemAluno } from "@/lib/estudos";

const COR_STATUS: Record<string, string> = {
  nao_iniciado: "bg-gray-700/40 text-gray-300 border-gray-600/40",
  planejado: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  em_andamento: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  em_revisao: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  concluido: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function MeusEstudosPage() {
  const [itens, setItens] = useState<ItemAluno[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchMeusEstudos().then(r => {
      if (r.ok) { setDisponivel(r.disponivel); setItens(r.itens); } else setErro(r.error);
    }).catch(() => setErro("Não foi possível carregar seu plano de estudos.")).finally(() => setCarregando(false));
  }, []);

  const grupos = useMemo(() => agruparPlano(itens), [itens]);
  const evolucao = useMemo(() => calcularEvolucao(itens), [itens]);

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Meus estudos</h1>
        <p className="text-sm text-gray-500 mt-1">O plano de estudos montado pelo seu professor e o quanto você já avançou.</p>
      </div>

      {erro && <p role="alert" className="text-sm text-red-400 font-medium">{erro}</p>}

      {carregando ? (
        <div className="space-y-3 animate-pulse" aria-busy="true"><div className="h-24 rounded-3xl bg-gray-800/60" /><div className="h-48 rounded-3xl bg-gray-800/60" /></div>
      ) : !disponivel || itens.length === 0 ? (
        <div className="flex flex-col items-center gap-3 opacity-60 py-16 text-center">
          <ListChecks className="w-12 h-12 text-gray-600" />
          <p className="text-gray-300 font-bold">Seu plano de estudos ainda não foi montado</p>
          <p className="text-sm text-gray-500 max-w-sm">Quando o seu professor aplicar uma trilha, ela aparece aqui.</p>
        </div>
      ) : (
        <>
          <section className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5 space-y-4">
            <div>
              <div className="flex justify-between text-sm"><span className="text-white font-bold">Evolução geral</span><span className="text-gray-400">{evolucao.concluidos} de {evolucao.total} · {evolucao.percentual}%</span></div>
              <div className="mt-1.5 h-2.5 rounded-full bg-gray-800" role="progressbar" aria-valuenow={evolucao.percentual} aria-valuemin={0} aria-valuemax={100} aria-label="Evolução geral"><div className="h-2.5 rounded-full bg-amber-500" style={{ width: `${evolucao.percentual}%` }} /></div>
            </div>
            {evolucao.porCompetencia.length > 1 && evolucao.porCompetencia.map(c => (
              <div key={c.nome}>
                <div className="flex justify-between text-xs"><span className="text-gray-300">{c.nome}</span><span className="text-gray-500">{c.concluidos}/{c.total} · {c.percentual}%</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-800" role="progressbar" aria-valuenow={c.percentual} aria-valuemin={0} aria-valuemax={100} aria-label={`Evolução em ${c.nome}`}><div className="h-1.5 rounded-full bg-sky-400" style={{ width: `${c.percentual}%` }} /></div>
              </div>
            ))}
            <p className="text-xs text-gray-500">{evolucao.emAndamento} em andamento · {evolucao.emRevisao} em revisão · {evolucao.planejados} planejados · {evolucao.naoIniciados} ainda não iniciados</p>
          </section>

          {grupos.map(g => (
            <section key={g.track_name} className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5">
              <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">{g.track_name} <span className="text-gray-600">({g.concluidos}/{g.total})</span></h2>
              <div className="space-y-5">
                {g.modulos.map(m => (
                  <div key={m.module_title}>
                    <h3 className="text-xs font-black uppercase tracking-widest text-amber-500 mb-1">{m.module_title}</h3>
                    <ul className="divide-y divide-gray-800">
                      {m.itens.map(it => (
                        <li key={it.id} className="py-2.5 flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-bold break-words ${it.status === "concluido" ? "text-gray-500 line-through" : "text-white"}`}>{it.title}</p>
                            <p className="text-xs text-gray-500 break-words">{ROTULO_DIFICULDADE[it.difficulty]}{it.competency ? ` · ${it.competency}` : ""}{it.objective ? ` · ${it.objective}` : ""}</p>
                          </div>
                          <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${COR_STATUS[it.status] ?? COR_STATUS.nao_iniciado}`}>{ROTULO_STATUS[it.status] ?? it.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
