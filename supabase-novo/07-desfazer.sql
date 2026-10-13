-- Desfaz a etapa 7 (nível musical). Apaga só a coluna music_level.
DROP TRIGGER IF EXISTS student_guard_music_level ON public.student;
DROP FUNCTION IF EXISTS public.student_guard_music_level();
ALTER TABLE public.student DROP CONSTRAINT IF EXISTS student_music_level_chk;
ALTER TABLE public.student DROP COLUMN IF EXISTS music_level;
NOTIFY pgrst, 'reload schema';
