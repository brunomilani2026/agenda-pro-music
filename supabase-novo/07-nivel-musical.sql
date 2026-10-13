-- Etapa 7: nível musical do aluno. Só ACRESCENTA uma coluna e uma trava; não altera nem apaga dados.
-- Quem define o nível é o professor do aluno (ou o admin). Se o próprio aluno tentar mudar, a mudança é ignorada.
ALTER TABLE public.student ADD COLUMN IF NOT EXISTS music_level text;
ALTER TABLE public.student DROP CONSTRAINT IF EXISTS student_music_level_chk;
ALTER TABLE public.student ADD CONSTRAINT student_music_level_chk
  CHECK (music_level IS NULL OR music_level IN ('iniciante', 'basico', 'intermediario', 'avancado'));

CREATE OR REPLACE FUNCTION public.student_guard_music_level()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.music_level IS DISTINCT FROM OLD.music_level
     AND auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM OLD.idusers_fk
     AND NOT is_admin() THEN
    NEW.music_level := OLD.music_level;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS student_guard_music_level ON public.student;
CREATE TRIGGER student_guard_music_level BEFORE UPDATE ON public.student
  FOR EACH ROW EXECUTE FUNCTION public.student_guard_music_level();

NOTIFY pgrst, 'reload schema';
