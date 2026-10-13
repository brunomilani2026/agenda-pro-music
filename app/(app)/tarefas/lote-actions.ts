'use server';

// Tarefa para vários alunos de uma vez (cada um com o prazo da PRÓPRIA próxima aula, se for o caso).

import { contextoProfessor, UUID, type Falha } from '@/lib/professor-ctx';
import { tabelaAusente } from '@/lib/diario-aluno';
import { getLocalISODate, nowInSaoPaulo } from '@/lib/utils';
import { mapDbLessonToUI } from '@/lib/lesson-mapper';
import { limparTarefa, prazoPorModo, proximaAulaDoAluno } from '@/lib/tarefas';
import { avisarAlunoDaTarefa, prazoPorExtenso } from '@/lib/aviso-tarefa';

const ERRO = 'Não foi possível concluir. Tente de novo.';

export type AlunoParaTarefa = { id: string; name: string; instrument: string; proxima: { date: string; startTime: string } | null };

/** Alunos ativos (com a próxima aula de cada um) e a biblioteca de materiais, para montar o formulário. */
export async function fetchOpcoesNovaTarefa(): Promise<
  { ok: true; alunos: AlunoParaTarefa[]; biblioteca: { id: string; title: string }[] } | Falha
> {
  try {
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { supabase, dbUser } = ctx;
    const agora = nowInSaoPaulo();
    const margem = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

    const [s, l, m] = await Promise.all([
      supabase.from('student').select('idstudent, name, instrument, status').eq('idusers_fk', dbUser.idusers).order('name'),
      supabase.from('lesson').select('idlesson, date, datelesson, starttime, lessonstatus, student_fk, studentname')
        .eq('idusers_fk', dbUser.idusers).in('lessonstatus', ['agendada', 'aguardando_pagamento']).gte('datelesson', margem),
      supabase.from('material').select('id, title').eq('idusers_fk', dbUser.idusers).order('title'),
    ]);
    if (s.error || l.error) { console.error('Tarefas em lote: erro ao buscar opções:', (s.error || l.error)?.message); return { ok: false, error: 'Não foi possível carregar os alunos.' }; }

    const aulas = (l.data ?? []).map(x => {
      const ui = mapDbLessonToUI(x as any);
      return { student_fk: (x as any).student_fk as string | null, studentname: (x as any).studentname as string | null, date: ui.date, starttime: ui.startTime, status: ui.status as string };
    });
    const hoje = getLocalISODate(agora);
    const agoraMin = agora.getHours() * 60 + agora.getMinutes();

    const alunos = (s.data ?? [])
      .filter(a => (a.status ?? 'ativo') !== 'inativo')
      .map(a => ({
        id: a.idstudent as string, name: (a.name as string) ?? '', instrument: (a.instrument as string) ?? '',
        proxima: proximaAulaDoAluno({ idstudent: a.idstudent as string, name: (a.name as string) ?? '' }, aulas, hoje, agoraMin),
      }));
    return { ok: true, alunos, biblioteca: m.error ? [] : ((m.data ?? []) as { id: string; title: string }[]) };
  } catch (e: any) { console.error('Tarefas em lote: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

/**
 * Cria uma tarefa para cada aluno escolhido. `modo` do prazo:
 *  - 'proxima': a próxima aula de CADA aluno (quem não tem aula agendada fica sem prazo);
 *  - 'data': a mesma data para todos; - 'nenhum': sem prazo.
 */
export async function criarTarefaEmLote(
  idstudents: string[],
  bruto: { title: unknown; description: unknown; modo: unknown; due_date?: unknown },
  materialIds: string[]
): Promise<{ ok: true; criadas: number; semAula: number } | Falha> {
  try {
    const modo = bruto.modo === 'proxima' || bruto.modo === 'data' ? bruto.modo : 'nenhum';
    if (modo === 'data' && !bruto.due_date) return { ok: false, error: 'Escolha a data do prazo.' };
    // Valida título, descrição e (no modo "data") o prazo, com a mesma regra da tarefa individual.
    const base = limparTarefa({ title: bruto.title, description: bruto.description, due_date: modo === 'data' ? bruto.due_date : '' });
    if (!base.ok) return base;

    const ids = [...new Set(idstudents)].filter(x => UUID.test(x));
    if (ids.length === 0) return { ok: false, error: 'Escolha pelo menos um aluno.' };
    if (ids.length > 100) return { ok: false, error: 'Alunos demais de uma vez (máximo 100).' };

    const opcoes = await fetchOpcoesNovaTarefa();
    if (!opcoes.ok) return opcoes;
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { supabase, dbUser } = ctx;

    // Só alunos ATIVOS deste professor (a lista de opções já vem filtrada pelo banco com as regras dele).
    const porId = new Map(opcoes.alunos.map(a => [a.id, a]));
    const alvo = ids.map(i => porId.get(i)).filter((a): a is AlunoParaTarefa => !!a);
    if (alvo.length === 0) return { ok: false, error: 'Nenhum dos alunos escolhidos foi encontrado (alunos inativos não recebem tarefas).' };

    let semAula = 0;
    const linhas = alvo.map(a => {
      const due = prazoPorModo(modo, bruto.due_date, a.proxima);
      if (modo === 'proxima' && !due) semAula++;
      return { title: base.valor.title, description: base.valor.description, due_date: due || null, idusers_fk: dbUser.idusers, idstudent_fk: a.id };
    });

    const { data: criadas, error } = await supabase.from('task').insert(linhas).select('id, idstudent_fk, due_date');
    if (error) {
      if (tabelaAusente(error)) return { ok: false, error: 'As tarefas ainda não foram ativadas no banco.' };
      console.error('Tarefas em lote: erro ao criar:', error.message);
      return { ok: false, error: 'Não foi possível criar as tarefas.' };
    }

    // Material de apoio: compartilha com cada aluno e vincula à tarefa dele.
    const pedidos = [...new Set(materialIds)].filter(x => UUID.test(x));
    const { data: meus } = pedidos.length ? await supabase.from('material').select('id').eq('idusers_fk', dbUser.idusers).in('id', pedidos) : { data: [] as { id: string }[] };
    const mats: string[] = (meus ?? []).map((x: { id: string }) => x.id);

    for (const t of criadas ?? []) {
      if (mats.length) {
        await supabase.from('material_share').upsert(
          mats.map(mid => ({ material_fk: mid, idstudent_fk: t.idstudent_fk, idusers_fk: dbUser.idusers })),
          { onConflict: 'material_fk,idstudent_fk', ignoreDuplicates: true }
        );
        await supabase.from('task_material').insert(mats.map(mid => ({ task_fk: t.id, material_fk: mid, idusers_fk: dbUser.idusers })));
      }
      await avisarAlunoDaTarefa(supabase, {
        teacherId: dbUser.idusers, studentId: t.idstudent_fk as string, title: 'Nova tarefa',
        message: `Seu professor passou a tarefa "${base.valor.title}".${prazoPorExtenso(t.due_date as string | null)}`,
      });
    }
    return { ok: true, criadas: criadas?.length ?? 0, semAula };
  } catch (e: any) { console.error('Tarefas em lote: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}
