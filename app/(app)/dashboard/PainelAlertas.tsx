"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchPainelAlertas } from "./alertas-actions";
import type { AlertaPainel, CategoriaAlerta, NivelAlerta } from "@/lib/painel-alertas";

const CATEGORIAS: { id: CategoriaAlerta; label: string }[] = [
  { id: "financeiro", label: "Financeiro" },
  { id: "tarefas", label: "Tarefas" },
  { id: "diario", label: "Diário" },
  { id: "reposicao", label: "Reposições" },
  { id: "aulas", label: "Aulas" },
];

const COR: Record<NivelAlerta, string> = {
  perigo: "bg-red-500/10 border-red-500/20 text-red-300",
  aviso: "bg-amber-500/10 border-amber-500/20 text-amber-300",
  info: "bg-gray-800/60 border-gray-700 text-gray-300",
};
const PONTO: Record<NivelAlerta, string> = { perigo: "bg-red-400", aviso: "bg-amber-400", info: "bg-sky-400" };

export default function PainelAlertas() {
  const [alertas, setAlertas] = useState<AlertaPainel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<CategoriaAlerta | "todos">("todos");
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    fetchPainelAlertas().then(r => { if (r.ok) setAlertas(r.alertas); else setErro(r.error); })
      .catch(() => setErro("Não foi possível carregar os alertas."));
  }, []);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: alertas?.length ?? 0 };
    for (const a of alertas ?? []) c[a.categoria] = (c[a.categoria] ?? 0) + 1;
    return c;
  }, [alertas]);

  const visiveis = useMemo(() => (alertas ?? []).filter(a => filtro === "todos" || a.categoria === filtro), [alertas, filtro]);
  const mostrados = aberto ? visiveis : visiveis.slice(0, 8);
  const urgentes = (alertas ?? []).filter(a => a.nivel === "perigo").length;

  return (
    <section className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden" aria-label="Alertas dos alunos">
      <div className="p-5 border-b border-gray-700 bg-gray-800/80 flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-lg font-bold text-white">Atenção</h2>
        {alertas && alertas.length > 0 && (
          <span className="text-xs font-bold text-gray-400">
            {alertas.length} {alertas.length === 1 ? "alerta" : "alertas"}{urgentes > 0 && <span className="text-red-400"> · {urgentes} {urgentes === 1 ? "urgente" : "urgentes"}</span>}
          </span>
        )}
      </div>
      <div className="p-5 space-y-4">
        {erro ? <p role="alert" className="text-sm text-red-400">{erro}</p>
          : !alertas ? <p className="text-sm text-gray-500">Verificando seus alunos…</p>
          : alertas.length === 0 ? <p className="text-sm text-green-400 font-medium">Tudo em dia: nenhum aluno precisa de atenção agora.</p>
          : (
            <>
              <div className="flex flex-wrap gap-2">
                {[{ id: "todos" as const, label: "Todos" }, ...CATEGORIAS.filter(c => contagem[c.id])].map(c => (
                  <button key={c.id} type="button" onClick={() => { setFiltro(c.id); setAberto(false); }}
                    className={`px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${filtro === c.id ? "bg-amber-500 text-gray-900 border-amber-500" : "border-gray-700 text-gray-400 hover:text-white"}`}>
                    {c.label} ({contagem[c.id] ?? 0})
                  </button>
                ))}
              </div>
              <ul className="space-y-2">
                {mostrados.map((a, i) => (
                  <li key={`${a.alunoId}-${i}`}>
                    <Link href={`/alunos/${a.alunoId}`} className={`flex items-start gap-3 rounded-xl border px-4 py-3 hover:brightness-125 transition ${COR[a.nivel]}`}>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PONTO[a.nivel]}`} aria-hidden="true" />
                      <span className="text-sm min-w-0 break-words"><strong className="text-white">{a.aluno}</strong> — {a.texto}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {visiveis.length > 8 && (
                <button type="button" onClick={() => setAberto(v => !v)} className="text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400">
                  {aberto ? "Mostrar menos" : `Ver todos (${visiveis.length})`}
                </button>
              )}
            </>
          )}
      </div>
    </section>
  );
}
