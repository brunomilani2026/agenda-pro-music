"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { fetchTarefasParaAcao, type TarefaParaAcao } from "../alunos/[id]/tarefas-actions";
import { ROTULO_STATUS_TAREFA } from "@/lib/tarefas";

const fmtData = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export default function TarefasVisaoGeralPage() {
  const [tarefas, setTarefas] = useState<TarefaParaAcao[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchTarefasParaAcao().then(r => {
      if (r.ok) { setDisponivel(r.disponivel); setTarefas(r.tarefas); } else setErro(r.error);
    }).catch(() => setErro("Não foi possível carregar as tarefas.")).finally(() => setCarregando(false));
  }, []);

  const entregues = useMemo(() => tarefas.filter(t => t.estado === "entregue"), [tarefas]);
  const atrasadas = useMemo(() => tarefas.filter(t => t.estado === "atrasada").sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")), [tarefas]);

  const Lista = ({ itens, vazio }: { itens: TarefaParaAcao[]; vazio: string }) => itens.length === 0 ? <p className="text-sm text-gray-500">{vazio}</p> : (
    <ul className="divide-y divide-gray-800">
      {itens.map(t => (
        <li key={t.id} className="py-3">
          <Link href={`/alunos/${t.idstudent_fk}`} className="flex items-start gap-3 hover:opacity-90">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white break-words">{t.title}</p>
              <p className="text-xs text-gray-500">{t.aluno}{t.due_date ? ` · prazo ${fmtData(t.due_date)}` : ""}{t.entregas.length ? ` · ${t.entregas.length} ${t.entregas.length === 1 ? "entrega" : "entregas"}` : ""}</p>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 shrink-0">{ROTULO_STATUS_TAREFA[t.estado]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col w-full h-full bg-gray-900 p-4 md:p-8 rounded-tl-[2rem] animate-fade-in gap-6 overflow-y-auto">
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter italic uppercase">Minhas <span className="text-amber-500">Tarefas</span></h1>
        <p className="text-gray-500 text-sm mt-1 font-medium">O que pede a sua atenção agora. Para criar uma tarefa, abra a ficha do aluno e vá na aba Tarefas.</p>
      </div>
      {erro && <p role="alert" className="text-sm text-red-400 font-medium">{erro}</p>}
      {carregando ? (
        <div className="space-y-3 animate-pulse" aria-busy="true"><div className="h-32 rounded-3xl bg-gray-800/60" /><div className="h-32 rounded-3xl bg-gray-800/60" /></div>
      ) : !disponivel ? (
        <div className="rounded-3xl border border-gray-800 bg-gray-800/40 p-6 text-sm text-gray-400">As tarefas ainda não foram ativadas no banco.</div>
      ) : tarefas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 opacity-60 py-16 text-center">
          <ClipboardList className="w-12 h-12 text-gray-600" />
          <p className="text-gray-300 font-bold">Nada pedindo ação agora</p>
          <p className="text-sm text-gray-500 max-w-sm">Quando um aluno entregar uma tarefa, ou quando uma passar do prazo, aparece aqui.</p>
        </div>
      ) : (
        <>
          <section className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-sky-400 mb-3">Entregues, aguardando seu retorno ({entregues.length})</h2>
            <Lista itens={entregues} vazio="Nenhuma entrega aguardando retorno." />
          </section>
          <section className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-red-400 mb-3">Atrasadas ({atrasadas.length})</h2>
            <Lista itens={atrasadas} vazio="Nenhuma tarefa atrasada." />
          </section>
        </>
      )}
    </div>
  );
}
