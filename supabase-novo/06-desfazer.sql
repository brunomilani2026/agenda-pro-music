-- Desfaz a etapa 5 (tarefas e entregas).
-- ATENÇÃO: apaga tarefas, entregas e retornos. Os ARQUIVOS do bucket 'entregas' NÃO são apagados
-- por este script (apague-os em Storage, se quiser).
DROP POLICY IF EXISTS entregas_teacher_all ON storage.objects;
DROP POLICY IF EXISTS entregas_student_rw ON storage.objects;
DROP TABLE IF EXISTS public.task_submission;
DROP TABLE IF EXISTS public.task_material;
DROP TABLE IF EXISTS public.task;
DROP FUNCTION IF EXISTS public.task_is_mine(uuid);
DROP FUNCTION IF EXISTS public.task_open_for_student(uuid, uuid);
DROP FUNCTION IF EXISTS public.task_is_for_me(uuid);
