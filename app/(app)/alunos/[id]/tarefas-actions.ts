'use server';

import { alunoDoProfessor, contextoProfessor, UUID, type Falha } from '@/lib/professor-ctx';
import { tabelaAusente } from '@/lib/diario-aluno';
import { getLocalISODate, nowInSaoPaulo } from '@/lib/utils';
import { limparRetorno, limparTarefa, statusDaTarefa, type Entrega, type StatusTarefa, type Tarefa } from '@/lib/tarefas';

const ERRO = 'Não foi possível concluir. Tente de novo.';
const SEM_TABELA = 'As tarefas ainda não foram ativadas no banco.';
const COL_TAREFA = 'id, idstudent_fk, title, description, due_date, status, completed_at, created_at';
const COL_ENTREGA = 'id, task_fk, kind, note, url, file_name, mime_type, size_bytes, feedback, feedback_at, created_at';

export type TarefaCompleta = Tarefa & { entregas: Entrega[]; materiais: { id: string; title: string }[]; estado: StatusTarefa };
export type TarefaParaAcao = TarefaCompleta & { aluno: string };

async function materiaisDasTarefas(supabase: any, userId: string, taskIds: string[]) {
  const mapa = new Map<string, { id: string; title: string }[]>();
  if (taskIds.length === 0) return mapa;
  const { data: links } = await supabase.from('task_material').select('task_fk, material_fk').eq('idusers_fk', userId).in('task_fk', taskIds);
  const ids = [...new Set((links ?? []).map((l: any) => l.material_fk as string))];
  if (ids.length === 0) return mapa;
  const { data: mats } = await supabase.from('material').select('id, title').eq('idusers_fk', userId).in('id', ids);
  const titulo = new Map<string, string>((mats ?? []).map((m: any): [string, string] => [m.id as string, m.title as string]));
  for (const l of links ?? []) {
    const t = titulo.get(l.material_fk);
    if (!t) continue;
    const lista = mapa.get(l.task_fk) ?? [];
    lista.push({ id: l.material_fk, title: t });
    mapa.set(l.task_fk, lista);
  }
  return mapa;
}

