-- Desfaz a etapa 4 (biblioteca de materiais).
-- ATENÇÃO: apaga o cadastro dos materiais e os compartilhamentos. Os ARQUIVOS enviados no bucket
-- 'materials' NÃO são apagados por este script (apague-os em Storage, se quiser).
DROP POLICY IF EXISTS materials_teacher_all ON storage.objects;
DROP POLICY IF EXISTS materials_student_read ON storage.objects;
DROP TABLE IF EXISTS public.lesson_material;
DROP TABLE IF EXISTS public.material_share;
DROP TABLE IF EXISTS public.material;
DROP FUNCTION IF EXISTS public.material_is_mine(uuid);
DROP FUNCTION IF EXISTS public.material_shared_with_me(uuid);
