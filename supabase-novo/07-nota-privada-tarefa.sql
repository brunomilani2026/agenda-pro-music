-- "Para a próxima aula (só para o professor)": nota privada ligada à tarefa.
-- Tabela à parte (e não coluna em task) porque o aluno lê as próprias linhas de task:
-- aqui NÃO existe política de leitura para o aluno, só para o professor dono (e admin).
CREATE TABLE IF NOT EXISTS public.task_teacher_note (
  task_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,
  note text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT task_teacher_note_pkey PRIMARY KEY (task_fk),
  CONSTRAINT task_teacher_note_task_fk FOREIGN KEY (task_fk) REFERENCES public.task(id) ON DELETE CASCADE,
  CONSTRAINT task_teacher_note_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE,
  CONSTRAINT task_teacher_note_len CHECK (char_length(note) <= 1000)
);
ALTER TABLE public.task_teacher_note ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_teacher_note_owner ON public.task_teacher_note;
CREATE POLICY task_teacher_note_owner ON public.task_teacher_note AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (is_admin() OR (idusers_fk = auth.uid() AND public.task_is_mine(task_fk)));
