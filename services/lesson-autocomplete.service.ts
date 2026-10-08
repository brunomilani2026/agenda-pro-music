import { createAdminClient } from '@/lib/supabase/server';
import { safeUpdateTag } from '@/lib/cache';
import { getLocalISODate, nowInSaoPaulo } from '@/lib/utils';

// ============================================================
// Transição automática `agendada` → `realizada` para aulas cujo horário já
// passou. A aula acontece e ninguém precisa clicar em nada: a agenda fica
// verde sozinha.
//
// Isto vivia dentro de app/(aluno)/actions.ts e só rodava quando o ALUNO abria
// a área dele — e, pior, só para as aulas DAQUELE aluno (filtro por nome). Numa
// mesma quarta-feira, das três aulas do dia, só a do aluno que tinha logado
// ficava verde; as outras duas seguiam amarelas indefinidamente. Agora os três
// caminhos (aluno, professor e cron diário) chamam a MESMA rotina.
//
// Por que `createAdminClient()` (BYPASSRLS) nos três:
//  - ALUNO: as aulas não têm `student_fk` preenchido, então o RLS esconde as
//    linhas da sessão dele e a rotina virava no-op silencioso;
//  - CRON: roda sem cookies — o cliente da sessão não teria `auth.uid()`;
//  - PROFESSOR: funcionaria com RLS, mas usar admin nos três mantém uma query
//    só e um comportamento só. Se um caminho dependesse de policy e os outros
//    não, mudar a policy quebraria só um deles — em silêncio.
// A autorização vem de quem chama: `teacherId` sai de getSessionUser(),
// `studentName` da sessão do aluno, e o escopo global é autorizado pelo
// CRON_SECRET da rota. Nunca de input do cliente — mesma justificativa de
// services/student-sync.service.ts e lib/aluno-cache.ts.
// ============================================================

export type AutoRealizadaScope =
  // Varredura da plataforma inteira — só o cron de cobrança.
  | { kind: 'global' }
  // Todas as aulas de um professor: carga da área dele.
  | { kind: 'teacher'; teacherId: string }
  // Só as aulas de um aluno: carga da área do aluno.
  | { kind: 'student'; teacherId: string; studentName: string };

export interface AutoRealizadaResult {
  /** Aulas que ESTA execução transicionou. Vazio quando não havia nada. */
  ids: string[];
  count: number;
  /** Preenchido em falha — a rotina nunca lança. */
  error?: string;
}

/**
 * Marca como `realizada` toda aula ainda `agendada` cujo horário já terminou.
 *
 * NÃO gera cobrança: a fatura continua saindo apenas na marcação manual pelo
 * modal da agenda (app/(app)/agenda/page.tsx). Decisão de produto — um backfill
 * gerando faturas retroativas venceria todas no mesmo dia e o cron bloquearia
 * os alunos por inadimplência na manhã seguinte.
 *
 * Idempotente: o `.eq('lessonstatus', 'agendada')` do UPDATE é a trava, então
 * duas execuções concorrentes (aluno + professor + cron) não se atropelam —
 * quem chegar depois casa zero linhas.
 */
export async function autoMarkPastLessonsAsRealizada(
  scope: AutoRealizadaScope,
  opts?: { now?: Date }
): Promise<AutoRealizadaResult> {
  try {
    // O relógio TEM que ser o de São Paulo: em produção o servidor roda em UTC,
    // e às 22:00 BRT `new Date()` já virou o dia — o corte marcaria as aulas de
    // hoje (que talvez ainda estejam acontecendo) como passadas.
    const now = opts?.now ?? nowInSaoPaulo();
    const today = getLocalISODate(now);
    const tomorrow = getLocalISODate(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    );
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const supabase = createAdminClient();

    // Aplica o recorte do escopo. O admin client tipa o schema como `any`, daí
    // o builder poder ser reatribuído sem briga do TypeScript.
    const scoped = (q: any) => {
      if (scope.kind === 'global') return q;
      const byTeacher = q.eq('idusers_fk', scope.teacherId);
      return scope.kind === 'student'
        ? byTeacher.ilike('studentname', scope.studentName)
        : byTeacher;
    };

    // ⚠️ Sempre `datelesson` (TIMESTAMPTZ NOT NULL), NUNCA `date` (VARCHAR com
    // linhas legadas em DD/MM/YYYY): lexicograficamente '19/03/2027' <
    // '2026-08-22', então um filtro sobre `date` trataria aula FUTURA legada
    // como passada. Ver a nota em services/lesson.service.ts.
    //
    // `datelesson` é gravado como <dia>T12:00:00Z — marcador de dia, não
    // instante. Logo `datelesson < <hoje>T00:00:00Z` equivale a `dia < hoje`,
    // com 12h de folga nas duas bordas (mesma convenção de
    // getLessonsByUserInRange).
    const dayStartUtc = `${today}T00:00:00.000Z`;
    const nextDayUtc = `${tomorrow}T00:00:00.000Z`;

    // UPDATE...RETURNING direto, sem SELECT antes: o SELECT→`.in(ids)` anterior
    // tinha uma janela em que um cancelamento no meio era desfeito pelo update,
    // ressuscitando a aula como realizada. As duas faixas são disjuntas, então
    // nenhuma linha entra duas vezes.
    //
    // Escreve SÓ `lessonstatus`. `obs` carrega marcadores de negócio (nota de
    // cancelamento por inadimplência, liberação para o aluno remarcar) —
    // sobrescrever apagaria a reposição do aluno sem erro nenhum.
    const [pastDays, endedToday] = await Promise.all([
      // (A) dias anteriores a hoje
      scoped(
        supabase
          .from('lesson')
          .update({ lessonstatus: 'realizada' })
          .eq('lessonstatus', 'agendada')
          .lt('datelesson', dayStartUtc)
      ).select('idlesson'),

      // (B) hoje, mas a aula já terminou. `endtime` é VARCHAR 'HH:MM' com zero
      // à esquerda, então a comparação lexicográfica coincide com a cronológica.
      // Aula de hoje sem `endtime` não casa (NULL) e fica para o corte (A) de
      // amanhã.
      scoped(
        supabase
          .from('lesson')
          .update({ lessonstatus: 'realizada' })
          .eq('lessonstatus', 'agendada')
          .gte('datelesson', dayStartUtc)
          .lt('datelesson', nextDayUtc)
          .lt('endtime', hhmm)
      ).select('idlesson'),
    ]);

    const error = pastDays.error?.message ?? endedToday.error?.message;
    if (error) console.error('autoMarkPastLessonsAsRealizada:', error);

    const ids = [
      ...(pastDays.data ?? []).map((l: { idlesson: string }) => l.idlesson),
      ...(endedToday.data ?? []).map((l: { idlesson: string }) => l.idlesson),
    ];

    // safeUpdateTag e não updateTag: este módulo também roda de route handler
    // (cron) e do render do layout, onde updateTag lança. Ver lib/cache.ts.
    if (ids.length) safeUpdateTag('aluno-lessons');

    return { ids, count: ids.length, error };
  } catch (err: any) {
    // Nunca lança: esta rotina roda dentro do Promise.all que monta o layout do
    // professor. Falhar aqui não pode derrubar o app inteiro — no pior caso a
    // agenda fica com as cores velhas até a próxima passada.
    console.error('autoMarkPastLessonsAsRealizada:', err?.message || err);
    return { ids: [], count: 0, error: err?.message || String(err) };
  }
}
