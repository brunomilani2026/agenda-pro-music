'use server';

// Portal do aluno (etapa 6): o aluno LÊ o que o professor liberou e escreve só as
// próprias anotações. Tudo pela SESSÃO DO ALUNO: as regras de acesso do banco (RLS)
// decidem o que ele enxerga; os filtros abaixo são uma segunda trava.

import { getSessionStudent } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { limparNotaPessoal, tabelaAusente } from '@/lib/diario-aluno';
import type { ItemAluno } from '@/lib/estudos';
import type { Material } from '@/lib/materiais';

const ERRO = 'Não foi possível concluir. Tente de novo.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Falha = { ok: false; error: string };

async function alunoLogado() {
  const student = await getSessionStudent();
  if (!student) return null;
  return { student, supabase: await createClient() };
}

/** Plano de estudos do aluno (somente leitura). */
export async function fetchMeusEstudos(): Promise<{ ok: true; disponivel: boolean; itens: ItemAluno[] } | Falha> {
  try {
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { data, error } = await ctx.supabase.from('student_study_item')
      .select('id, source_item_fk, track_name, module_title, title, description, objective, difficulty, competency, position, status, status_changed_at, created_at')
      .eq('idstudent_fk', ctx.student.idstudent).order('position');
    if (tabelaAusente(error)) return { ok: true, disponivel: false, itens: [] };
    if (error) { console.error('Portal: erro ao buscar estudos:', error.message); return { ok: false, error: 'Não foi possível carregar seu plano de estudos.' }; }
    return { ok: true, disponivel: true, itens: (data ?? []) as ItemAluno[] };
  } catch (e: any) { console.error('Portal: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

export type MaterialDoAluno = Omit<Material, 'storage_path'>;

/** Materiais que o professor compartilhou com o aluno. O caminho do arquivo nunca sai do servidor. */
export async function fetchMeusMateriais(): Promise<{ ok: true; disponivel: boolean; materiais: MaterialDoAluno[] } | Falha> {
  try {
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { data, error } = await ctx.supabase.from('material')
      .select('id, kind, title, description, category, instrument, level, content_tag, url, file_name, mime_type, size_bytes, created_at')
      .order('created_at', { ascending: false });
    if (tabelaAusente(error)) return { ok: true, disponivel: false, materiais: [] };
    if (error) { console.error('Portal: erro ao buscar materiais:', error.message); return { ok: false, error: 'Não foi possível carregar seus materiais.' }; }
    return { ok: true, disponivel: true, materiais: (data ?? []).map(m => ({ ...(m as object), storage_path: undefined })) as unknown as MaterialDoAluno[] };
  } catch (e: any) { console.error('Portal: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

/** Endereço para abrir um material: link direto, ou endereço temporário (2 min) do arquivo. */
export async function enderecoMeuMaterial(id: string): Promise<{ ok: true; url: string } | Falha> {
  try {
    if (!UUID.test(id)) return { ok: false, error: 'Material não encontrado.' };
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    // O banco só devolve a linha se o material foi compartilhado com este aluno.
    const { data: m } = await ctx.supabase.from('material').select('kind, url, storage_path').eq('id', id).maybeSingle();
    if (!m) return { ok: false, error: 'Material não encontrado.' };
    if (m.kind !== 'arquivo') return m.url ? { ok: true, url: m.url } : { ok: false, error: 'Material sem endereço.' };
    const { data, error } = await ctx.supabase.storage.from('materials').createSignedUrl(m.storage_path as string, 120);
    if (error || !data) { console.error('Portal: erro ao abrir material:', error?.message); return { ok: false, error: 'Não foi possível abrir o arquivo.' }; }
    return { ok: true, url: data.signedUrl };
  } catch (e: any) { console.error('Portal: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

export type AulaLiberada = {
  idlesson_fk: string; date: string | null; starttime: string | null; instrument: string | null;
  content_worked: string | null; homework: string | null; next_plan: string | null; shared_note: string | null; updated_at: string | null;
};
export type NotaDoAluno = { id: string; visibility: 'compartilhada' | 'aluno_pessoal'; body: string; created_at: string; updated_at: string };

/** Diário liberado pelo professor (só os campos permitidos), recados compartilhados e anotações pessoais. */
export async function fetchMeuDiario(): Promise<{ ok: true; disponivel: boolean; aulas: AulaLiberada[]; notas: NotaDoAluno[] } | Falha> {
  try {
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { student, supabase } = ctx;
    const [aulas, notas] = await Promise.all([
      supabase.from('lesson_record_shared')
        .select('idlesson_fk, date, starttime, instrument, content_worked, homework, next_plan, shared_note, updated_at')
        .eq('idstudent_fk', student.idstudent),
      supabase.from('student_note').select('id, visibility, body, created_at, updated_at')
        .eq('idstudent_fk', student.idstudent).in('visibility', ['compartilhada', 'aluno_pessoal'])
        .order('created_at', { ascending: false }),
    ]);
    if (tabelaAusente(aulas.error) || tabelaAusente(notas.error)) return { ok: true, disponivel: false, aulas: [], notas: [] };
    if (aulas.error || notas.error) { console.error('Portal: erro ao buscar diário:', (aulas.error || notas.error)?.message); return { ok: false, error: 'Não foi possível carregar seu diário.' }; }
    const ordenadas = ((aulas.data ?? []) as AulaLiberada[]).sort((a, b) => ((b.date ?? '') + (b.starttime ?? '')).localeCompare((a.date ?? '') + (a.starttime ?? '')));
    return { ok: true, disponivel: true, aulas: ordenadas, notas: (notas.data ?? []) as NotaDoAluno[] };
  } catch (e: any) { console.error('Portal: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

/** Anotação pessoal do aluno: só ele (e mais ninguém, nem o professor) lê. */
export async function salvarMinhaNota(body: unknown, idnota?: string): Promise<{ ok: true } | Falha> {
  try {
    const v = limparNotaPessoal(body);
    if (!v.ok) return v;
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { student, supabase } = ctx;
    if (!student.account_fk || !student.idusers_fk) return { ok: false, error: 'Seu cadastro ainda não está completo. Fale com seu professor.' };

    if (idnota) {
      if (!UUID.test(idnota)) return { ok: false, error: 'Anotação inválida.' };
      const { data, error } = await supabase.from('student_note').update({ body: v.valor })
        .eq('id', idnota).eq('idstudent_fk', student.idstudent).eq('visibility', 'aluno_pessoal').eq('author_id', student.account_fk).select('id');
      if (error) { console.error('Portal: erro ao editar nota:', error.message); return { ok: false, error: ERRO }; }
      return data?.length ? { ok: true } : { ok: false, error: 'Anotação não encontrada.' };
    }
    const { error } = await supabase.from('student_note').insert({
      idstudent_fk: student.idstudent, idusers_fk: student.idusers_fk, author_id: student.account_fk,
      visibility: 'aluno_pessoal', body: v.valor,
    });
    if (error) { console.error('Portal: erro ao criar nota:', error.message); return { ok: false, error: 'Não foi possível salvar a anotação.' }; }
    return { ok: true };
  } catch (e: any) { console.error('Portal: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

export async function apagarMinhaNota(idnota: string): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(idnota)) return { ok: false, error: 'Anotação inválida.' };
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { student, supabase } = ctx;
    const { data, error } = await supabase.from('student_note').delete()
      .eq('id', idnota).eq('idstudent_fk', student.idstudent).eq('visibility', 'aluno_pessoal').select('id');
    if (error) return { ok: false, error: ERRO };
    return data?.length ? { ok: true } : { ok: false, error: 'Anotação não encontrada.' };
  } catch (e: any) { console.error('Portal: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}
