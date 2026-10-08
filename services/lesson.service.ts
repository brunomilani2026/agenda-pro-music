import { createClient } from '@/lib/supabase/server';
import { Lesson } from '@/types/database.types';

export class LessonService {
  static async getAllLessons(): Promise<Lesson[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('lesson').select('*').order('datelesson', { ascending: true });
    if (error) { console.error('Error fetching lessons:', error.message); return []; }
    return data as Lesson[];
  }

  static async getLessonsByUser(idusers_fk: string): Promise<Lesson[]> {
    const supabase = await createClient();
    // Colunas restritas às que fetchAgendaLessons() de fato mapeia — evita
    // trafegar/serializar o histórico inteiro de aulas a cada carga de página.
    const { data, error } = await supabase
      .from('lesson')
      .select('idlesson, studentname, teachername, instrument, date, datelesson, starttime, endtime, lessonstatus, obs')
      .eq('idusers_fk', idusers_fk)
      .order('datelesson', { ascending: true });
    if (error) { console.error('Error fetching lessons for user:', error.message); return []; }
    return data as Lesson[];
  }

  /**
   * Aulas do professor dentro de uma janela de datas (inclusiva nas duas pontas).
   *
   * ⚠️ Filtra por `datelesson`, NUNCA por `date`. A coluna `date` é VARCHAR(15),
   * nullable, e ainda guarda linhas legadas em DD/MM/YYYY (ver o tratamento em
   * fetchAgendaLessons). Lexicograficamente '19/03/2026' < '2026-…', então um
   * .gte() sobre `date` descartaria silenciosamente TODA linha legada.
   * `datelesson` é TIMESTAMPTZ NOT NULL — seguro para comparação de intervalo.
   *
   * Sem filtro de status: o dashboard conta 'realizada' e 'cancelada'.
   */
  static async getLessonsByUserInRange(
    idusers_fk: string,
    fromISO: string,
    toISO: string
  ): Promise<Lesson[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson')
      .select('idlesson, studentname, teachername, instrument, date, datelesson, starttime, endtime, lessonstatus, obs')
      .eq('idusers_fk', idusers_fk)
      // As aulas são gravadas com datelesson em T12:00:00Z, então limites de dia
      // inteiro dão 12h de folga nas duas pontas — nenhuma aula de borda escapa.
      .gte('datelesson', `${fromISO}T00:00:00.000Z`)
      .lte('datelesson', `${toISO}T23:59:59.999Z`)
      .order('datelesson', { ascending: true });
    if (error) { console.error('Error fetching lessons in range:', error.message); return []; }
    return (data as Lesson[]) ?? [];
  }

  // Filtra por nome do aluno diretamente no banco — evita trazer todas as aulas do professor.
  static async getLessonsByUserAndStudentName(idusers_fk: string, studentName: string): Promise<Lesson[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .ilike('studentname', studentName)
      .order('date', { ascending: false });
    if (error) { console.error('Error fetching lessons for student:', error.message); return []; }
    return data as Lesson[];
  }

