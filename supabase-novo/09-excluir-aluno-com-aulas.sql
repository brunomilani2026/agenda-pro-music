-- Etapa 9: permite excluir um aluno que tem aulas.
-- Antes: a ligação aula -> aluno bloqueava a exclusão ("Erro ao excluir o aluno").
-- Agora: ao excluir o aluno, as aulas dele FICAM como histórico (com o nome gravado na própria aula) e só perdem a ligação.
-- Só troca a regra dessa ligação; não altera nem apaga dados.
ALTER TABLE public.lesson DROP CONSTRAINT IF EXISTS lesson_student_fk_fkey;
ALTER TABLE public.lesson ADD CONSTRAINT lesson_student_fk_fkey
  FOREIGN KEY (student_fk) REFERENCES public.student(idstudent) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