function montar(tarefas: Tarefa[], entregas: Entrega[], mats: Map<string, { id: string; title: string }[]>): TarefaCompleta[] {
  const hoje = getLocalISODate(nowInSaoPaulo());
  return tarefas.map(t => {
    const es = entregas.filter(e => e.task_fk === t.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { ...t, entregas: es, materiais: mats.get(t.id) ?? [], estado: statusDaTarefa(t, es, hoje) };
  });
}

/** Garante que o aluno enxerga os materiais de apoio da tarefa (compartilha os que faltam). */
async function compartilharApoio(supabase: any, userId: string, idstudent: string, materialIds: string[]): Promise<string[]> {
  const ids = [...new Set(materialIds)].filter(x => UUID.test(x));
  if (ids.length === 0) return [] as string[];
  const { data: meus } = await supabase.from('material').select('id').eq('idusers_fk', userId).in('id', ids);
  const validos: string[] = (meus ?? []).map((m: any) => m.id as string);
  if (validos.length) {
    await supabase.from('material_share').upsert(
      validos.map(m => ({ material_fk: m, idstudent_fk: idstudent, idusers_fk: userId })),
      { onConflict: 'material_fk,idstudent_fk', ignoreDuplicates: true }
    );
  }
  return validos;
}

export async function fetchTarefas(idstudent: string): Promise<
  { ok: true; disponivel: boolean; tarefas: TarefaCompleta[]; biblioteca: { id: string; title: string }[] } | Falha
> {
  try {
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;
    const [t, e, b] = await Promise.all([
      supabase.from('task').select(COL_TAREFA).eq('idusers_fk', dbUser.idusers).eq('idstudent_fk', idstudent).order('created_at', { ascending: false }),
      supabase.from('task_submission').select(COL_ENTREGA).eq('idusers_fk', dbUser.idusers).eq('idstudent_fk', idstudent),
      supabase.from('material').select('id, title').eq('idusers_fk', dbUser.idusers).order('title'),
    ]);
    if (tabelaAusente(t.error) || tabelaAusente(e.error)) return { ok: true, disponivel: false, tarefas: [], biblioteca: [] };
    if (t.error || e.error) { console.error('Tarefas: erro ao buscar:', (t.error || e.error)?.message); return { ok: false, error: 'Não foi possível carregar as tarefas.' }; }
    const tarefas = (t.data ?? []) as Tarefa[];
    const mats = await materiaisDasTarefas(supabase, dbUser.idusers, tarefas.map(x => x.id));
    return { ok: true, disponivel: true, tarefas: montar(tarefas, (e.data ?? []) as Entrega[], mats), biblioteca: (b.data ?? []) as { id: string; title: string }[] };
  } catch (err: any) { console.error('Tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

/** Cria a tarefa para um ou mais alunos (uma tarefa por aluno). */
export async function criarTarefa(idstudents: string[], bruto: Record<string, unknown>, materialIds: string[]): Promise<{ ok: true; criadas: number } | Falha> {
  try {
    const v = limparTarefa(bruto); if (!v.ok) return v;
    const ids = [...new Set(idstudents)].filter(x => UUID.test(x));
    if (ids.length === 0) return { ok: false, error: 'Escolha pelo menos um aluno.' };
    if (ids.length > 100) return { ok: false, error: 'Alunos demais de uma vez.' };
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { supabase, dbUser } = ctx;
    const { data: meus } = await supabase.from('student').select('idstudent').eq('idusers_fk', dbUser.idusers).in('idstudent', ids);
    const validos = (meus ?? []).map(s => s.idstudent as string);
    if (validos.length === 0) return { ok: false, error: 'Aluno não encontrado.' };

    const { data: criadas, error } = await supabase.from('task')
      .insert(validos.map(a => ({ ...v.valor, idusers_fk: dbUser.idusers, idstudent_fk: a }))).select('id, idstudent_fk');
    if (error) {
      if (tabelaAusente(error)) return { ok: false, error: SEM_TABELA };
      console.error('Tarefas: erro ao criar:', error.message);
      return { ok: false, error: 'Não foi possível criar a tarefa.' };
    }
    for (const t of criadas ?? []) {
      const mats = await compartilharApoio(supabase, dbUser.idusers, t.idstudent_fk as string, materialIds);
      if (mats.length) await supabase.from('task_material').insert(mats.map(m => ({ task_fk: t.id, material_fk: m, idusers_fk: dbUser.idusers })));
    }
    return { ok: true, criadas: criadas?.length ?? 0 };
  } catch (err: any) { console.error('Tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

export async function editarTarefa(idstudent: string, taskId: string, bruto: Record<string, unknown>, materialIds: string[]): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(taskId)) return { ok: false, error: 'Tarefa não encontrada.' };
    const v = limparTarefa(bruto); if (!v.ok) return v;
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;
    const { data, error } = await supabase.from('task').update(v.valor).eq('id', taskId).eq('idstudent_fk', idstudent).eq('idusers_fk', dbUser.idusers).select('id');
    if (error) { console.error('Tarefas: erro ao editar:', error.message); return { ok: false, error: ERRO }; }
    if (!data?.length) return { ok: false, error: 'Tarefa não encontrada.' };

    const alvo = new Set(await compartilharApoio(supabase, dbUser.idusers, idstudent, materialIds));
    const { data: atuais } = await supabase.from('task_material').select('material_fk').eq('task_fk', taskId).eq('idusers_fk', dbUser.idusers);
    const tem = new Set((atuais ?? []).map(r => r.material_fk as string));
    const adicionar = [...alvo].filter(a => !tem.has(a));
    const remover = [...tem].filter(a => !alvo.has(a));
    if (adicionar.length) await supabase.from('task_material').insert(adicionar.map(m => ({ task_fk: taskId, material_fk: m, idusers_fk: dbUser.idusers })));
    if (remover.length) await supabase.from('task_material').delete().eq('task_fk', taskId).eq('idusers_fk', dbUser.idusers).in('material_fk', remover);
    return { ok: true };
  } catch (err: any) { console.error('Tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

/** Apaga a tarefa, as entregas e os arquivos enviados pelo aluno. */
export async function apagarTarefa(idstudent: string, taskId: string): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(taskId)) return { ok: false, error: 'Tarefa não encontrada.' };
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;
    const { data: subs } = await supabase.from('task_submission').select('storage_path').eq('task_fk', taskId).eq('idusers_fk', dbUser.idusers);
    const { data, error } = await supabase.from('task').delete().eq('id', taskId).eq('idstudent_fk', idstudent).eq('idusers_fk', dbUser.idusers).select('id');
    if (error) { console.error('Tarefas: erro ao apagar:', error.message); return { ok: false, error: ERRO }; }
    if (!data?.length) return { ok: false, error: 'Tarefa não encontrada.' };
    const caminhos = (subs ?? []).map(s => s.storage_path as string | null).filter((p): p is string => !!p);
    if (caminhos.length) {
      const r = await supabase.storage.from('entregas').remove(caminhos);
      if (r.error) console.error('Tarefas: arquivos órfãos em entregas:', caminhos.length, r.error.message);
    }
    return { ok: true };
  } catch (err: any) { console.error('Tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

export async function darRetorno(idstudent: string, submissionId: string, feedback: unknown): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(submissionId)) return { ok: false, error: 'Entrega não encontrada.' };
    const v = limparRetorno(feedback); if (!v.ok) return v;
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { data, error } = await ctx.supabase.from('task_submission')
      .update({ feedback: v.valor, feedback_at: new Date().toISOString() })
      .eq('id', submissionId).eq('idstudent_fk', idstudent).eq('idusers_fk', ctx.dbUser.idusers).select('id');
    if (error) { console.error('Tarefas: erro ao dar retorno:', error.message); return { ok: false, error: ERRO }; }
    return data?.length ? { ok: true } : { ok: false, error: 'Entrega não encontrada.' };
  } catch (err: any) { console.error('Tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

export async function concluirTarefa(idstudent: string, taskId: string, concluida: boolean): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(taskId)) return { ok: false, error: 'Tarefa não encontrada.' };
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { data, error } = await ctx.supabase.from('task')
      .update({ status: concluida ? 'concluida' : 'aberta', completed_at: concluida ? new Date().toISOString() : null })
      .eq('id', taskId).eq('idstudent_fk', idstudent).eq('idusers_fk', ctx.dbUser.idusers).select('id');
    if (error) return { ok: false, error: ERRO };
    return data?.length ? { ok: true } : { ok: false, error: 'Tarefa não encontrada.' };
  } catch (err: any) { console.error('Tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

/** Abre uma entrega: o link do aluno, ou um endereço temporário (2 min) do arquivo. */
export async function enderecoEntrega(idstudent: string, submissionId: string): Promise<{ ok: true; url: string } | Falha> {
  try {
    if (!UUID.test(submissionId)) return { ok: false, error: 'Entrega não encontrada.' };
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { data: s } = await ctx.supabase.from('task_submission').select('kind, url, storage_path')
      .eq('id', submissionId).eq('idstudent_fk', idstudent).eq('idusers_fk', ctx.dbUser.idusers).maybeSingle();
    if (!s) return { ok: false, error: 'Entrega não encontrada.' };
    if (s.kind === 'link') return s.url ? { ok: true, url: s.url } : { ok: false, error: 'Entrega sem endereço.' };
    const { data, error } = await ctx.supabase.storage.from('entregas').createSignedUrl(s.storage_path as string, 120);
    if (error || !data) { console.error('Tarefas: erro ao abrir entrega:', error?.message); return { ok: false, error: 'Não foi possível abrir o arquivo.' }; }
    return { ok: true, url: data.signedUrl };
  } catch (err: any) { console.error('Tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

/** Visão geral do professor: tarefas abertas de todos os alunos que pedem ação (entregues ou atrasadas). */
export async function fetchTarefasParaAcao(): Promise<{ ok: true; disponivel: boolean; tarefas: TarefaParaAcao[] } | Falha> {
  try {
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { supabase, dbUser } = ctx;
    const [t, e, s] = await Promise.all([
      supabase.from('task').select(COL_TAREFA).eq('idusers_fk', dbUser.idusers).eq('status', 'aberta'),
      supabase.from('task_submission').select(COL_ENTREGA).eq('idusers_fk', dbUser.idusers),
      supabase.from('student').select('idstudent, name').eq('idusers_fk', dbUser.idusers),
    ]);
    if (tabelaAusente(t.error) || tabelaAusente(e.error)) return { ok: true, disponivel: false, tarefas: [] };
    if (t.error || e.error || s.error) { console.error('Tarefas: erro ao buscar visão geral:', (t.error || e.error || s.error)?.message); return { ok: false, error: 'Não foi possível carregar as tarefas.' }; }
    const nomes = new Map((s.data ?? []).map(a => [a.idstudent as string, a.name as string]));
    const tarefas = (t.data ?? []) as Tarefa[];
    const todas = montar(tarefas, (e.data ?? []) as Entrega[], new Map());
    return { ok: true, disponivel: true, tarefas: todas.filter(x => x.estado === 'entregue' || x.estado === 'atrasada').map(x => ({ ...x, aluno: nomes.get(x.idstudent_fk) ?? 'Aluno' })) };
  } catch (err: any) { console.error('Tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}
