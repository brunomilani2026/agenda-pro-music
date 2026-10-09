// Diário de aula e anotações (etapa 2 da Gestão 360° do aluno).
//
// Módulo puro (sem 'use server', sem Supabase): define os campos, os limites e a
// validação, para o servidor e a tela concordarem e para dar para testar.

export const MAX_CAMPO = 5000;

export const CAMPOS_TEXTO = [
  { k: 'content_worked', label: 'Conteúdo trabalhado', dica: 'O que foi estudado nesta aula' },
  { k: 'objectives', label: 'Objetivos da aula', dica: 'O que se queria alcançar' },
  { k: 'exercises', label: 'Exercícios realizados', dica: 'Escalas, trechos, músicas...' },
  { k: 'difficulties', label: 'Dificuldades observadas', dica: 'Onde o aluno travou' },
  { k: 'progress', label: 'Evolução percebida', dica: 'O que melhorou' },
  { k: 'homework', label: 'Atividades para casa', dica: 'O que praticar até a próxima aula' },
  { k: 'next_plan', label: 'Planejado para a próxima aula', dica: 'O que vem depois' },
  { k: 'shared_note', label: 'Nota para o aluno', dica: 'Recado que o aluno poderá ler' },
  { k: 'private_note', label: 'Observação privada (só você vê)', dica: 'Anotações suas, nunca visíveis ao aluno' },
] as const;

export type CampoTexto = (typeof CAMPOS_TEXTO)[number]['k'];

export type RegistroAula = {
  idlesson_fk: string;
  share_with_student: boolean;
  updated_at: string | null;
} & Record<CampoTexto, string | null>;

export type VisibilidadeNota = 'professor_privada' | 'compartilhada' | 'aluno_pessoal';

export const VISIBILIDADE_PROFESSOR: { v: VisibilidadeNota; label: string; ajuda: string }[] = [
  { v: 'professor_privada', label: 'Privada (só você)', ajuda: 'O aluno nunca vê.' },
  { v: 'compartilhada', label: 'Compartilhada com o aluno', ajuda: 'O aluno poderá ler no portal.' },
];

export type NotaAluno = {
  id: string;
  visibility: VisibilidadeNota;
  body: string;
  created_at: string;
  updated_at: string;
};

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

/** Valida e normaliza os campos de um registro de aula. Texto vazio vira null. */
export function limparRegistro(
  bruto: Record<string, unknown>
): Resultado<{ campos: Record<CampoTexto, string | null>; share_with_student: boolean }> {
  const campos = {} as Record<CampoTexto, string | null>;
  let algum = false;
  for (const { k, label } of CAMPOS_TEXTO) {
    const v = bruto[k];
    if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: `Campo inválido: ${label}.` };
    const t = (v ?? '').toString().trim();
    if (t.length > MAX_CAMPO) return { ok: false, error: `"${label}" passou de ${MAX_CAMPO} caracteres.` };
    campos[k] = t === '' ? null : t;
    if (t !== '') algum = true;
  }
  if (!algum) return { ok: false, error: 'Preencha pelo menos um campo.' };
  return { ok: true, valor: { campos, share_with_student: bruto.share_with_student === true } };
}

/** Valida uma anotação escrita pelo PROFESSOR (a pessoal do aluno nunca passa por aqui). */
export function limparNota(visibility: unknown, body: unknown): Resultado<{ visibility: 'professor_privada' | 'compartilhada'; body: string }> {
  if (visibility !== 'professor_privada' && visibility !== 'compartilhada') return { ok: false, error: 'Visibilidade inválida.' };
  if (typeof body !== 'string') return { ok: false, error: 'Escreva a anotação.' };
  const t = body.trim();
  if (!t) return { ok: false, error: 'Escreva a anotação.' };
  if (t.length > MAX_CAMPO) return { ok: false, error: `A anotação passou de ${MAX_CAMPO} caracteres.` };
  return { ok: true, valor: { visibility, body: t } };
}

/** O banco ainda não tem as tabelas da etapa 2 (SQL não aplicado)? */
export function tabelaAusente(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const m = (err.message ?? '').toLowerCase();
  return err.code === '42P01' || err.code === 'PGRST205' || m.includes('does not exist') || m.includes('could not find the table');
}
