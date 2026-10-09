'use server';

import { contextoProfessor, UUID, type Falha } from '@/lib/professor-ctx';
import { tabelaAusente } from '@/lib/diario-aluno';
import {
  limparItem, limparModulo, limparTrilha, posicaoNaTrilha, reordenar,
  type ItemTrilha, type ModuloTrilha, type Trilha,
} from '@/lib/estudos';

const ERRO_GENERICO = 'Não foi possível concluir. Tente de novo.';
const SEM_TABELA = 'Os planos de estudo ainda não foram ativados no banco.';

type Linha = Trilha & { modulos: number; itens: number };

export async function listarTrilhas(): Promise<{ ok: true; disponivel: boolean; trilhas: Linha[] } | Falha> {
  try {
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { supabase, dbUser } = ctx;
    const [t, m, i] = await Promise.all([
      supabase.from('study_track').select('id, name, description, instrument, level, archived, created_at').eq('idusers_fk', dbUser.idusers).order('created_at', { ascending: false }),
      supabase.from('study_module').select('track_fk').eq('idusers_fk', dbUser.idusers),
      supabase.from('study_item').select('track_fk').eq('idusers_fk', dbUser.idusers),
    ]);
    if (tabelaAusente(t.error)) return { ok: true, disponivel: false, trilhas: [] };
    if (t.error || m.error || i.error) { console.error('Trilhas: erro ao listar:', (t.error || m.error || i.error)?.message); return { ok: false, error: 'Não foi possível carregar as trilhas.' }; }
    const cont = (rows: { track_fk: string }[] | null) => { const mp = new Map<string, number>(); for (const r of rows ?? []) mp.set(r.track_fk, (mp.get(r.track_fk) ?? 0) + 1); return mp; };
    const cm = cont(m.data), ci = cont(i.data);
    return { ok: true, disponivel: true, trilhas: (t.data ?? []).map(x => ({ ...(x as Trilha), modulos: cm.get(x.id) ?? 0, itens: ci.get(x.id) ?? 0 })) };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function criarTrilha(bruto: Record<string, unknown>): Promise<{ ok: true; id: string } | Falha> {
  try {
    const v = limparTrilha(bruto); if (!v.ok) return v;
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { data, error } = await ctx.supabase.from('study_track').insert({ ...v.valor, idusers_fk: ctx.dbUser.idusers }).select('id').single();
    if (error) { if (tabelaAusente(error)) return { ok: false, error: SEM_TABELA }; console.error('Trilhas: erro ao criar:', error.message); return { ok: false, error: ERRO_GENERICO }; }
    return { ok: true, id: data.id };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function fetchTrilha(id: string): Promise<{ ok: true; trilha: Trilha; modulos: ModuloTrilha[]; itens: ItemTrilha[] } | Falha> {
  try {
    if (!UUID.test(id)) return { ok: false, error: 'Trilha não encontrada.' };
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { supabase, dbUser } = ctx;
    const { data: trilha, error } = await supabase.from('study_track').select('id, name, description, instrument, level, archived, created_at').eq('id', id).eq('idusers_fk', dbUser.idusers).maybeSingle();
    if (error) { if (tabelaAusente(error)) return { ok: false, error: SEM_TABELA }; return { ok: false, error: ERRO_GENERICO }; }
    if (!trilha) return { ok: false, error: 'Trilha não encontrada.' };
    const [m, i] = await Promise.all([
      supabase.from('study_module').select('id, track_fk, title, position').eq('track_fk', id).eq('idusers_fk', dbUser.idusers).order('position'),
      supabase.from('study_item').select('id, module_fk, track_fk, title, description, objective, difficulty, competency, position').eq('track_fk', id).eq('idusers_fk', dbUser.idusers).order('position'),
    ]);
    if (m.error || i.error) return { ok: false, error: ERRO_GENERICO };
    return { ok: true, trilha: trilha as Trilha, modulos: (m.data ?? []) as ModuloTrilha[], itens: (i.data ?? []) as ItemTrilha[] };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function editarTrilha(id: string, bruto: Record<string, unknown>): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(id)) return { ok: false, error: 'Trilha não encontrada.' };
    const v = limparTrilha(bruto); if (!v.ok) return v;
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { data, error } = await ctx.supabase.from('study_track').update(v.valor).eq('id', id).eq('idusers_fk', ctx.dbUser.idusers).select('id');
    if (error) { console.error('Trilhas: erro ao editar:', error.message); return { ok: false, error: ERRO_GENERICO }; }
    return data?.length ? { ok: true } : { ok: false, error: 'Trilha não encontrada.' };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function arquivarTrilha(id: string, arquivar: boolean): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(id)) return { ok: false, error: 'Trilha não encontrada.' };
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { data, error } = await ctx.supabase.from('study_track').update({ archived: arquivar }).eq('id', id).eq('idusers_fk', ctx.dbUser.idusers).select('id');
    if (error) return { ok: false, error: ERRO_GENERICO };
    return data?.length ? { ok: true } : { ok: false, error: 'Trilha não encontrada.' };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function criarModulo(trilhaId: string, titulo: unknown): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(trilhaId)) return { ok: false, error: 'Trilha não encontrada.' };
    const v = limparModulo(titulo); if (!v.ok) return v;
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { supabase, dbUser } = ctx;
    const { data: ult } = await supabase.from('study_module').select('position').eq('track_fk', trilhaId).eq('idusers_fk', dbUser.idusers).order('position', { ascending: false }).limit(1);
    const { error } = await supabase.from('study_module').insert({ track_fk: trilhaId, idusers_fk: dbUser.idusers, title: v.valor, position: (ult?.[0]?.position ?? -1) + 1 });
    if (error) { console.error('Trilhas: erro ao criar módulo:', error.message); return { ok: false, error: ERRO_GENERICO }; }
    return { ok: true };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function renomearModulo(moduloId: string, titulo: unknown): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(moduloId)) return { ok: false, error: 'Módulo não encontrado.' };
    const v = limparModulo(titulo); if (!v.ok) return v;
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { data, error } = await ctx.supabase.from('study_module').update({ title: v.valor }).eq('id', moduloId).eq('idusers_fk', ctx.dbUser.idusers).select('id');
    if (error) return { ok: false, error: ERRO_GENERICO };
    return data?.length ? { ok: true } : { ok: false, error: 'Módulo não encontrado.' };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

/** Apaga o módulo e os conteúdos dele NA TRILHA. Os planos dos alunos (cópias) não mudam. */
export async function apagarModulo(moduloId: string): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(moduloId)) return { ok: false, error: 'Módulo não encontrado.' };
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { data, error } = await ctx.supabase.from('study_module').delete().eq('id', moduloId).eq('idusers_fk', ctx.dbUser.idusers).select('id');
    if (error) return { ok: false, error: ERRO_GENERICO };
    return data?.length ? { ok: true } : { ok: false, error: 'Módulo não encontrado.' };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function moverModulo(moduloId: string, dir: -1 | 1): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(moduloId) || (dir !== -1 && dir !== 1)) return { ok: false, error: 'Pedido inválido.' };
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { supabase, dbUser } = ctx;
    const { data: alvo } = await supabase.from('study_module').select('track_fk').eq('id', moduloId).eq('idusers_fk', dbUser.idusers).maybeSingle();
    if (!alvo) return { ok: false, error: 'Módulo não encontrado.' };
    const { data: todos } = await supabase.from('study_module').select('id, position').eq('track_fk', alvo.track_fk).eq('idusers_fk', dbUser.idusers);
    for (const u of reordenar(todos ?? [], moduloId, dir)) {
      const { error } = await supabase.from('study_module').update({ position: u.position }).eq('id', u.id).eq('idusers_fk', dbUser.idusers);
      if (error) return { ok: false, error: ERRO_GENERICO };
    }
    return { ok: true };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function criarItem(moduloId: string, bruto: Record<string, unknown>): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(moduloId)) return { ok: false, error: 'Módulo não encontrado.' };
    const v = limparItem(bruto); if (!v.ok) return v;
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { supabase, dbUser } = ctx;
    const { data: mod } = await supabase.from('study_module').select('id, track_fk').eq('id', moduloId).eq('idusers_fk', dbUser.idusers).maybeSingle();
    if (!mod) return { ok: false, error: 'Módulo não encontrado.' };
    const { data: ult } = await supabase.from('study_item').select('position').eq('module_fk', moduloId).eq('idusers_fk', dbUser.idusers).order('position', { ascending: false }).limit(1);
    const { error } = await supabase.from('study_item').insert({ ...v.valor, module_fk: moduloId, track_fk: mod.track_fk, idusers_fk: dbUser.idusers, position: (ult?.[0]?.position ?? -1) + 1 });
    if (error) { console.error('Trilhas: erro ao criar conteúdo:', error.message); return { ok: false, error: ERRO_GENERICO }; }
    return { ok: true };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function editarItem(itemId: string, bruto: Record<string, unknown>): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(itemId)) return { ok: false, error: 'Conteúdo não encontrado.' };
    const v = limparItem(bruto); if (!v.ok) return v;
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { data, error } = await ctx.supabase.from('study_item').update(v.valor).eq('id', itemId).eq('idusers_fk', ctx.dbUser.idusers).select('id');
    if (error) return { ok: false, error: ERRO_GENERICO };
    return data?.length ? { ok: true } : { ok: false, error: 'Conteúdo não encontrado.' };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function apagarItem(itemId: string): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(itemId)) return { ok: false, error: 'Conteúdo não encontrado.' };
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { data, error } = await ctx.supabase.from('study_item').delete().eq('id', itemId).eq('idusers_fk', ctx.dbUser.idusers).select('id');
    if (error) return { ok: false, error: ERRO_GENERICO };
    return data?.length ? { ok: true } : { ok: false, error: 'Conteúdo não encontrado.' };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

