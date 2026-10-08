"use client";

// Ordenação por coluna compartilhada entre /financeiro e /alunos. As duas telas
// mostram a mesma lista em tabela (desktop) e em cards (mobile) — ambas precisam
// consumir o MESMO array ordenado, senão a ordem muda conforme o tamanho da tela.

import { useCallback, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/**
 * Valor comparável de uma linha. `string` compara com localeCompare pt-BR
 * (acento e maiúscula não bagunçam a ordem); `number` compara numericamente.
 * Datas ISO (YYYY-MM-DD) podem ir como string — a ordem alfabética delas já é
 * cronológica. Situação/status devem virar `number` de prioridade, para que
 * "Atrasado" venha antes de "Recebido" em vez de sair em ordem alfabética.
 */
export type SortValue = string | number;

// Um Collator só, reutilizado em todas as comparações. `a.localeCompare(b, locale,
// opts)` constrói um Intl.Collator NOVO a cada chamada — e um sort faz O(n log n)
// chamadas: com algumas centenas de linhas isso passava de dezenas de ms por
// reordenação. A ordem é a mesma (localeCompare usa um Collator com os mesmos
// argumentos).
const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base" });

// `NoInfer` no `initial`: sem isso o TypeScript deduzia K só da chave inicial
// ("date"), e as demais colunas do `accessors` viravam erro de tipo.
export function useSortableRows<T, K extends string>(
  rows: T[],
  initial: SortState<NoInfer<K>>,
  accessors: Record<K, (row: T) => SortValue>
) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const toggle = useCallback((key: K) => {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        // Coluna nova começa ascendente, exceto data/valor, onde o mais útil é
        // o maior primeiro. Quem chama define isso pelo `initial`, então aqui
        // mantemos a regra simples e previsível.
        : { key, dir: "asc" }
    );
  }, []);

  const sorted = useMemo(() => {
    const get = accessors[sort.key];
    if (!get) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    // Chave de cada linha calculada UMA vez (antes o accessor rodava duas vezes
    // por comparação). Cópia: Array.prototype.sort é in-place e `rows` vem do
    // contexto. O sort é estável, então empates mantêm a ordem original.
    const keyed = rows.map(row => ({ row, value: get(row) }));
    keyed.sort((a, b) => {
      const va = a.value;
      const vb = b.value;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
      return COLLATOR.compare(String(va), String(vb)) * factor;
    });
    return keyed.map(k => k.row);
    // `accessors` costuma ser recriado a cada render; as funções são puras e
    // dependem só da linha, então não entra nas dependências de propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  return { sorted, sort, toggle };
}

/**
 * Cabeçalho clicável. `className` substitui inteiramente o estilo do `<th>` —
 * as duas telas têm tipografia de cabeçalho diferente, e o botão herda fonte,
 * caixa e espaçamento do `<th>` (preflight do Tailwind zera o estilo próprio do
 * button), então o visual continua idêntico ao `<th>` que existia antes.
 */
export function SortableTh<K extends string>({
  columnKey,
  sort,
  onSort,
  children,
  className = "px-6 py-4 font-bold",
}: {
  columnKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = sort.key === columnKey;
  return (
    <th
      className={className}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`inline-flex items-center gap-1.5 transition-colors hover:text-amber-500 ${
          active ? "text-amber-500" : ""
        }`}
        title="Ordenar por esta coluna"
      >
        {children}
        <span aria-hidden className={`text-[9px] leading-none ${active ? "opacity-100" : "opacity-30"}`}>
          {active && sort.dir === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}
