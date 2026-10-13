-- Desfaz a etapa 9 (volta a bloquear a exclusão de aluno que tem aulas).
ALTER TABLE public.lesson DROP CONSTRAINT IF EXISTS lesson_student_fk_fkey;
ALTER TABLE public.lesson ADD CONSTRAINT lesson_student_fk_fkey
  FOREIGN KEY (student_fk) REFERENCES public.student(idstudent);
NOTIFY pgrst, 'reload schema';