export async function moverItem(itemId: string, dir: -1 | 1): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(itemId) || (dir !== -1 && dir !== 1)) return { ok: false, error: 'Pedido inválido.' };
    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { supabase, dbUser } = ctx;
    const { data: alvo } = await supabase.from('study_item').select('module_fk').eq('id', itemId).eq('idusers_fk', dbUser.idusers).maybeSingle();
    if (!alvo) return { ok: false, error: 'Conteúdo não encontrado.' };
    const { data: todos } = await supabase.from('study_item').select('id, position').eq('module_fk', alvo.module_fk).eq('idusers_fk', dbUser.idusers);
    for (const u of reordenar(todos ?? [], itemId, dir)) {
      const { error } = await supabase.from('study_item').update({ position: u.position }).eq('id', u.id).eq('idusers_fk', dbUser.idusers);
      if (error) return { ok: false, error: ERRO_GENERICO };
    }
    return { ok: true };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}

/**
 * Aplica a trilha a um ou mais alunos COPIANDO os conteúdos. Aplicar de novo só
 * acrescenta o que ainda falta (nunca duplica nem mexe no que o aluno já tem).
 */
export async function aplicarTrilha(trilhaId: string, studentIds: string[]): Promise<
  { ok: true; alunos: number; adicionados: number; jaTinham: number } | Falha
