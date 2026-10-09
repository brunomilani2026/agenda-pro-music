'use server';

import { alunoDoProfessor, UUID, type Falha } from '@/lib/professor-ctx';
import { tabelaAusente } from '@/lib/diario-aluno';
import { limparItem, reordenar, statusValido, type ItemAluno, type Trilha } from '@/lib/estudos';

const ERRO_GENERICO = 'Não foi possível concluir. Tente de novo.';
const COLUNAS = 'id, source_item_fk, track_name, module_title, title, description, objective, difficulty, competency, position, status, status_changed_at, created_at';

/** Plano de estudos do aluno + trilhas disponíveis para aplicar. `disponivel:false` = SQL da etapa 3 ainda não aplicado. */
export async function fetchPlano(idstudent: string): Promise<
  { ok: true; disponivel: boolean; itens: ItemAluno[]; trilhas: Pick<Trilha, 'id' | 'name' | 'instrument' | 'level'>[] } | Falha
> {
  try {
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;
    const [it, tr] = await Promise.all([
      supabase.from('student_study_item').select(COLUNAS).eq('idusers_fk', dbUser.idusers).eq('idstudent_fk', idstudent).order('position'),
      supabase.from('study_track').select('id, name, instrument, level').eq('idusers_fk', dbUser.idusers).eq('archived', false).order('name'),
    ]);
    if (tabelaAusente(it.error) || tabelaAusente(tr.error)) return { ok: true, disponivel: false, itens: [], trilhas: [] };
    if (it.error || tr.error) { console.error('Plano: erro ao buscar:', (it.error || tr.error)?.message); return { ok: false, error: 'Não foi possível carregar o plano de estudos.' }; }
    return { ok: true, disponivel: true, itens: (it.data ?? []) as ItemAluno[], trilhas: (tr.data ?? []) as any };
  } catch (e: any) { console.error('Plano: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function alterarStatusEstudo(idstudent: string, itemId: string, status: unknown): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(itemId)) return { ok: false, error: 'Conteúdo não encontrado.' };
    if (!statusValido(status)) return { ok: false, error: 'Status inválido.' };
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { data, error } = await ctx.supabase.from('student_study_item')
      .update({ status, status_changed_at: new Date().toISOString() })
      .eq('id', itemId).eq('idstudent_fk', idstudent).eq('idusers_fk', ctx.dbUser.idusers).select('id');
    if (error) { console.error('Plano: erro ao mudar status:', error.message); return { ok: false, error: ERRO_GENERICO }; }
    return data?.length ? { ok: true } : { ok: false, error: 'Conteúdo não encontrado.' };
  } catch (e: any) { console.error('Plano: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

/** Sobe ou desce um conteúdo DENTRO do mesmo módulo do aluno. */
export async function moverItemAluno(idstudent: string, itemId: string, dir: -1 | 1): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(itemId) || (dir !== -1 && dir !== 1)) return { ok: false, error: 'Pedido inválido.' };
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;
    const { data: alvo } = await supabase.from('student_study_item').select('track_name, module_title')
      .eq('id', itemId).eq('idstudent_fk', idstudent).eq('idusers_fk', dbUser.idusers).maybeSingle();
    if (!alvo) return { ok: false, error: 'Conteúdo não encontrado.' };
    const { data: irmaos } = await supabase.from('student_study_item').select('id, position')
      .eq('idstudent_fk', idstudent).eq('idusers_fk', dbUser.idusers).eq('track_name', alvo.track_name).eq('module_title', alvo.module_title);
    for (const u of reordenar(irmaos ?? [], itemId, dir)) {
      const { error } = await supabase.from('student_study_item').update({ position: u.position }).eq('id', u.id).eq('idusers_fk', dbUser.idusers);
      if (error) return { ok: false, error: ERRO_GENERICO };
    }
    return { ok: true };
  } catch (e: any) { console.error('Plano: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

/** Conteúdo só deste aluno (personalização). Entra no fim do módulo informado, ou em "Plano personalizado". */
export async function adicionarItemAluno(
  idstudent: string, destino: { track_name?: string; module_title?: string }, bruto: Record<string, unknown>
): Promise<{ ok: true } | Falha> {
  try {
    const v = limparItem(bruto); if (!v.ok) return v;
    const trilha = (destino.track_name ?? '').trim().slice(0, 120) || 'Plano personalizado';
    const modulo = (destino.module_title ?? '').trim().slice(0, 120) || 'Conteúdos do aluno';
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;
    const { data: ult } = await supabase.from('student_study_item').select('position')
      .eq('idstudent_fk', idstudent).eq('idusers_fk', dbUser.idusers).eq('track_name', trilha).eq('module_title', modulo)
      .order('position', { ascending: false }).limit(1);
    let posicao = 0;
    if (ult?.length) {
      posicao = (ult[0].position ?? 0) + 1;
    } else {
      const { data: base } = await supabase.from('student_study_item').select('position')
        .eq('idstudent_fk', idstudent).eq('idusers_fk', dbUser.idusers).eq('track_name', trilha)
        .order('position', { ascending: false }).limit(1);
      posicao = base?.length ? (base[0].position ?? 0) + 1000 : 0;
    }
    const { error } = await supabase.from('student_study_item').insert({
      ...v.valor, idstudent_fk: idstudent, idusers_fk: dbUser.idusers, source_item_fk: null,
      track_name: trilha, module_title: modulo, position: posicao, status: 'nao_iniciado',
    });
    if (error) {
      if (tabelaAusente(error)) return { ok: false, error: 'Os planos de estudo ainda não foram ativados no banco.' };
      console.error('Plano: erro ao adicionar:', error.message);
      return { ok: false, error: ERRO_GENERICO };
    }
    return { ok: true };
  } catch (e: any) { console.error('Plano: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function removerItemAluno(idstudent: string, itemId: string): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(itemId)) return { ok: false, error: 'Conteúdo não encontrado.' };
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { data, error } = await ctx.supabase.from('student_study_item').delete()
      .eq('id', itemId).eq('idstudent_fk', idstudent).eq('idusers_fk', ctx.dbUser.idusers).select('id');
    if (error) return { ok: false, error: ERRO_GENERICO };
    return data?.length ? { ok: true } : { ok: false, error: 'Conteúdo não encontrado.' };
  } catch (e: any) { console.error('Plano: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}
