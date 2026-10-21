import { ExternalLink } from "lucide-react";
import { dividirDescricao, rotuloDoLink } from "@/lib/tarefa-link";

/** Descrição da tarefa: o texto e, abaixo, cada link como botão clicável (abre em nova aba). */
export default function DescricaoComLinks({ descricao, className = "" }: { descricao: string | null | undefined; className?: string }) {
  const { texto, links } = dividirDescricao(descricao);
  if (!texto && links.length === 0) return null;
  return (
    <div className={className}>
      {texto && <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{texto}</p>}
      {links.length > 0 && (
        <div className={`${texto ? "mt-2 " : ""}flex flex-wrap gap-2`}>
          {links.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-[11px] font-black uppercase tracking-widest">
              <ExternalLink className="w-3.5 h-3.5" />{rotuloDoLink(u, i, links.length)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