> {
  try {
    if (!UUID.test(trilhaId)) return { ok: false, error: 'Trilha não encontrada.' };
    const ids = [...new Set(studentIds)].filter(x => UUID.test(x));
    if (ids.length === 0) return { ok: false, error: 'Escolha pelo menos um aluno.' };
    if (ids.length > 200) return { ok: false, error: 'Escolha no máximo 200 alunos de uma vez.' };

    const ctx = await contextoProfessor(); if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { supabase, dbUser } = ctx;

    const { data: trilha } = await supabase.from('study_track').select('id, name').eq('id', trilhaId).eq('idusers_fk', dbUser.idusers).maybeSingle();
    if (!trilha) return { ok: false, error: 'Trilha não encontrada.' };
    const [m, i] = await Promise.all([
      supabase.from('study_module').select('id, title, position').eq('track_fk', trilhaId).eq('idusers_fk', dbUser.idusers).order('position'),
      supabase.from('study_item').select('id, module_fk, title, description, objective, difficulty, competency, position').eq('track_fk', trilhaId).eq('idusers_fk', dbUser.idusers),
    ]);
    if (m.error || i.error) return { ok: false, error: ERRO_GENERICO };
    const modulos = m.data ?? [];
    const itens = i.data ?? [];
    if (itens.length === 0) return { ok: false, error: 'A trilha ainda não tem conteúdos.' };

    // Só alunos DESTE professor.
    const { data: meus } = await supabase.from('student').select('idstudent').eq('idusers_fk', dbUser.idusers).in('idstudent', ids);
    const validos = (meus ?? []).map(s => s.idstudent as string);
    if (validos.length === 0) return { ok: false, error: 'Nenhum dos alunos escolhidos foi encontrado.' };

    const { data: existentes, error: errEx } = await supabase.from('student_study_item').select('idstudent_fk, source_item_fk')
      .eq('idusers_fk', dbUser.idusers).in('idstudent_fk', validos).in('source_item_fk', itens.map(x => x.id));
    if (errEx) { if (tabelaAusente(errEx)) return { ok: false, error: SEM_TABELA }; return { ok: false, error: ERRO_GENERICO }; }
    const jaTem = new Set((existentes ?? []).map(e => `${e.idstudent_fk}|${e.source_item_fk}`));

    const indice = new Map(modulos.map((mo, idx) => [mo.id, { idx, title: mo.title as string }]));
    const linhas: Record<string, unknown>[] = [];
    let jaTinham = 0;
    for (const aluno of validos) {
      for (const it of itens) {
        if (jaTem.has(`${aluno}|${it.id}`)) { jaTinham++; continue; }
        const mod = indice.get(it.module_fk);
        if (!mod) continue;
        linhas.push({
          idstudent_fk: aluno, idusers_fk: dbUser.idusers, source_item_fk: it.id,
          track_name: trilha.name, module_title: mod.title, title: it.title, description: it.description,
          objective: it.objective, difficulty: it.difficulty, competency: it.competency,
          position: posicaoNaTrilha(mod.idx, it.position), status: 'nao_iniciado',
        });
      }
    }
    for (let k = 0; k < linhas.length; k += 300) {
      const { error } = await supabase.from('student_study_item').insert(linhas.slice(k, k + 300));
      if (error) { console.error('Trilhas: erro ao aplicar:', error.message); return { ok: false, error: 'Não foi possível aplicar a trilha. Nada foi duplicado; tente de novo.' }; }
    }
    return { ok: true, alunos: validos.length, adicionados: linhas.length, jaTinham };
  } catch (e: any) { console.error('Trilhas: erro inesperado:', e?.message || e); return { ok: false, error: ERRO_GENERICO }; }
}
