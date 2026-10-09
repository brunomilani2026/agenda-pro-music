// Biblioteca de materiais (etapa 4 da Gestão 360° do aluno).
//
// Módulo puro (sem 'use server', sem Supabase): regras de arquivo, link e YouTube,
// validação e filtros. Servidor e tela usam o mesmo código e dá para testar.

export const MAX_BYTES = 52_428_800; // 50 MB (igual ao limite do bucket)

// Mesma lista do bucket 'materials' (supabase-novo/05-biblioteca-de-materiais.sql).
export const MIMES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/webm',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

export const CATEGORIAS_SUGERIDAS = ['Partitura', 'Tablatura', 'Cifra', 'Exercício', 'Áudio', 'Vídeo-aula', 'Teoria', 'Repertório', 'Outro'];

export type TipoMaterial = 'arquivo' | 'link' | 'youtube';

export type Material = {
  id: string;
  kind: TipoMaterial;
  title: string;
  description: string | null;
  category: string | null;
  instrument: string | null;
  level: string | null;
  content_tag: string | null;
  url: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

export function formatarTamanho(bytes: number | null | undefined): string {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function validarArquivo(a: { nome: unknown; mime: unknown; tamanho: unknown }): Resultado<{ nome: string; mime: string; tamanho: number }> {
  if (typeof a.nome !== 'string' || !a.nome.trim()) return { ok: false, error: 'Arquivo sem nome.' };
  if (typeof a.mime !== 'string' || !(MIMES_PERMITIDOS as readonly string[]).includes(a.mime)) {
    return { ok: false, error: 'Tipo de arquivo não aceito. Use PDF, imagem, áudio, vídeo, Word ou texto.' };
  }
  const t = Number(a.tamanho);
  if (!Number.isFinite(t) || t <= 0) return { ok: false, error: 'Arquivo vazio.' };
  if (t > MAX_BYTES) return { ok: false, error: `O arquivo passa de ${formatarTamanho(MAX_BYTES)}.` };
  return { ok: true, valor: { nome: a.nome, mime: a.mime, tamanho: t } };
}

/** Nome de arquivo seguro para o caminho no storage: sem pastas, sem acentos nem símbolos. */
export function nomeSeguro(nome: string): string {
  const base = (nome.split(/[\\/]/).pop() ?? 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ponto = base.lastIndexOf('.');
  const ext = ponto > 0 ? base.slice(ponto + 1).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toLowerCase() : '';
  const raiz = (ponto > 0 ? base.slice(0, ponto) : base).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '').slice(0, 70) || 'arquivo';
  return ext ? `${raiz}.${ext}` : raiz;
}

/** Caminho no storage: sempre começa pela pasta do professor (é o que a regra de acesso confere). */
export function caminhoMaterial(idProfessor: string, uuid: string, nome: string): string {
  return `${idProfessor}/${uuid}-${nomeSeguro(nome)}`;
}

/** Só endereços http(s). Rejeita javascript:, data:, etc. */
export function urlSegura(bruto: unknown): Resultado<string> {
  if (typeof bruto !== 'string') return { ok: false, error: 'Informe o endereço do link.' };
  const t = bruto.trim();
  if (!t) return { ok: false, error: 'Informe o endereço do link.' };
  if (t.length > 2000) return { ok: false, error: 'O endereço é longo demais.' };
  let u: URL;
  try { u = new URL(t); } catch { return { ok: false, error: 'Endereço inválido. Comece com https://' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'Só são aceitos links http ou https.' };
  return { ok: true, valor: u.toString() };
}

/** Id do vídeo do YouTube, ou null se o endereço não for do YouTube. */
export function idYoutube(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const valido = (s: string | null | undefined) => (s && /^[A-Za-z0-9_-]{6,20}$/.test(s) ? s : null);
  if (host === 'youtu.be') return valido(u.pathname.slice(1).split('/')[0]);
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') return valido(u.searchParams.get('v'));
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
    if (m) return valido(m[1]);
  }
  return null;
}

export function tipoDoLink(url: string): 'youtube' | 'link' {
  return idYoutube(url) ? 'youtube' : 'link';
}

const texto = (v: unknown, max: number, rotulo: string): Resultado<string | null> => {
  if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: `Campo inválido: ${rotulo}.` };
  const t = (v ?? '').toString().trim();
  if (t.length > max) return { ok: false, error: `"${rotulo}" passou de ${max} caracteres.` };
  return { ok: true, valor: t === '' ? null : t };
};

export type DadosMaterial = { title: string; description: string | null; category: string | null; instrument: string | null; level: string | null; content_tag: string | null };

export function limparMaterial(b: Record<string, unknown>): Resultado<DadosMaterial> {
  const title = texto(b.title, 160, 'Título'); if (!title.ok) return title;
  if (title.valor === null) return { ok: false, error: 'Informe o título do material.' };
  const description = texto(b.description, 2000, 'Descrição'); if (!description.ok) return description;
  const category = texto(b.category, 60, 'Categoria'); if (!category.ok) return category;
  const instrument = texto(b.instrument, 60, 'Instrumento'); if (!instrument.ok) return instrument;
  const level = texto(b.level, 60, 'Nível'); if (!level.ok) return level;
  const content_tag = texto(b.content_tag, 60, 'Conteúdo'); if (!content_tag.ok) return content_tag;
  return { ok: true, valor: { title: title.valor, description: description.valor, category: category.valor, instrument: instrument.valor, level: level.valor, content_tag: content_tag.valor } };
}

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type FiltroMateriais = { texto?: string; instrumento?: string; categoria?: string; tipo?: string };

export function filtrarMateriais<T extends Pick<Material, 'title' | 'description' | 'category' | 'instrument' | 'level' | 'content_tag' | 'kind' | 'file_name'>>(lista: T[], f: FiltroMateriais): T[] {
  const q = norm(f.texto).trim();
  return lista.filter(m => {
    if (f.instrumento && norm(m.instrument) !== norm(f.instrumento)) return false;
    if (f.categoria && norm(m.category) !== norm(f.categoria)) return false;
    if (f.tipo && m.kind !== f.tipo) return false;
    if (!q) return true;
    return [m.title, m.description, m.category, m.instrument, m.level, m.content_tag, m.file_name].some(c => norm(c).includes(q));
  });
}

/** Valores distintos (sem repetir por caixa/acento) para montar as opções dos filtros. */
export function valoresDistintos(valores: (string | null | undefined)[]): string[] {
  const mapa = new Map<string, string>();
  for (const v of valores) { const t = (v ?? '').trim(); if (t && !mapa.has(norm(t))) mapa.set(norm(t), t); }
  return [...mapa.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
