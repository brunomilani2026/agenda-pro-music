-- Desfaz a etapa 11. Os compartilhamentos já feitos não são retirados.
DROP TRIGGER IF EXISTS student_general_materials_ins ON public.student;
DROP TRIGGER IF EXISTS student_general_materials_upd ON public.student;
DROP FUNCTION IF EXISTS public.share_general_materials_with_student();
ALTER TABLE public.material DROP COLUMN IF EXISTS for_all_students;
NOTIFY pgrst, 'reload schema';
