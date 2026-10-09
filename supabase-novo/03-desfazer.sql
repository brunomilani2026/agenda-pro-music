-- Desfaz a etapa 2 (diário de aula e anotações). Apaga SOMENTE o que ela criou.
-- ATENÇÃO: apaga os registros e anotações já digitados. Só rode se tiver certeza.
DROP VIEW IF EXISTS public.lesson_record_shared;
DROP TABLE IF EXISTS public.student_note;
DROP TABLE IF EXISTS public.lesson_record;
-- A função touch_updated_at é inofensiva e pode ficar; para remover também:
-- DROP FUNCTION IF EXISTS public.touch_updated_at();
