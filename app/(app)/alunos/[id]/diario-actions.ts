'use server';

import { getSessionUser } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { normalizeStudentName } from '@/lib/lesson-cancel-reasons';
import {
  CAMPOS_TEXTO, limparNota, limparRegistro, tabelaAusente,
  type NotaAluno, type RegistroAula,
} from '@/lib/diario-aluno';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUNAS_REGISTRO = ['idlesson_fk', 'share_with_student', 'updated_at', ...CAMPOS_TEXTO.map(c => c.k)].join(', ');

type Falha = { ok: false; error: string };

/**
 * Aluno do professor logado (o id de um aluno de outro professor nunca passa).
 * Além disso, as regras de acesso do banco (RLS) valem para tudo que sai daqui.
 */
async function alunoDoProfessor(idstudent: string) {
  if (!UUID.test(idstudent)) return null;
  const dbUser = await getSessionUser();
  if (!dbUser) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('student').select('idstudent, name').eq('idstudent', idstudent).eq('idusers_fk', dbUser.idusers).maybeSingle();
  return data ? { supabase, dbUser, aluno: data } : null;
}

/** Registros de aula e anotações do aluno. `disponivel:false` = SQL da etapa 2 ainda não aplicado. */
export async function fetchDiario(idstudent: string): Promise<
  { ok: true; disponivel: boolean; registros: RegistroAula[]; notas: NotaAluno[] } | Falha
> {
  try {
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;

    const [reg, notas] = await Promise.all([
      supabase.from('lesson_record').select(COLUNAS_REGISTRO).eq('idusers_fk', dbUser.idusers).eq('idstudent_fk', idstudent),
      supabase.from('student_note').select('id, visibility, body, created_at, updated_at')
        .eq('idusers_fk', dbUser.idusers).eq('idstudent_fk', idstudent)
        .in('visibility', ['professor_privada', 'compartilhada'])
        .order('created_at', { ascending: false }),
    ]);

    if (tabelaAusente(reg.error) || tabelaAusente(notas.error)) {
      return { ok: true, disponivel: false, registros: [], notas: [] };
    }
    if (reg.error || notas.error) {
      console.error('Diário: erro ao buscar:', (reg.error || notas.error)?.message);
      return { ok: false, error: 'Não foi possível carregar o diário.' };
    }
    return { ok: true, disponivel: true, registros: (reg.data ?? []) as unknown as RegistroAula[], notas: (notas.data ?? []) as NotaAluno[] };
  } catch (err: any) {
    console.error('Diário: erro inesperado:', err?.message || err);
    return { ok: false, error: 'Erro inesperado ao carregar o diário.' };
  }
}

/** Cria ou atualiza o registro de UMA aula (um por aula; não duplica). */
export async function salvarRegistroAula(
  idstudent: string, idlesson: string, bruto: Record<string, unknown>
): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(idlesson)) return { ok: false, error: 'Aula inválida.' };
    const limpo = limparRegistro(bruto);
    if (!limpo.ok) return limpo;

    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser, aluno } = ctx;

    // A aula tem de ser deste professor E deste aluno (por vínculo ou, nas antigas, pelo nome).
    const { data: aula } = await supabase
      .from('lesson').select('idlesson, student_fk, studentname')
      .eq('idlesson', idlesson).eq('idusers_fk', dbUser.idusers).maybeSingle();
    const daqui = aula && (aula.student_fk ? aula.student_fk === idstudent : normalizeStudentName(aula.studentname) === normalizeStudentName(aluno.name));
    if (!daqui) return { ok: false, error: 'Essa aula não pertence a este aluno.' };

    const { error } = await supabase.from('lesson_record').upsert(
      {
        idlesson_fk: idlesson, idstudent_fk: idstudent, idusers_fk: dbUser.idusers,
        ...limpo.valor.campos, share_with_student: limpo.valor.share_with_student, updated_by: dbUser.idusers,
      },
      { onConflict: 'idlesson_fk' }
    );
    if (error) {
      if (tabelaAusente(error)) return { ok: false, error: 'O diário ainda não foi ativado no banco.' };
      console.error('Diário: erro ao salvar registro:', error.message);
      return { ok: false, error: 'Não foi possível salvar o registro.' };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('Diário: erro inesperado ao salvar:', err?.message || err);
    return { ok: false, error: 'Erro inesperado ao salvar.' };
  }
}

export async function salvarNota(
  idstudent: string, visibility: unknown, body: unknown, idnota?: string
): Promise<{ ok: true } | Falha> {
  try {
    const limpo = limparNota(visibility, body);
    if (!limpo.ok) return limpo;
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;

    if (idnota) {
      if (!UUID.test(idnota)) return { ok: false, error: 'Anotação inválida.' };
      const { data, error } = await supabase.from('student_note')
        .update({ visibility: limpo.valor.visibility, body: limpo.valor.body })
        .eq('id', idnota).eq('idusers_fk', dbUser.idusers).eq('idstudent_fk', idstudent).select('id');
      if (error) { console.error('Anotação: erro ao editar:', error.message); return { ok: false, error: 'Não foi possível salvar.' }; }
      if (!data?.length) return { ok: false, error: 'Anotação não encontrada.' };
      return { ok: true };
    }

    const { error } = await supabase.from('student_note').insert({
      idstudent_fk: idstudent, idusers_fk: dbUser.idusers, author_id: dbUser.idusers,
      visibility: limpo.valor.visibility, body: limpo.valor.body,
    });
    if (error) {
      if (tabelaAusente(error)) return { ok: false, error: 'As anotações ainda não foram ativadas no banco.' };
      console.error('Anotação: erro ao criar:', error.message);
      return { ok: false, error: 'Não foi possível salvar a anotação.' };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('Anotação: erro inesperado:', err?.message || err);
    return { ok: false, error: 'Erro inesperado ao salvar.' };
  }
}

export async function apagarNota(idstudent: string, idnota: string): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(idnota)) return { ok: false, error: 'Anotação inválida.' };
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;
    const { data, error } = await supabase.from('student_note').delete()
      .eq('id', idnota).eq('idusers_fk', dbUser.idusers).eq('idstudent_fk', idstudent).select('id');
    if (error) { console.error('Anotação: erro ao apagar:', error.message); return { ok: false, error: 'Não foi possível apagar.' }; }
    if (!data?.length) return { ok: false, error: 'Anotação não encontrada.' };
    return { ok: true };
  } catch (err: any) {
    console.error('Anotação: erro inesperado ao apagar:', err?.message || err);
    return { ok: false, error: 'Erro inesperado ao apagar.' };
  }
}
