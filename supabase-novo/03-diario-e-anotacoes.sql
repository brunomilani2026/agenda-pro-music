-- Etapa 2 da Gestão 360° do aluno: diário de aula e anotações.
-- SOMENTE ADIÇÕES: nenhuma tabela, coluna ou dado existente é alterado.
-- Para desfazer: rode 03-desfazer.sql.
-- A privacidade é garantida AQUI, no banco (RLS), não só na tela.

-- ---------------------------------------------------------------------------
-- Função que mantém o "atualizado em"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) Registro pedagógico de uma aula (um por aula, sem duplicar)
--    Acesso: SOMENTE o professor dono (e admin). O aluno NÃO lê esta tabela;
--    ele lê só a visão lesson_record_shared (mais abaixo), sem campos privados.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_record (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idlesson_fk uuid NOT NULL,
  idstudent_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,                 -- professor dono
  content_worked text,                      -- conteúdo trabalhado
  objectives text,                          -- objetivos da aula
  exercises text,                           -- exercícios realizados
  difficulties text,                        -- dificuldades observadas
  progress text,                            -- evolução percebida
  homework text,                            -- atividades para casa
  next_plan text,                           -- conteúdo planejado para a próxima aula
  shared_note text,                         -- observação compartilhada com o aluno
  private_note text,                        -- observação PRIVADA do professor
  share_with_student boolean DEFAULT false NOT NULL,  -- libera conteúdo, tarefa, próxima aula e nota compartilhada ao aluno
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by uuid,
  CONSTRAINT lesson_record_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_record_lesson_uniq UNIQUE (idlesson_fk),
  CONSTRAINT lesson_record_lesson_fk FOREIGN KEY (idlesson_fk) REFERENCES public.lesson(idlesson) ON DELETE CASCADE,
  CONSTRAINT lesson_record_student_fk FOREIGN KEY (idstudent_fk) REFERENCES public.student(idstudent) ON DELETE CASCADE,
  CONSTRAINT lesson_record_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lesson_record_student_idx ON public.lesson_record (idstudent_fk, created_at DESC);

DROP TRIGGER IF EXISTS lesson_record_touch ON public.lesson_record;
CREATE TRIGGER lesson_record_touch BEFORE UPDATE ON public.lesson_record
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.lesson_record ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_record_owner ON public.lesson_record;
CREATE POLICY lesson_record_owner ON public.lesson_record AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (
    is_admin() OR (
      idusers_fk = auth.uid()
      AND EXISTS (SELECT 1 FROM public.lesson l WHERE l.idlesson = idlesson_fk AND l.idusers_fk = auth.uid())
      AND EXISTS (SELECT 1 FROM public.student s WHERE s.idstudent = idstudent_fk AND s.idusers_fk = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Anotações com três níveis de visibilidade
--    professor_privada : só o professor
--    compartilhada     : professor e aluno (escrita pelo professor)
--    aluno_pessoal     : só o aluno (o professor NÃO vê)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_note (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idstudent_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,                 -- professor dono do aluno
  author_id uuid NOT NULL,                  -- quem escreveu (professor ou conta do aluno)
  visibility text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT student_note_pkey PRIMARY KEY (id),
  CONSTRAINT student_note_visibility_chk CHECK (visibility IN ('professor_privada', 'compartilhada', 'aluno_pessoal')),
  CONSTRAINT student_note_body_chk CHECK (length(btrim(body)) > 0 AND length(body) <= 5000),
  CONSTRAINT student_note_student_fk FOREIGN KEY (idstudent_fk) REFERENCES public.student(idstudent) ON DELETE CASCADE,
  CONSTRAINT student_note_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE,
  CONSTRAINT student_note_author_fk FOREIGN KEY (author_id) REFERENCES public.users(idusers) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS student_note_student_idx ON public.student_note (idstudent_fk, created_at DESC);

DROP TRIGGER IF EXISTS student_note_touch ON public.student_note;
CREATE TRIGGER student_note_touch BEFORE UPDATE ON public.student_note
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.student_note ENABLE ROW LEVEL SECURITY;

-- Professor: vê e escreve privadas e compartilhadas DOS SEUS alunos; nunca as pessoais do aluno.
DROP POLICY IF EXISTS student_note_teacher ON public.student_note;
CREATE POLICY student_note_teacher ON public.student_note AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() AND visibility IN ('professor_privada', 'compartilhada'))
  WITH CHECK (
    idusers_fk = auth.uid() AND author_id = auth.uid()
    AND visibility IN ('professor_privada', 'compartilhada')
    AND EXISTS (SELECT 1 FROM public.student s WHERE s.idstudent = idstudent_fk AND s.idusers_fk = auth.uid())
  );

-- Aluno: lê as compartilhadas e as pessoais dele.
DROP POLICY IF EXISTS student_note_student_read ON public.student_note;
CREATE POLICY student_note_student_read ON public.student_note AS PERMISSIVE FOR SELECT TO authenticated
  USING (idstudent_fk IN (SELECT my_student_ids()) AND visibility IN ('compartilhada', 'aluno_pessoal'));

-- Aluno: escreve/edita/apaga SÓ as pessoais dele.
DROP POLICY IF EXISTS student_note_student_write ON public.student_note;
CREATE POLICY student_note_student_write ON public.student_note AS PERMISSIVE FOR ALL TO authenticated
  USING (idstudent_fk IN (SELECT my_student_ids()) AND visibility = 'aluno_pessoal' AND author_id = auth.uid())
  WITH CHECK (
    idstudent_fk IN (SELECT my_student_ids()) AND visibility = 'aluno_pessoal' AND author_id = auth.uid()
    AND idusers_fk IN (SELECT my_teacher_ids())
  );

-- Admin da plataforma: apenas as que não são pessoais do aluno.
DROP POLICY IF EXISTS student_note_admin ON public.student_note;
CREATE POLICY student_note_admin ON public.student_note AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin() AND visibility IN ('professor_privada', 'compartilhada'))
  WITH CHECK (is_admin() AND visibility IN ('professor_privada', 'compartilhada'));

-- ---------------------------------------------------------------------------
-- 3) Visão para o aluno: só o que o professor liberou, sem campos privados.
--    (RLS não esconde colunas; por isso o aluno nunca lê lesson_record direto.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.lesson_record_shared WITH (security_invoker = false) AS
SELECT
  r.idlesson_fk,
  r.idstudent_fk,
  l.date,
  l.starttime,
  l.instrument,
  r.content_worked,
  r.homework,
  r.next_plan,
  r.shared_note,
  r.updated_at
FROM public.lesson_record r
JOIN public.lesson l ON l.idlesson = r.idlesson_fk
WHERE r.share_with_student
  AND r.idstudent_fk IN (SELECT public.my_student_ids());

-- ---------------------------------------------------------------------------
-- Permissões: só usuários logados (nunca o acesso anônimo)
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.lesson_record FROM anon, PUBLIC;
REVOKE ALL ON public.student_note FROM anon, PUBLIC;
REVOKE ALL ON public.lesson_record_shared FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_record TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_note TO authenticated;
GRANT SELECT ON public.lesson_record_shared TO authenticated;
