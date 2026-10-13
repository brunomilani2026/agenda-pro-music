'use server';

import { contextoProfessor } from '@/lib/professor-ctx';
import { getLocalISODate, nowInSaoPaulo } from '@/lib/utils';
import { montarAlertas, type AlertaPainel } from '@/lib/painel-alertas';

type Linha = Record<string, any>;

// O Supabase devolve no máximo 1000 linhas por consulta: lê em páginas para não cortar em silêncio.
async function todas(consulta: (de: number, ate: number) => PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>): Promise<Linha[]> {
  const saida: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    saida.push(...(data ?? []));
    if ((data ?? []).length < 1000) return saida;
  }
}

/** Alertas do painel inicial. Só lê; usa a sessão do professor, então as regras de acesso (RLS) valem. */
export async function fetchPainelAlertas(): Promise<{ ok: true; alertas: AlertaPainel[] } | { ok: false; error: string }> {
  try {
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { supabase, dbUser } = ctx;
    const dono = dbUser.idusers;

    const colunasAula = 'idlesson, date, datelesson, starttime, endtime, instrument, lessonprice, lessonstatus, obs, student_fk, studentname';
    const [alunos, aulas, faturas, creditos, registros, tarefas] = await Promise.all([
      todas((a, b) => supabase.from('student').select('*').eq('idusers_fk', dono).range(a, b)),
      todas((a, b) => supabase.from('lesson').select(colunasAula).eq('idusers_fk', dono).range(a, b)),
      todas((a, b) => supabase.from('payment').select('id, amount, duedate, paymentdate, status, method, notes, aluno_avisou_em, idstudent_fk').eq('idusers_fk', dono).range(a, b)),
      todas((a, b) => supabase.from('credit').select('id, origin_lesson_fk, expires_at, used, used_at, created_at, idstudent_fk').eq('idusers_fk', dono).range(a, b)),
      todas((a, b) => supabase.from('lesson_record').select('idlesson_fk').eq('idusers_fk', dono).range(a, b)),
      todas((a, b) => supabase.from('task').select('id, idstudent_fk, title, status, due_date').eq('idusers_fk', dono).eq('status', 'aberta').range(a, b)),
    ]);
    const ids = tarefas.map(t => t.id as string);
    const entregas = ids.length === 0 ? [] : await todas((a, b) =>
      supabase.from('task_submission').select('task_fk, created_at, feedback_at').eq('idusers_fk', dono).range(a, b));

    const agora = nowInSaoPaulo();
    const alertas = montarAlertas({
      alunos, aulas, faturas, creditos,
      registros: registros as { idlesson_fk: string }[],
      tarefas: tarefas as any,
      entregas: entregas as any,
      hojeIso: getLocalISODate(agora),
      agoraMin: agora.getHours() * 60 + agora.getMinutes(),
    });
    return { ok: true, alertas };
  } catch (err: any) {
    console.error('Painel de alertas: erro:', err?.message || err);
    return { ok: false, error: 'Não foi possível carregar os alertas.' };
  }
}
