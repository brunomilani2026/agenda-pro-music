'use server';

import { getSessionUser } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getLocalISODate, nowInSaoPaulo } from '@/lib/utils';
import { aulasDoAluno, montarFicha, type FichaAluno } from '@/lib/ficha-aluno';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ilike trata % e _ como curingas; o nome do aluno é texto, não padrão.
const escapaLike = (s: string) => s.replace(/[\%_]/g, c => `\${c}`);

/**
 * Ficha 360° do aluno (somente leitura).
 *
 * Só lê. Usa o cliente com a sessão do professor, então as regras de acesso
 * (RLS) continuam valendo; além disso o aluno é buscado com idusers_fk = professor
 * logado, para um id de outro professor nunca devolver nada.
 */
export async function fetchFichaAluno(
  idstudent: string
): Promise<{ ok: true; ficha: FichaAluno } | { ok: false; error: string }> {
  try {
    if (!UUID.test(idstudent)) return { ok: false, error: 'Aluno não encontrado.' };

    const dbUser = await getSessionUser();
    if (!dbUser) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };

    const supabase = await createClient();

    const { data: aluno, error: alunoErr } = await supabase
      .from('student')
      .select('*')
      .eq('idstudent', idstudent)
      .eq('idusers_fk', dbUser.idusers)
      .maybeSingle();
    if (alunoErr) {
      console.error('Ficha do aluno: erro ao buscar aluno:', alunoErr.message);
      return { ok: false, error: 'Não foi possível carregar o aluno.' };
    }
    if (!aluno) return { ok: false, error: 'Aluno não encontrado.' };

    const colunasAula = 'idlesson, date, datelesson, starttime, endtime, instrument, lessonprice, lessonstatus, obs, student_fk, studentname';

    const [porFk, porNome, faturas, creditos] = await Promise.all([
      supabase.from('lesson').select(colunasAula).eq('idusers_fk', dbUser.idusers).eq('student_fk', idstudent),
      // Aulas antigas ligam-se ao aluno só pelo nome.
      supabase.from('lesson').select(colunasAula).eq('idusers_fk', dbUser.idusers).is('student_fk', null).ilike('studentname', escapaLike((aluno.name ?? '').trim())),
      supabase.from('payment')
        .select('id, amount, duedate, paymentdate, status, method, notes, aluno_avisou_em')
        .eq('idusers_fk', dbUser.idusers).eq('idstudent_fk', idstudent),
      supabase.from('credit')
        .select('id, origin_lesson_fk, expires_at, used, used_at, created_at')
        .eq('idusers_fk', dbUser.idusers).eq('idstudent_fk', idstudent),
    ]);

    const erro = porFk.error || porNome.error || faturas.error || creditos.error;
    if (erro) {
      console.error('Ficha do aluno: erro ao buscar dados:', erro.message);
      return { ok: false, error: 'Não foi possível carregar os dados do aluno.' };
    }

    const agora = nowInSaoPaulo();
    const ficha = montarFicha({
      aluno,
      aulasBrutas: aulasDoAluno(aluno, [...(porFk.data ?? []), ...(porNome.data ?? [])]),
      faturasBrutas: faturas.data ?? [],
      creditosBrutos: creditos.data ?? [],
      hojeIso: getLocalISODate(agora),
      agoraMin: agora.getHours() * 60 + agora.getMinutes(),
    });
    return { ok: true, ficha };
  } catch (err: any) {
    console.error('Ficha do aluno: erro inesperado:', err?.message || err);
    return { ok: false, error: 'Erro inesperado ao carregar a ficha.' };
  }
}
