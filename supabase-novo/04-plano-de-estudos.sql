-- Etapa 3 da Gestão 360° do aluno: plano de estudos (trilhas, módulos, conteúdos).
-- SOMENTE ADIÇÕES: nada existente é alterado. Para desfazer: 04-desfazer.sql.
-- Requer a etapa 2 já aplicada (usa a função public.touch_updated_at()).
--
-- Modelo: o professor monta TRILHAS (modelo). Ao aplicar uma trilha a um aluno, os conteúdos
-- são COPIADOS para student_study_item. Assim o plano de um aluno pode ser personalizado
-- sem afetar a trilha nem os outros alunos, e editar a trilha depois não muda ninguém sozinho.

CREATE TABLE IF NOT EXISTS public.study_track (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idusers_fk uuid NOT NULL,                 -- professor dono
  name text NOT NULL,
  description text,
  instrument text,                          -- texto livre (não presume cavaquinho)
  level text,                               -- ex.: iniciante, intermediário, avançado
  archived boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT study_track_pkey PRIMARY KEY (id),
  CONSTRAINT study_track_name_chk CHECK (length(btrim(name)) > 0 AND length(name) <= 120),
  CONSTRAINT study_track_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS study_track_owner_idx ON public.study_track (idusers_fk, archived, created_at DESC);

CREATE TABLE IF NOT EXISTS public.study_module (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  track_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,
  title text NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT study_module_pkey PRIMARY KEY (id),
  CONSTRAINT study_module_title_chk CHECK (length(btrim(title)) > 0 AND length(title) <= 120),
  CONSTRAINT study_module_track_fk FOREIGN KEY (track_fk) REFERENCES public.study_track(id) ON DELETE CASCADE,
  CONSTRAINT study_module_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS study_module_track_idx ON public.study_module (track_fk, position);

CREATE TABLE IF NOT EXISTS public.study_item (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  module_fk uuid NOT NULL,
  track_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,
  title text NOT NULL,
  description text,
  objective text,                           -- objetivo do conteúdo
  difficulty smallint DEFAULT 1 NOT NULL,   -- 1 iniciante, 2 intermediário, 3 avançado
  competency text,                          -- competência trabalhada (ritmo, harmonia, leitura...)
  position integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT study_item_pkey PRIMARY KEY (id),
  CONSTRAINT study_item_title_chk CHECK (length(btrim(title)) > 0 AND length(title) <= 160),
  CONSTRAINT study_item_difficulty_chk CHECK (difficulty BETWEEN 1 AND 3),
  CONSTRAINT study_item_module_fk FOREIGN KEY (module_fk) REFERENCES public.study_module(id) ON DELETE CASCADE,
  CONSTRAINT study_item_track_fk FOREIGN KEY (track_fk) REFERENCES public.study_track(id) ON DELETE CASCADE,
  CONSTRAINT study_item_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS study_item_module_idx ON public.study_item (module_fk, position);

-- Cópia individual do aluno (é aqui que ficam status, ordem e personalizações)
CREATE TABLE IF NOT EXISTS public.student_study_item (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idstudent_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,                 -- professor dono do aluno
  source_item_fk uuid,                      -- conteúdo de origem na trilha (nulo = criado só para este aluno)
  track_name text NOT NULL,
  module_title text NOT NULL,
  title text NOT NULL,
  description text,
  objective text,
  difficulty smallint DEFAULT 1 NOT NULL,
  competency text,
  position integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'nao_iniciado' NOT NULL,
  status_changed_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT student_study_item_pkey PRIMARY KEY (id),
  CONSTRAINT student_study_item_status_chk CHECK (status IN ('nao_iniciado', 'planejado', 'em_andamento', 'em_revisao', 'concluido')),
  CONSTRAINT student_study_item_title_chk CHECK (length(btrim(title)) > 0 AND length(title) <= 160),
  CONSTRAINT student_study_item_difficulty_chk CHECK (difficulty BETWEEN 1 AND 3),
  CONSTRAINT student_study_item_student_fk FOREIGN KEY (idstudent_fk) REFERENCES public.student(idstudent) ON DELETE CASCADE,
  CONSTRAINT student_study_item_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE,
  CONSTRAINT student_study_item_source_fk FOREIGN KEY (source_item_fk) REFERENCES public.study_item(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS student_study_item_student_idx ON public.student_study_item (idstudent_fk, track_name, module_title, position);
-- Aplicar a mesma trilha duas vezes não duplica: só entram os conteúdos que ainda faltam.
CREATE UNIQUE INDEX IF NOT EXISTS student_study_item_source_uniq ON public.student_study_item (idstudent_fk, source_item_fk) WHERE source_item_fk IS NOT NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['study_track', 'study_module', 'study_item', 'student_study_item'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t || '_touch', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Regras de acesso. Professor: só o que é dele. Aluno: SÓ LÊ o próprio plano.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS study_track_owner ON public.study_track;
CREATE POLICY study_track_owner ON public.study_track AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (idusers_fk = auth.uid() OR is_admin());

DROP POLICY IF EXISTS study_module_owner ON public.study_module;
CREATE POLICY study_module_owner ON public.study_module AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (is_admin() OR (
    idusers_fk = auth.uid()
    AND EXISTS (SELECT 1 FROM public.study_track t WHERE t.id = track_fk AND t.idusers_fk = auth.uid())
  ));

DROP POLICY IF EXISTS study_item_owner ON public.study_item;
CREATE POLICY study_item_owner ON public.study_item AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (is_admin() OR (
    idusers_fk = auth.uid()
    AND EXISTS (SELECT 1 FROM public.study_module m WHERE m.id = module_fk AND m.track_fk = study_item.track_fk AND m.idusers_fk = auth.uid())
  ));

DROP POLICY IF EXISTS student_study_item_owner ON public.student_study_item;
CREATE POLICY student_study_item_owner ON public.student_study_item AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (is_admin() OR (
    idusers_fk = auth.uid()
    AND EXISTS (SELECT 1 FROM public.student s WHERE s.idstudent = idstudent_fk AND s.idusers_fk = auth.uid())
  ));

DROP POLICY IF EXISTS student_study_item_student_read ON public.student_study_item;
CREATE POLICY student_study_item_student_read ON public.student_study_item AS PERMISSIVE FOR SELECT TO authenticated
  USING (idstudent_fk IN (SELECT my_student_ids()));

-- Permissões: só usuários logados
REVOKE ALL ON public.study_track, public.study_module, public.study_item, public.student_study_item FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_track, public.study_module, public.study_item, public.student_study_item TO authenticated;