  static async getLessonById(idlesson: string): Promise<Lesson | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson')
      .select('*')
      .eq('idlesson', idlesson)
      .maybeSingle();
    if (error) { console.error('Error fetching lesson by id:', error.message); return null; }
    return data as Lesson | null;
  }

  // Busca aulas de um professor em uma data específica (normaliza DD/MM/YYYY → YYYY-MM-DD).
  static async getLessonsByUserAndDate(idusers_fk: string, rawDate: string): Promise<Pick<Lesson, 'idlesson' | 'starttime' | 'endtime' | 'lessonstatus'>[]> {
    let date = rawDate.trim();
    if (date.includes('/')) {
      const parts = date.split('/');
      if (parts.length === 3) date = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson')
      .select('idlesson, starttime, endtime, lessonstatus')
      .eq('idusers_fk', idusers_fk)
      .eq('date', date);
    if (error) { console.error('Error fetching lessons for date:', error.message); return []; }
    return data || [];
  }

  // NOTA: a checagem de conflito passou inteira para lib/teacher-availability.ts
  // (checkTeacherAvailability / checkAvailabilityForDates), que também considera
  // horários bloqueados e dias de folga — coisas que uma query só de `lesson`
  // não enxergava. Os helpers getLessonsForConflict* daqui foram removidos.

  static async createLesson(lessonData: Omit<Lesson, 'idlesson'>): Promise<Lesson | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('lesson').insert([lessonData]).select().single();
    if (error) { console.error('Error creating lesson:', error.message); return null; }
    return data as Lesson;
  }

  // Cria várias aulas numa única query (recorrência) — evita N inserts sequenciais.
  static async createMany(rows: Omit<Lesson, 'idlesson'>[]): Promise<Lesson[]> {
    if (!rows.length) return [];
    const supabase = await createClient();
    const { data, error } = await supabase.from('lesson').insert(rows).select();
    if (error) { console.error('Error creating lessons:', error.message); return []; }
    return (data as Lesson[]) ?? [];
  }

  static async updateLesson(idlesson: string, updates: Partial<Lesson>): Promise<Lesson | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('lesson').update(updates).eq('idlesson', idlesson).select().single();
    if (error) { console.error('Error updating lesson:', error.message); return null; }
    return data as Lesson;
  }

  /**
   * Reivindica atomicamente uma aula que ainda esteja em `fromStatus`, no mesmo
   * espírito de LessonRequestService.claimRequest e CreditService.useCredit: o
   * `.eq('lessonstatus', fromStatus)` faz a transição servir de mutex. Retorna
   * false se outra execução chegou antes — usado por
   * releaseLessonForStudentReschedule para que duas abas não gerem dois
   * créditos de reposição sobre a mesma aula.
   */
  static async claimLessonStatus(
    idlesson: string,
    fromStatus: Lesson['lessonstatus'],
    updates: Partial<Lesson>
  ): Promise<boolean> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson')
      .update(updates)
      .eq('idlesson', idlesson)
      .eq('lessonstatus', fromStatus)
      .select('idlesson');
    if (error) { console.error('Error claiming lesson status:', error.message); return false; }
    return (data?.length ?? 0) > 0;
  }

  // Libera em lote as aulas "aguardando_pagamento" (pré-agendadas além do
  // vencimento anterior) que agora caem dentro do novo período pago —
  // chamado de settlePayment() depois que expirationdate avança.
  static async releasePendingLessons(studentFk: string, upToDateIso: string): Promise<number> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson')
      .update({ lessonstatus: 'agendada' })
      .eq('student_fk', studentFk)
      .eq('lessonstatus', 'aguardando_pagamento')
      .lte('datelesson', `${upToDateIso}T23:59:59.999Z`)
      .select('idlesson');
    if (error) { console.error('Error releasing pending lessons:', error.message); return 0; }
    return data?.length ?? 0;
  }

  static async deleteLesson(idlesson: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase.from('lesson').delete().eq('idlesson', idlesson);
    if (error) { console.error('Error deleting lesson:', error.message); return false; }
    return true;
  }

  /**
   * Aulas de um aluno que podem ser apagadas em lote, da data informada em
   * diante — matéria-prima da exclusão em série (aluno mudou de dia e a
   * recorrência antiga inteira precisa sair).
   *
   * Só traz 'agendada' e 'aguardando_pagamento': 'realizada' sustenta o
   * histórico e o financeiro, e 'cancelada' costuma carregar crédito de
   * reposição — apagar as duas em lote destruiria registro que o professor
   * não pediu para mexer. O filtro é por nome (ilike), não por student_fk,
   * porque aulas legadas têm o FK nulo e ficariam de fora da série.
   *
   * ⚠️ Janela por `datelesson` (TIMESTAMPTZ), nunca por `date` — ver a nota em
   * getLessonsByUserInRange sobre as linhas legadas em DD/MM/YYYY.
   */
  static async getDeletableLessonsForStudent(
    idusers_fk: string,
    studentName: string,
    fromISO: string
  ): Promise<Pick<Lesson, 'idlesson' | 'date' | 'datelesson' | 'starttime' | 'lessonstatus'>[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson')
      .select('idlesson, date, datelesson, starttime, lessonstatus')
      .eq('idusers_fk', idusers_fk)
      .ilike('studentname', studentName)
      .in('lessonstatus', ['agendada', 'aguardando_pagamento'])
      .gte('datelesson', `${fromISO}T00:00:00.000Z`)
      .order('datelesson', { ascending: true });
    if (error) { console.error('Error fetching deletable lessons:', error.message); return []; }
    return data ?? [];
  }

  /**
   * Apaga várias aulas de uma vez. O `idusers_fk` no filtro é trava de dono:
   * os ids chegam do cliente e sem ele um id forjado apagaria aula de outro
   * professor. Devolve os ids realmente removidos.
   */
  static async deleteMany(idlessons: string[], idusers_fk: string): Promise<string[]> {
    if (!idlessons.length) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson')
      .delete()
      .in('idlesson', idlessons)
      .eq('idusers_fk', idusers_fk)
      .select('idlesson');
    if (error) { console.error('Error deleting lessons:', error.message); return []; }
    return (data ?? []).map(l => l.idlesson);
  }
}
