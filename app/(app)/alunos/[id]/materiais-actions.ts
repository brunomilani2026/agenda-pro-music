'use server';

import { alunoDoProfessor, UUID, type Falha } from '@/lib/professor-ctx';
import { tabelaAusente } from '@/lib/diario-aluno';
import { normalizeStudentName } from '@/lib/lesson-cancel-reasons';
import type { Material } from '@/lib/materiais';

const ERRO = 'Não foi possível concluir. Tente de novo.';
const COLUNAS = 'id, kind, title, description, category, instrument, level, content_tag, url, storage_path, file_name, mime_type, size_bytes, created_at';

/** Materiais compartilhados com o aluno + os da biblioteca que ainda não foram. */
export async function fetchMateriaisAluno(idstudent: string): Promise<
  { ok: true; disponivel: boolean; compartilhados: Material[]; biblioteca: Material[] } | Falha
> {
  try {
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;
    const [todos, shares] = await Promise.all([
      supabase.from('material').select(COLUNAS).eq('idusers_fk', dbUser.idusers).order('created_at', { ascending: false }),
      supabase.from('material_share').select('material_fk').eq('idusers_fk', dbUser.idusers).eq('idstudent_fk', idstudent),
    ]);
    if (tabelaAusente(todos.error) || tabelaAusente(shares.error)) return { ok: true, disponivel: false, compartilhados: [], biblioteca: [] };
    if (todos.error || shares.error) { console.error('Materiais do aluno: erro:', (todos.error || shares.error)?.message); return { ok: false, error: 'Não foi possível carregar os materiais.' }; }
    const com = new Set((shares.data ?? []).map(s => s.material_fk as string));
    const lista = (todos.data ?? []) as Material[];
    return { ok: true, disponivel: true, compartilhados: lista.filter(m => com.has(m.id)), biblioteca: lista.filter(m => !com.has(m.id)) };
  } catch (e: any) { console.error('Materiais do aluno: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

export async function compartilharComAluno(idstudent: string, materialId: string): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(materialId)) return { ok: false, error: 'Material não encontrado.' };
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;
    const { data: mat } = await supabase.from('material').select('id').eq('id', materialId).eq('idusers_fk', dbUser.idusers).maybeSingle();
    if (!mat) return { ok: false, error: 'Material não encontrado.' };
    const { error } = await supabase.from('material_share').upsert(
      { material_fk: materialId, idstudent_fk: idstudent, idusers_fk: dbUser.idusers },
      { onConflict: 'material_fk,idstudent_fk', ignoreDuplicates: true }
    );
    if (error) { console.error('Materiais do aluno: erro ao compartilhar:', error.message); return { ok: false, error: ERRO }; }
    return { ok: true };
  } catch (e: any) { console.error('Materiais do aluno: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

export async function retirarDoAluno(idstudent: string, materialId: string): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(materialId)) return { ok: false, error: 'Material não encontrado.' };
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { error } = await ctx.supabase.from('material_share').delete()
      .eq('material_fk', materialId).eq('idstudent_fk', idstudent).eq('idusers_fk', ctx.dbUser.idusers);
    if (error) return { ok: false, error: ERRO };
    return { ok: true };
  } catch (e: any) { console.error('Materiais do aluno: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

/** A aula tem de ser deste professor E deste aluno (por vínculo ou, nas antigas, pelo nome). */
async function aulaDoAluno(ctx: NonNullable<Awaited<ReturnType<typeof alunoDoProfessor>>>, idstudent: string, lessonId: string) {
  if (!UUID.test(lessonId)) return false;
  const { data: aula } = await ctx.supabase.from('lesson').select('idlesson, student_fk, studentname')
    .eq('idlesson', lessonId).eq('idusers_fk', ctx.dbUser.idusers).maybeSingle();
  return !!aula && (aula.student_fk ? aula.student_fk === idstudent : normalizeStudentName(aula.studentname) === normalizeStudentName(ctx.aluno.name));
}

export async function materiaisDaAula(idstudent: string, lessonId: string): Promise<{ ok: true; ids: string[] } | Falha> {
  try {
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    if (!(await aulaDoAluno(ctx, idstudent, lessonId))) return { ok: false, error: 'Essa aula não pertence a este aluno.' };
    const { data, error } = await ctx.supabase.from('lesson_material').select('material_fk').eq('lesson_fk', lessonId).eq('idusers_fk', ctx.dbUser.idusers);
    if (tabelaAusente(error)) return { ok: true, ids: [] };
    if (error) return { ok: false, error: ERRO };
    return { ok: true, ids: (data ?? []).map(r => r.material_fk as string) };
  } catch (e: any) { console.error('Materiais da aula: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

/** Define exatamente quais materiais da biblioteca foram usados nesta aula. */
export async function definirMateriaisDaAula(idstudent: string, lessonId: string, materialIds: string[]): Promise<{ ok: true } | Falha> {
  try {
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    if (!(await aulaDoAluno(ctx, idstudent, lessonId))) return { ok: false, error: 'Essa aula não pertence a este aluno.' };
    const { supabase, dbUser } = ctx;
    const pedidos = [...new Set(materialIds)].filter(x => UUID.test(x)).slice(0, 100);
    const { data: meus } = pedidos.length
      ? await supabase.from('material').select('id').eq('idusers_fk', dbUser.idusers).in('id', pedidos)
      : { data: [] as { id: string }[] };
    const alvo = new Set((meus ?? []).map(m => m.id as string));
    const { data: atuais, error: errAt } = await supabase.from('lesson_material').select('material_fk').eq('lesson_fk', lessonId).eq('idusers_fk', dbUser.idusers);
    if (tabelaAusente(errAt)) return { ok: false, error: 'A biblioteca de materiais ainda não foi ativada no banco.' };
    if (errAt) return { ok: false, error: ERRO };
    const tem = new Set((atuais ?? []).map(r => r.material_fk as string));
    const adicionar = [...alvo].filter(a => !tem.has(a));
    const remover = [...tem].filter(a => !alvo.has(a));
    if (adicionar.length) {
      const { error } = await supabase.from('lesson_material').insert(adicionar.map(a => ({ lesson_fk: lessonId, material_fk: a, idusers_fk: dbUser.idusers })));
      if (error) { console.error('Materiais da aula: erro ao vincular:', error.message); return { ok: false, error: ERRO }; }
    }
    if (remover.length) {
      const { error } = await supabase.from('lesson_material').delete().eq('lesson_fk', lessonId).eq('idusers_fk', dbUser.idusers).in('material_fk', remover);
      if (error) return { ok: false, error: ERRO };
    }
    return { ok: true };
  } catch (e: any) { console.error('Materiais da aula: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}
