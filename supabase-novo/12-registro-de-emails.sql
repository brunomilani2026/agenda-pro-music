-- Etapa 12: registro dos e-mails enviados aos alunos. Só ACRESCENTA uma tabela; não altera nada existente.
-- Quem grava é o servidor (nenhuma regra de escrita para usuários). O professor lê só os e-mails dos SEUS alunos; o aluno não lê nada.
CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idstudent_fk uuid NOT NULL,
  idusers_fk uuid,                          -- professor dono do aluno
  to_email text,
  tipo text NOT NULL DEFAULT 'outros',      -- aula | pagamento | atraso | tarefa | manual | outros
  title text NOT NULL,
  message text,
  button_label text,
  button_url text,
  status text NOT NULL,                     -- enviado | falhou
  fail_reason text,
  fail_detail text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT email_log_pkey PRIMARY KEY (id),
  CONSTRAINT email_log_status_chk CHECK (status IN ('enviado', 'falhou')),
  CONSTRAINT email_log_student_fk FOREIGN KEY (idstudent_fk) REFERENCES public.student(idstudent) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS email_log_student_idx ON public.email_log (idstudent_fk, created_at DESC);
CREATE INDEX IF NOT EXISTS email_log_owner_idx ON public.email_log (idusers_fk, created_at DESC);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_log_owner_read ON public.email_log;
CREATE POLICY email_log_owner_read ON public.email_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin());

REVOKE ALL ON public.email_log FROM anon, PUBLIC;
GRANT SELECT ON public.email_log TO authenticated;

NOTIFY pgrst, 'reload schema';
