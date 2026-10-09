-- Etapa 4 da Gestão 360° do aluno: biblioteca de materiais.
-- SOMENTE ADIÇÕES. Para desfazer: 05-desfazer.sql. Requer a etapa 2 (função touch_updated_at).
--
-- Um MATERIAL é cadastrado uma vez (arquivo, link ou YouTube) e pode ser:
--   - compartilhado com VÁRIOS alunos (material_share) sem duplicar o arquivo;
--   - usado em VÁRIAS aulas (lesson_material).
-- Por padrão o material é privado (só o professor). O aluno só acessa o que foi compartilhado com ele.
-- Os arquivos ficam num bucket PRIVADO: ninguém acessa por endereço direto, só por link temporário.

-- ---------------------------------------------------------------------------
-- Bucket privado (50 MB por arquivo; só tipos aceitos)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'materials', 'materials', false, 52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/webm',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.material (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idusers_fk uuid NOT NULL,                 -- professor dono
  kind text NOT NULL,                       -- arquivo | link | youtube
  title text NOT NULL,
  description text,
  category text,                            -- partitura, tablatura, cifra, exercício, áudio, vídeo...
  instrument text,                          -- texto livre (não presume cavaquinho)
  level text,
  content_tag text,                         -- conteúdo/tema ao qual se relaciona
  url text,                                 -- para link/youtube
  storage_path text,                        -- para arquivo: <id do professor>/<uuid>-<nome>
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT material_pkey PRIMARY KEY (id),
  CONSTRAINT material_kind_chk CHECK (kind IN ('arquivo', 'link', 'youtube')),
  CONSTRAINT material_title_chk CHECK (length(btrim(title)) > 0 AND length(title) <= 160),
  CONSTRAINT material_fonte_chk CHECK (
    (kind = 'arquivo' AND storage_path IS NOT NULL AND url IS NULL)
    OR (kind IN ('link', 'youtube') AND url IS NOT NULL AND storage_path IS NULL)
  ),
  CONSTRAINT material_url_chk CHECK (url IS NULL OR (url ~* '^https?://' AND length(url) <= 2000)),
  CONSTRAINT material_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS material_owner_idx ON public.material (idusers_fk, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS material_storage_path_uniq ON public.material (storage_path) WHERE storage_path IS NOT NULL;

-- Compartilhamento: um material, vários alunos (sem duplicar o arquivo)
CREATE TABLE IF NOT EXISTS public.material_share (
  material_fk uuid NOT NULL,
  idstudent_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,
  shared_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT material_share_pkey PRIMARY KEY (material_fk, idstudent_fk),
  CONSTRAINT material_share_material_fk FOREIGN KEY (material_fk) REFERENCES public.material(id) ON DELETE CASCADE,
  CONSTRAINT material_share_student_fk FOREIGN KEY (idstudent_fk) REFERENCES public.student(idstudent) ON DELETE CASCADE,
  CONSTRAINT material_share_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS material_share_student_idx ON public.material_share (idstudent_fk);

-- Uso em aulas: um material, várias aulas
CREATE TABLE IF NOT EXISTS public.lesson_material (
  lesson_fk uuid NOT NULL,
  material_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT lesson_material_pkey PRIMARY KEY (lesson_fk, material_fk),
  CONSTRAINT lesson_material_lesson_fk FOREIGN KEY (lesson_fk) REFERENCES public.lesson(idlesson) ON DELETE CASCADE,
  CONSTRAINT lesson_material_material_fk FOREIGN KEY (material_fk) REFERENCES public.material(id) ON DELETE CASCADE,
  CONSTRAINT lesson_material_user_fk FOREIGN KEY (idusers_fk) REFERENCES public.users(idusers) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lesson_material_material_idx ON public.lesson_material (material_fk);

DROP TRIGGER IF EXISTS material_touch ON public.material;
CREATE TRIGGER material_touch BEFORE UPDATE ON public.material
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_share ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_material ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Regras de acesso das tabelas
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS material_owner ON public.material;
CREATE POLICY material_owner ON public.material AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (
    is_admin() OR (
      idusers_fk = auth.uid()
      AND (kind <> 'arquivo' OR storage_path LIKE (auth.uid()::text || '/%'))
    )
  );

-- Aluno: só lê os materiais compartilhados com ele
DROP POLICY IF EXISTS material_student_read ON public.material;
CREATE POLICY material_student_read ON public.material AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.material_share s WHERE s.material_fk = id AND s.idstudent_fk IN (SELECT my_student_ids())));

DROP POLICY IF EXISTS material_share_owner ON public.material_share;
CREATE POLICY material_share_owner ON public.material_share AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (is_admin() OR (
    idusers_fk = auth.uid()
    AND EXISTS (SELECT 1 FROM public.material m WHERE m.id = material_fk AND m.idusers_fk = auth.uid())
    AND EXISTS (SELECT 1 FROM public.student st WHERE st.idstudent = idstudent_fk AND st.idusers_fk = auth.uid())
  ));

DROP POLICY IF EXISTS material_share_student_read ON public.material_share;
CREATE POLICY material_share_student_read ON public.material_share AS PERMISSIVE FOR SELECT TO authenticated
  USING (idstudent_fk IN (SELECT my_student_ids()));

DROP POLICY IF EXISTS lesson_material_owner ON public.lesson_material;
CREATE POLICY lesson_material_owner ON public.lesson_material AS PERMISSIVE FOR ALL TO authenticated
  USING (idusers_fk = auth.uid() OR is_admin())
  WITH CHECK (is_admin() OR (
    idusers_fk = auth.uid()
    AND EXISTS (SELECT 1 FROM public.material m WHERE m.id = material_fk AND m.idusers_fk = auth.uid())
    AND EXISTS (SELECT 1 FROM public.lesson l WHERE l.idlesson = lesson_fk AND l.idusers_fk = auth.uid())
  ));

REVOKE ALL ON public.material, public.material_share, public.lesson_material FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material, public.material_share, public.lesson_material TO authenticated;

-- ---------------------------------------------------------------------------
-- Regras de acesso aos ARQUIVOS (storage): bucket 'materials'
--   Professor: só a própria pasta (<id do professor>/...).
--   Aluno: só o arquivo de material compartilhado com ele (leitura).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS materials_teacher_all ON storage.objects;
CREATE POLICY materials_teacher_all ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
  USING (bucket_id = 'materials' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'materials' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS materials_student_read ON storage.objects;
CREATE POLICY materials_student_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    bucket_id = 'materials'
    AND EXISTS (
      SELECT 1 FROM public.material m
      JOIN public.material_share s ON s.material_fk = m.id
      WHERE m.storage_path = name AND s.idstudent_fk IN (SELECT my_student_ids())
    )
  );

NOTIFY pgrst, 'reload schema';
