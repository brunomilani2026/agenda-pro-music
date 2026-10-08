import { getLocalISODate } from '@/lib/utils';
import type { Lesson as UILesson } from '@/types/lesson';
import type { Lesson as DBLesson } from '@/types/database.types';

/**
 * Mapeia uma aula do formato do BD para o da UI, normalizando a data.
 *
 * RF13: recupera a data de `datelesson` quando `date` está vazia, e converte
 * formatos legados DD/MM/YYYY para ISO — a coluna `date` é VARCHAR(15) sem
 * restrição de formato e ainda guarda linhas antigas nos dois padrões.
 *
 * Módulo comum (sem 'use server'): é usado tanto pelas server actions quanto
 * pela carga inicial chamada direto do layout.
 */
export function mapDbLessonToUI(l: Partial<DBLesson>): UILesson {
  let lessonDate = l.date;
  if (lessonDate) {
    if (lessonDate.includes('/')) {
      const parts = lessonDate.split('/');
      if (parts.length === 3) {
        lessonDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    lessonDate = lessonDate.trim();
  }

  if (!lessonDate && l.datelesson) {
    lessonDate = getLocalISODate(new Date(l.datelesson));
  }

  return {
    id: l.idlesson || '',
    studentName: l.studentname || '',
    teacherName: l.teachername || '',
    instrument: (l.instrument || 'violao') as UILesson['instrument'],
    date: lessonDate || '',
    startTime: l.starttime || '',
    endTime: l.endtime || '',
    status: (l.lessonstatus || 'agendada') as UILesson['status'],
    notes: l.obs || '',
  };
}
