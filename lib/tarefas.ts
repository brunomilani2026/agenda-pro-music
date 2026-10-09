// Tarefas e entregas (etapa 5 da Gestão 360° do aluno).
//
// Módulo puro (sem 'use server', sem Supabase): status calculado, validação e caminhos de arquivo.
// O professor só decide uma coisa: concluir (ou reabrir) a tarefa. Todo o resto do status
// (pendente, atrasada, entregue, com retorno) é CALCULADO a partir das entregas e dos retornos.

import { MAX_BYTES, MIMES_PERMITIDOS, formatarTamanho, nomeSeguro, urlSegura } from '@/lib/materiais';

export type StatusTarefa = 'pendente' | 'atrasada' | 'entregue' | 'com_retorno' | 'concluida';

export const ROTULO_STATUS_TAREFA: Record<StatusTarefa, string> = {
  pendente: 'Pendente',
  atrasada: 'Atrasada',
  entregue: 'Entregue, aguardando retorno',
  com_retorno: 'Com retorno do professor',
  concluida: 'Concluída',
};

// Entregas aceitam o mesmo que o bucket 'entregas': sem Word.
export const MIMES_ENTREGA = (MIMES_PERMITIDOS as readonly string[]).filter(m => !m.includes('word'));

export type Tarefa = {
  id: string; idstudent_fk: string; title: string; description: string | null;
  due_date: string | null; status: 'aberta' | 'concluida'; completed_at: string | null; created_at: string;
};
export type Entrega = {
  id: string; task_fk: string; kind: 'arquivo' | 'link'; note: string | null; url: string | null;
  file_name: string | null; mime_type: string | null; size_bytes: number | null;
  feedback: string | null; feedback_at: string | null; created_at: string;
};

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

/**
 * Status de uma tarefa. Regras, em ordem:
 *  1. concluída pelo professor            -> concluida
 *  2. sem nenhuma entrega                 -> atrasada (prazo vencido) ou pendente
 *  3. há retorno mais novo que a última entrega -> com_retorno (o aluno pode entregar de novo)
 *  4. caso contrário                      -> entregue (aguardando o retorno do professor)
 */
export function statusDaTarefa(
  tarefa: { status: string; due_date: string | null },
  entregas: { created_at: string; feedback_at: string | null }[],
  hojeIso: string
): StatusTarefa {
  if (tarefa.status === 'concluida') return 'concluida';
  if (entregas.length === 0) return tarefa.due_date && tarefa.due_date < hojeIso ? 'atrasada' : 'pendente';
  const ultimaEntrega = entregas.reduce((m, e) => (e.created_at > m ? e.created_at : m), '');
  const ultimoRetorno = entregas.reduce((m, e) => (e.feedback_at && e.feedback_at > m ? e.feedback_at : m), '');
  return ultimoRetorno && ultimoRetorno > ultimaEntrega ? 'com_retorno' : 'entregue';
}

const dataReal = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

export function limparTarefa(b: Record<string, unknown>): Resultado<{ title: string; description: string | null; due_date: string | null }> {
  if (typeof b.title !== 'string' || !b.title.trim()) return { ok: false, error: 'Informe o título da tarefa.' };
  const title = b.title.trim();
  if (title.length > 160) return { ok: false, error: 'O título passou de 160 caracteres.' };
  if (b.description !== undefined && b.description !== null && typeof b.description !== 'string') return { ok: false, error: 'Descrição inválida.' };
  const description = (b.description ?? '').toString().trim();
  if (description.length > 5000) return { ok: false, error: 'A descrição passou de 5000 caracteres.' };
  let due: string | null = null;
  if (b.due_date !== undefined && b.due_date !== null && b.due_date !== '') {
    if (typeof b.due_date !== 'string' || !dataReal(b.due_date)) return { ok: false, error: 'Prazo inválido.' };
    due = b.due_date;
  }
  return { ok: true, valor: { title, description: description || null, due_date: due } };
}

function textoOpcional(v: unknown, rotulo: string): Resultado<string | null> {
  if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: `${rotulo} inválida.` };
  const t = (v ?? '').toString().trim();
  if (t.length > 5000) return { ok: false, error: `${rotulo} passou de 5000 caracteres.` };
  return { ok: true, valor: t || null };
}

export function limparRetorno(v: unknown): Resultado<string> {
  const r = textoOpcional(v, 'O retorno');
  if (!r.ok) return r;
  if (r.valor === null) return { ok: false, error: 'Escreva o retorno para o aluno.' };
  return { ok: true, valor: r.valor };
}

export function limparEntregaLink(url: unknown, note: unknown): Resultado<{ url: string; note: string | null }> {
  const u = urlSegura(url); if (!u.ok) return u;
  const n = textoOpcional(note, 'A observação'); if (!n.ok) return n;
  return { ok: true, valor: { url: u.valor, note: n.valor } };
}

export function validarArquivoEntrega(a: { nome: unknown; mime: unknown; tamanho: unknown }): Resultado<{ nome: string; mime: string; tamanho: number }> {
  if (typeof a.nome !== 'string' || !a.nome.trim()) return { ok: false, error: 'Arquivo sem nome.' };
  if (typeof a.mime !== 'string' || !MIMES_ENTREGA.includes(a.mime)) return { ok: false, error: 'Tipo de arquivo não aceito. Envie áudio, vídeo, imagem, PDF ou texto.' };
  const t = Number(a.tamanho);
  if (!Number.isFinite(t) || t <= 0) return { ok: false, error: 'Arquivo vazio.' };
  if (t > MAX_BYTES) return { ok: false, error: `O arquivo passa de ${formatarTamanho(MAX_BYTES)}.` };
  return { ok: true, valor: { nome: a.nome, mime: a.mime, tamanho: t } };
}

/** <id do professor>/<id do aluno>/<uuid>-<nome>: é o que a regra de acesso do storage confere. */
export function caminhoEntrega(idProfessor: string, idAluno: string, uuid: string, nome: string): string {
  return `${idProfessor}/${idAluno}/${uuid}-${nomeSeguro(nome)}`;
}

/** Ordena para o professor/aluno agirem primeiro no que importa. */
export const PRIORIDADE_STATUS: Record<StatusTarefa, number> = { entregue: 0, atrasada: 1, pendente: 2, com_retorno: 3, concluida: 4 };
