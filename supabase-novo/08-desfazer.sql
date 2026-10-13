-- Desfaz a etapa 8 (volta a regra anterior, em que o aluno podia editar a própria linha toda).
DROP TRIGGER IF EXISTS student_guard_self_update ON public.student;
DROP FUNCTION IF EXISTS public.student_guard_self_update();
