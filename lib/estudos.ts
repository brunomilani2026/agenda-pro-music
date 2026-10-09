// Plano de estudos (etapa 3 da Gestão 360° do aluno).
//
// Módulo puro (sem 'use server', sem Supabase): vocabulário, validação, agrupamento,
// reordenação e o cálculo da evolução. Servidor e tela usam o mesmo código e dá para testar.
//
// A evolução considera OBJETIVOS e COMPETÊNCIAS (quantos conteúdos foram concluídos),
// não a quantidade de aulas dadas.

export const STATUS_ESTUDO = ['nao_iniciado', 'planejado', 'em_andamento', 'em_revisao', 'concluido'] as const;
export type StatusEstudo = (typeof STATUS_ESTUDO)[number];

export const ROTULO_STATUS: Record<StatusEstudo, string> = {
  nao_iniciado: 'Não iniciado',
  planejado: 'Planejado',
  em_andamento: 'Em andamento',
  em_revisao: 'Em revisão',
  concluido: 'Concluído',
};

export const ROTULO_DIFICULDADE: Record<number, string> = { 1: 'Iniciante', 2: 'Intermediário', 3: 'Avançado' };

// Sugestões; a competência é um texto livre (o professor escolhe o nome).
export const SUGESTOES_COMPETENCIA = ['Ritmo', 'Harmonia', 'Leitura', 'Técnica', 'Repertório', 'Teoria', 'Improviso', 'Audição'];

export const MAX_TEXTO = 2000;

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

export type Trilha = { id: string; name: string; description: string | null; instrument: string | null; level: string | null; archived: boolean; created_at: string };
export type ModuloTrilha = { id: string; track_fk: string; title: string; position: number };
export type ItemTrilha = {
  id: string; module_fk: string; track_fk: string; title: string; description: string | null;
  objective: string | null; difficulty: number; competency: string | null; position: number;
};
export type ItemAluno = {
  id: string; source_item_fk: string | null; track_name: string; module_title: string; title: string;
  description: string | null; objective: string | null; difficulty: number; competency: string | null;
  position: number; status: StatusEstudo; status_changed_at: string; created_at: string;
};

const texto = (v: unknown, max: number, rotulo: string): Resultado<string | null> => {
  if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: `Campo inválido: ${rotulo}.` };
  const t = (v ?? '').toString().trim();
  if (t.length > max) return { ok: false, error: `"${rotulo}" passou de ${max} caracteres.` };
  return { ok: true, valor: t === '' ? null : t };
};

const obrigatorio = (v: unknown, max: number, rotulo: string): Resultado<string> => {
  const r = texto(v, max, rotulo);
  if (!r.ok) return r;
  if (r.valor === null) return { ok: false, error: `Informe ${rotulo.toLowerCase()}.` };
  return { ok: true, valor: r.valor };
};

export function limparTrilha(b: Record<string, unknown>): Resultado<{ name: string; description: string | null; instrument: string | null; level: string | null }> {
  const name = obrigatorio(b.name, 120, 'O nome da trilha'); if (!name.ok) return name;
  const description = texto(b.description, MAX_TEXTO, 'Descrição'); if (!description.ok) return description;
  const instrument = texto(b.instrument, 60, 'Instrumento'); if (!instrument.ok) return instrument;
  const level = texto(b.level, 60, 'Nível'); if (!level.ok) return level;
  return { ok: true, valor: { name: name.valor, description: description.valor, instrument: instrument.valor, level: level.valor } };
}

export function limparModulo(title: unknown): Resultado<string> {
  return obrigatorio(title, 120, 'O título do módulo');
}

export function limparItem(b: Record<string, unknown>): Resultado<{ title: string; description: string | null; objective: string | null; difficulty: number; competency: string | null }> {
  const title = obrigatorio(b.title, 160, 'O título do conteúdo'); if (!title.ok) return title;
  const description = texto(b.description, MAX_TEXTO, 'Descrição'); if (!description.ok) return description;
  const objective = texto(b.objective, MAX_TEXTO, 'Objetivo'); if (!objective.ok) return objective;
  const competency = texto(b.competency, 60, 'Competência'); if (!competency.ok) return competency;
  const d = Number(b.difficulty ?? 1);
  if (![1, 2, 3].includes(d)) return { ok: false, error: 'Dificuldade inválida.' };
  return { ok: true, valor: { title: title.valor, description: description.valor, objective: objective.valor, difficulty: d, competency: competency.valor } };
}

