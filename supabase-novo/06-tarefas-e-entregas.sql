-- Etapa 5 da Gestão 360° do aluno: tarefas e entregas.
-- SOMENTE ADIÇÕES. Para desfazer: 06-desfazer.sql.
-- Requer as etapas 2 (touch_updated_at) e 4 (material, material_is_mine).
--
-- O professor cria TAREFAS para um aluno (com prazo e materiais de apoio). O aluno faz ENTREGAS
-- (arquivo ou link) e o professor responde com FEEDBACK em cada entrega. Os arquivos ficam num
-- bucket PRIVADO 'entregas': só o aluno que enviou e o professor dele têm acesso.
-- O status (pendente, atrasada, entregue, com retorno, concluída) é calculado pelo sistema.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'entregas', 'entregas', false, 52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/webm',
    'video/mp4', 'video/quicktime', 'video/webm',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.task (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idusers_fk uuid NOT NULL,                 -- professor
  idstudent_fk uuid NOT NULL,
  title text NOT NULL,
  description text,
  due_date date,                            -- prazo sugerido
  status text DEFAULT 'aberta' NOT NULL,    -- aberta | concluida (só o professor muda)
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT task_pkey PRIMARY KEY (id),
  CONSTRAINT task_status_chk CHECK (status IN ('aberta', 'concluida')),
  CONSTRAINT task_title_chk CHECK (length(btrim(title)) > 0 AND length(title) <= 160),
  CONSTRAINT task_desc_chk CHECK (description IS NULL OR length(description) <= 5000),
  CONSTRAINT task_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE,
  CONSTRAINT task_student_fk FOREIGN KEY (idstudent_fk) REFERENCES public.student(idstudent) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS task_owner_idx ON public.task (idusers_fk, status, due_date);
CREATE INDEX IF NOT EXISTS task_student_idx ON public.task (idstudent_fk, created_at DESC);

CREATE TABLE IF NOT EXISTS public.task_material (
  task_fk uuid NOT NULL,
  material_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,
  CONSTRAINT task_material_pkey PRIMARY KEY (task_fk, material_fk),
  CONSTRAINT task_material_task_fk FOREIGN KEY (task_fk) REFERENCES public.task(id) ON DELETE CASCADE,
  CONSTRAINT task_material_material_fk FOREIGN KEY (material_fk) REFERENCES public.material(id) ON DELETE CASCADE,
  CONSTRAINT task_material_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_submission (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  task_fk uuid NOT NULL,
  idstudent_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,                 -- professor
  note text,                                -- observação do aluno
  kind text NOT NULL,                       -- arquivo | link
  storage_path text,                        -- <id do professor>/<id do aluno>/<uuid>-<nome>
  file_name text,
  mime_type text,
  size_bytes bigint,
  url text,
  feedback text,                            -- retorno do professor (só ele escreve)
  feedback_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT task_submission_pkey PRIMARY KEY (id),
  CONSTRAINT task_submission_kind_chk CHECK (kind IN ('arquivo', 'link')),
  CONSTRAINT task_submission_fonte_chk CHECK (
    (kind = 'arquivo' AND storage_path IS NOT NULL AND url IS NULL)
    OR (kind = 'link' AND url IS NOT NULL AND storage_path IS NULL)
  ),
  CONSTRAINT task_submission_url_chk CHECK (url IS NULL OR (url ~* '^https?://' AND length(url) <= 2000)),
  CONSTRAINT task_submission_note_chk CHECK (note IS NULL OR length(note) <= 5000),
  CONSTRAINT task_submission_feedback_chk CHECK (feedback IS NULL OR length(feedback) <= 5000),
  CONSTRAINT task_submission_task_fk FOREIGN KEY (task_fk) REFERENCES public.task(id) ON DELETE CASCADE,
  CONSTRAINT task_submission_student_fk FOREIGN KEY (idstudent_fk) REFERENCES public.student(idstudent) ON DELETE CASCADE,
  CONSTRAINT task_submission_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS task_submission_task_idx ON public.task_submission (task_fk, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS task_submission_path_uniq ON public.task_submission (storage_path) WHERE storage_path IS NOT NULL;

DROP TRIGGER IF EXISTS task_touch ON public.task;
CREATE TRIGGER task_touch BEFORE UPDATE ON public.task FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.task ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_submission ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Funções internas (SECURITY DEFINER): evitam recursão entre regras de tabelas diferentes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.task_is_mine(tid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.task WHERE id = tid AND idusers_fk = auth.uid()) $$;

-- A tarefa é DESTE aluno (e está aberta)? Usada para o aluno poder entregar.
CREATE OR REPLACE FUNCTION public.task_open_for_student(tid uuid, sid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.task WHERE id = tid AND idstudent_fk = sid AND status = 'aberta') $$;

CREATE OR REPLACE FUNCTION public.task_is_for_me(tid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.task WHERE id = tid AND idstudent_fk IN (SELECT public.my_student_ids())) $$;

REVOKE ALL ON FUNCTION public.task_is_mine(uuid), public.task_open_for_student(uuid, uuid), public.task_is_for_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_is_mine(uuid), public.task_open_for_student(uuid, uuid), public.task_is_for_me(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Regras de acesso das tabelas
-- ---------------------------------------------------------------------------
-- task: professor tudo (nos seus alunos); aluno SÓ lê as próprias.
DROP POLICY IF EXISTS task_owner ON public.task;
CREATE POLICY task_owner ON public.task AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (is_admin() OR (
    idusers_fk = auth.uid()
    AND EXISTS (SELECT 1 FROM public.student s WHERE s.idstudent = idstudent_fk AND s.idusers_fk = auth.uid())
  ));
DROP POLICY IF EXISTS task_student_read ON public.task;
CREATE POLICY task_student_read ON public.task AS PERMISSIVE FOR SELECT TO authenticated
  USING (idstudent_fk IN (SELECT my_student_ids()));

-- task_material: professor tudo; aluno lê os materiais de apoio das próprias tarefas.
DROP POLICY IF EXISTS task_material_owner ON public.task_material;
CREATE POLICY task_material_owner ON public.task_material AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (is_admin() OR (idusers_fk = auth.uid() AND public.task_is_mine(task_fk) AND public.material_is_mine(material_fk)));
DROP POLICY IF EXISTS task_material_student_read ON public.task_material;
CREATE POLICY task_material_student_read ON public.task_material AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.task_is_for_me(task_fk));

-- task_submission: professor lê e responde; aluno lê as próprias, cria e (antes do retorno) apaga as próprias.
DROP POLICY IF EXISTS task_submission_owner ON public.task_submission;
CREATE POLICY task_submission_owner ON public.task_submission AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (is_admin() OR (idusers_fk = auth.uid() AND public.task_is_mine(task_fk)));

DROP POLICY IF EXISTS task_submission_student_read ON public.task_submission;
CREATE POLICY task_submission_student_read ON public.task_submission AS PERMISSIVE FOR SELECT TO authenticated
  USING (idstudent_fk IN (SELECT my_student_ids()));

DROP POLICY IF EXISTS task_submission_student_insert ON public.task_submission;
CREATE POLICY task_submission_student_insert ON public.task_submission AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    idstudent_fk IN (SELECT my_student_ids())
    AND idusers_fk IN (SELECT my_teacher_ids())
    AND public.task_open_for_student(task_fk, idstudent_fk)
    AND feedback IS NULL AND feedback_at IS NULL
    AND (storage_path IS NULL OR storage_path LIKE (idusers_fk::text || '/' || idstudent_fk::text || '/%'))
  );

DROP POLICY IF EXISTS task_submission_student_delete ON public.task_submission;
CREATE POLICY task_submission_student_delete ON public.task_submission AS PERMISSIVE FOR DELETE TO authenticated
  USING (idstudent_fk IN (SELECT my_student_ids()) AND feedback_at IS NULL);

REVOKE ALL ON public.task, public.task_material, public.task_submission FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task, public.task_material, public.task_submission TO authenticated;

-- ---------------------------------------------------------------------------
-- Regras dos ARQUIVOS (bucket 'entregas'): <id do professor>/<id do aluno>/<arquivo>
--   Professor: a própria pasta. Aluno: só a pasta dele dentro da pasta do professor dele.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS entregas_teacher_all ON storage.objects;
CREATE POLICY entregas_teacher_all ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
  USING (bucket_id = 'entregas' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'entregas' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS entregas_student_rw ON storage.objects;
CREATE POLICY entregas_student_rw ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
  USING (
    bucket_id = 'entregas'
    AND (storage.foldername(name))[1] IN (SELECT my_teacher_ids()::text)
    AND (storage.foldername(name))[2] IN (SELECT my_student_ids()::text)
  )
  WITH CHECK (
    bucket_id = 'entregas'
    AND (storage.foldername(name))[1] IN (SELECT my_teacher_ids()::text)
    AND (storage.foldername(name))[2] IN (SELECT my_student_ids()::text)
  );

NOTIFY pgrst, 'reload schema';
