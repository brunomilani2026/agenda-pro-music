// ============================================================
// Carga inicial do app do professor.
//
// Módulo COMUM (sem 'use server') de propósito:
//  - o layout (server component) chama isto direto, sem round-trip HTTP;
//  - módulos 'use server' só exportam funções async, e aqui precisamos
//    exportar o tipo/janela junto;
//  - todo export de um módulo 'use server' vira endpoint POST público, e o
//    dataset inteiro do professor não precisa ser um.
//
// A action fetchInitialAppData() (agenda/actions.ts) delega para cá, então
// continua existindo para o cliente pedir um refresh.
// ============================================================

import { getSessionUser } from '@/lib/session';
import { LessonService } from '@/services/lesson.service';
import { autoMarkPastLessonsAsRealizada } from '@/services/lesson-autocomplete.service';
import { computeDefaultWindow, type LessonWindow } from '@/lib/lesson-window';
import { mapDbLessonToUI } from '@/lib/lesson-mapper';
import type { Lesson as UILesson } from '@/types/lesson';

export interface InitialAppData {
  lessons: UILesson[];
  students: any[];
  payments: any[];
  profile: any;
  instruments: string[];
  pendingRequests: any[];
  /** Janela de datas que `lessons` cobre. Calculada no servidor. */
  lessonWindow: LessonWindow;
  /** Momento da carga — usado para não refazer fetch logo após o seed. */
  seededAt: number;
}

export async function loadInitialAppData(): Promise<InitialAppData> {
  const [
    { fetchAgendaStudents, fetchTeacherPayments, fetchAgendaInstruments, fetchPendingRequests },
    { fetchSessionProfile },
  ] = await Promise.all([
    import('./agenda/actions'),
    import('@/app/actions/profile.actions'),
  ]);

  const dbUser = await getSessionUser();
  const lessonWindow = computeDefaultWindow();

  if (!dbUser) {
    return {
      lessons: [], students: [], payments: [], profile: null,
      instruments: [], pendingRequests: [], lessonWindow, seededAt: Date.now(),
    };
  }

  // Tudo em paralelo — getSessionUser é React.cache'd, então roda uma vez só.
  const [dbLessons, students, payments, profile, instruments, pendingRequests, autoRealizada] = await Promise.all([
    LessonService.getLessonsByUserInRange(dbUser.idusers, lessonWindow.from, lessonWindow.to),
    fetchAgendaStudents(),
    fetchTeacherPayments(),
    fetchSessionProfile(),
    fetchAgendaInstruments(),
    fetchPendingRequests(),
    // Aulas passadas que ficaram em 'agendada' viram 'realizada' aqui. Vai
    // DENTRO do Promise.all de propósito: o layout aguarda esta função antes de
    // renderizar o shell inteiro, então um await sequencial somaria um
    // round-trip ao caminho crítico de toda carga de página.
    autoMarkPastLessonsAsRealizada({ kind: 'teacher', teacherId: dbUser.idusers }),
  ]);

  // A corrida com o SELECT acima é inofensiva e por isso o paralelo é seguro: o
  // UPDATE só faz 'agendada' → 'realizada' e devolve exatamente as linhas que
  // ele mudou. Se o SELECT leu antes do commit, elas vieram 'agendada' e a
  // reconciliação abaixo corrige; se leu depois, já vieram certas e a
  // reconciliação é no-op. Sem isso, o professor via as cores velhas até o
  // segundo F5. Ids fora da janela carregada simplesmente não casam.
  const flipped = autoRealizada.count ? new Set(autoRealizada.ids) : null;

  return {
    lessons: dbLessons.map(l =>
      flipped?.has(l.idlesson)
        ? mapDbLessonToUI({ ...l, lessonstatus: 'realizada' })
        : mapDbLessonToUI(l)
    ),
    students,
    payments,
    profile,
    instruments,
    pendingRequests,
    lessonWindow,
    seededAt: Date.now(),
  };
}