export function statusValido(s: unknown): s is StatusEstudo {
  return typeof s === 'string' && (STATUS_ESTUDO as readonly string[]).includes(s);
}

/**
 * Posições dos conteúdos copiados de uma trilha: contínuas ao longo dos módulos
 * (módulo 0 antes do 1...), para que ordenar por posição respeite a ordem da trilha.
 */
export function posicaoNaTrilha(indiceModulo: number, posicaoItem: number): number {
  return indiceModulo * 1000 + posicaoItem;
}

/** Troca a posição de um conteúdo com a do vizinho (dir = -1 sobe, +1 desce). Devolve só o que muda. */
export function reordenar(itens: { id: string; position: number }[], id: string, dir: -1 | 1): { id: string; position: number }[] {
  const ord = [...itens].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const i = ord.findIndex(x => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ord.length) return [];
  // Se as duas posições forem iguais, normaliza para a troca fazer efeito.
  const pi = ord[i].position, pj = ord[j].position;
  if (pi === pj) return [{ id: ord[i].id, position: dir === -1 ? pj - 1 : pj + 1 }];
  return [{ id: ord[i].id, position: pj }, { id: ord[j].id, position: pi }];
}

export type GrupoModulo = { module_title: string; itens: ItemAluno[] };
export type GrupoTrilha = { track_name: string; modulos: GrupoModulo[]; total: number; concluidos: number };

/** Agrupa o plano do aluno: trilhas (por ordem de aplicação) > módulos (por posição) > conteúdos. */
export function agruparPlano(itens: ItemAluno[]): GrupoTrilha[] {
  const trilhas = new Map<string, ItemAluno[]>();
  for (const it of itens) {
    const l = trilhas.get(it.track_name) ?? [];
    l.push(it);
    trilhas.set(it.track_name, l);
  }
  const grupos: GrupoTrilha[] = [];
  for (const [track_name, lista] of trilhas) {
    const modulos = new Map<string, ItemAluno[]>();
    for (const it of [...lista].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))) {
      const l = modulos.get(it.module_title) ?? [];
      l.push(it);
      modulos.set(it.module_title, l);
    }
    grupos.push({
      track_name,
      modulos: [...modulos].map(([module_title, itens]) => ({ module_title, itens })),
      total: lista.length,
      concluidos: lista.filter(i => i.status === 'concluido').length,
    });
  }
  return grupos.sort((a, b) => {
    const ca = Math.min(...(trilhas.get(a.track_name) ?? []).map(i => Date.parse(i.created_at) || 0));
    const cb = Math.min(...(trilhas.get(b.track_name) ?? []).map(i => Date.parse(i.created_at) || 0));
    return ca - cb;
  });
}

export type Evolucao = {
  total: number; concluidos: number; emAndamento: number; emRevisao: number; planejados: number; naoIniciados: number;
  percentual: number;
  porCompetencia: { nome: string; total: number; concluidos: number; percentual: number }[];
};

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

/** Evolução do aluno: conteúdos concluídos sobre o total, no geral e por competência. */
export function calcularEvolucao(itens: { status: string; competency: string | null }[]): Evolucao {
  const conta = (s: StatusEstudo) => itens.filter(i => i.status === s).length;
  const por = new Map<string, { total: number; concluidos: number }>();
  for (const i of itens) {
    const nome = (i.competency ?? '').trim() || 'Sem competência';
    const c = por.get(nome) ?? { total: 0, concluidos: 0 };
    c.total++;
    if (i.status === 'concluido') c.concluidos++;
    por.set(nome, c);
  }
  return {
    total: itens.length,
    concluidos: conta('concluido'),
    emAndamento: conta('em_andamento'),
    emRevisao: conta('em_revisao'),
    planejados: conta('planejado'),
    naoIniciados: conta('nao_iniciado'),
    percentual: pct(conta('concluido'), itens.length),
    porCompetencia: [...por]
      .map(([nome, c]) => ({ nome, ...c, percentual: pct(c.concluidos, c.total) }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome)),
  };
}
