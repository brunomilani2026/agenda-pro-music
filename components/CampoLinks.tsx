"use client";

import { Link2, Plus, X } from "lucide-react";

const campo = "flex-1 min-w-0 bg-gray-800/60 border border-gray-700 focus:border-amber-500 focus:outline-none rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600";

/** Campo "Links" do professor: um ou mais endereços, cada um vira um botão na tela do aluno. */
export default function CampoLinks({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  const lista = valor.length ? valor : [""];
  const mudar = (i: number, v: string) => onChange(lista.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="rounded-2xl border border-gray-800 p-3 space-y-2">
      <legend className="px-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Links (opcional)</legend>
      {lista.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
          <input
            type="text"
            inputMode="url"
            className={campo}
            placeholder="Cole o link aqui (YouTube, Drive, cifra…)"
            value={l}
            onChange={e => mudar(i, e.target.value)}
            aria-label={`Link ${i + 1}`}
          />
          {lista.length > 1 && (
            <button type="button" onClick={() => onChange(lista.filter((_, j) => j !== i))} className="p-2 text-gray-500 hover:text-red-400" aria-label={`Remover link ${i + 1}`}><X className="w-4 h-4" /></button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...lista, ""])} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400"><Plus className="w-3.5 h-3.5" />Adicionar outro link</button>
      <p className="text-xs text-gray-500">O aluno vê cada link como um botão para clicar.</p>
    </fieldset>
  );
}
