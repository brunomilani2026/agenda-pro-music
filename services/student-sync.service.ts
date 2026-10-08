import { createAdminClient } from '@/lib/supabase/server';

// ============================================================
// Reconciliação dos campos que a `lesson` guarda DENORMALIZADOS do aluno
// (`studentname` e `instrument`). A agenda lê esses valores direto da aula,
// sem join com `student` — então renomear o aluno sem propagar deixa o nome
// antigo na grade do professor.
//
// Por que `createAdminClient()` (BYPASSRLS) e não o cliente da sessão:
// o RLS deste projeto é deny-all (legacy-sql/security-rls.sql) e a sessão do
// ALUNO não escreve em `lesson`. O caminho do perfil do aluno usava o cliente
// da sessão, e o UPDATE casava zero linhas em silêncio — o nome mudava na ficha
// e continuava antigo em todas as aulas. Todos os filtros aqui derivam de dados
// resolvidos no servidor (`studentId` e `teacherId` vêm da sessão de quem
// chama), nunca de input do cliente — mesma justificativa de
// lib/teacher-availability.ts e lib/aluno-cache.ts.
// ============================================================

export interface SyncStudentResult {
  /** Quantas aulas foram efetivamente atualizadas. */
  synced: number;
  error?: string;
  /** Havia homônimo: as aulas legadas (sem FK) foram deixadas de fora. */
  skippedAmbiguous?: boolean;
  /** Nenhuma linha atingida, mas o aluno TEM aulas vinculadas — escrita bloqueada. */
  blocked?: boolean;
}

/**
 * Copia nome e instrumento do aluno para as aulas dele.
 *
 * Roda em TODO save (não só quando o valor muda) de propósito: aulas que já
 * estavam fora de sincronia — criadas antes da propagação existir, ou por um
 * caminho que não propagava — são reparadas ao simplesmente salvar o aluno.
 */
export async function syncStudentIntoLessons(opts: {
  /** `lesson.student_fk` */
  studentId: string;
  /** `lesson.idusers_fk` — o PROFESSOR dono da ficha, não a conta do aluno. */
  teacherId: string;
  /** Nome antes da edição, para casar as aulas legadas que ainda o carregam. */
  previousName?: string | null;
  name?: string | null;
  instrument?: string | null;
}): Promise<SyncStudentResult> {
  const { studentId, teacherId } = opts;
  if (!studentId || !teacherId) return { synced: 0 };

  const payload: { studentname?: string; instrument?: string } = {};
  const name = (opts.name || '').trim();
  const instrument = (opts.instrument || '').trim();
  if (name) payload.studentname = name;
  if (instrument) payload.instrument = instrument;
  if (Object.keys(payload).length === 0) return { synced: 0 };

  const supabase = createAdminClient();
  const errors: string[] = [];
  let synced = 0;

  // Nomes pelos quais as aulas legadas (student_fk nulo) são casadas — o antigo
  // e o atual (linhas renomeadas num save anterior, mas ainda com instrumento
  // velho).
  const legacyNames: string[] = [];
  for (const n of [opts.previousName, name]) {
    const t = (n || '').trim();
    if (t && !legacyNames.some(x => x.toLowerCase() === t.toLowerCase())) legacyNames.push(t);
  }

  // O UPDATE por FK e as checagens de homônimo são independentes (as primeiras
  // escrevem em linhas com student_fk preenchido; as checagens só leem `student`):
  // rodam juntas em vez de em fila.
  const [linked, ...holdersByName] = await Promise.all([
    // 1. Aulas vinculadas por FK — o caminho confiável.
    supabase
      .from('lesson')
      .update(payload)
      .eq('idusers_fk', teacherId)
      .eq('student_fk', studentId)
      .select('idlesson'),
    ...legacyNames.map(legacyName =>
      // Se o nome pertence a outro aluno (ou a mais de um), sincronizar por nome
      // sobrescreveria as aulas do aluno errado — pula e avisa quem chamou.
      supabase
        .from('student')
        .select('idstudent')
        .eq('idusers_fk', teacherId)
        .ilike('name', legacyName)
        .limit(2)
    ),
  ]);
  if (linked.error) errors.push(linked.error.message);
  else synced += linked.data?.length ?? 0;

  // 2. Aulas legadas casam por nome. Aproveita para gravar o student_fk,
  //    migrando-as de vez para o caminho 1. Segue em sequência (uma por nome):
  //    os padrões ilike podem se sobrepor.
  let skippedAmbiguous = false;
  for (let i = 0; i < legacyNames.length; i++) {
    const legacyName = legacyNames[i];
    const holders = holdersByName[i].data;
    const ambiguous =
      (holders?.length ?? 0) > 1 ||
      (holders?.length === 1 && holders[0].idstudent !== studentId);
    if (ambiguous) {
      skippedAmbiguous = true;
      continue;
    }

    const legacy = await supabase
      .from('lesson')
      .update({ ...payload, student_fk: studentId })
      .eq('idusers_fk', teacherId)
      .is('student_fk', null)
      .ilike('studentname', legacyName)
      .select('idlesson');
    if (legacy.error) errors.push(legacy.error.message);
    else synced += legacy.data?.length ?? 0;
  }

  if (errors.length > 0) {
    console.error('syncStudentIntoLessons:', errors.join(' | '));
    return { synced, error: errors.join(' | '), skippedAmbiguous };
  }

  if (synced === 0 && !skippedAmbiguous) {
    // Sem erro e sem linha atingida: ou o aluno não tem aulas, ou a escrita foi
    // filtrada em silêncio. O head-count distingue os dois casos.
    const { count } = await supabase
      .from('lesson')
      .select('idlesson', { count: 'exact', head: true })
      .eq('idusers_fk', teacherId)
      .eq('student_fk', studentId);
    if ((count ?? 0) > 0) {
      console.error(
        `syncStudentIntoLessons: nenhuma linha atingida, mas o aluno ${studentId} tem ${count} aulas vinculadas.`
      );
      return { synced: 0, blocked: true };
    }
  }

  return { synced, skippedAmbiguous };
}

/**
 * Espelha o nome do aluno em `users.fname` (o registro de login). Sem isso, o
 * aluno renomeava o próprio perfil e a conta continuava com o nome antigo.
 */
export async function syncStudentNameIntoAccount(accountId: string, name: string): Promise<void> {
  const trimmed = (name || '').trim();
  if (!accountId || !trimmed) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('users')
    .update({ fname: trimmed })
    .eq('idusers', accountId);
  if (error) console.error('syncStudentNameIntoAccount:', error.message);
}
