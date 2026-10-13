-- Etapa 11: "material para todos os alunos". Material marcado (for_all_students) é compartilhado automaticamente com todo aluno
-- NOVO do professor (cadastro novo, aluno que passa a ser seu, ou aluno reativado). Só acrescenta; não apaga nada.
ALTER TABLE public.material ADD COLUMN IF NOT EXISTS for_all_students boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.share_general_materials_with_student()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.idusers_fk IS NOT NULL AND COALESCE(NEW.status, 'ativo') IN ('ativo', 'bloqueado') THEN
    INSERT INTO public.material_share (material_fk, idstudent_fk, idusers_fk)
    SELECT m.id, NEW.idstudent, m.idusers_fk
    FROM public.material m
    WHERE m.idusers_fk = NEW.idusers_fk AND m.for_all_students
    ON CONFLICT (material_fk, idstudent_fk) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS student_general_materials_ins ON public.student;
CREATE TRIGGER student_general_materials_ins AFTER INSERT ON public.student
  FOR EACH ROW EXECUTE FUNCTION public.share_general_materials_with_student();

DROP TRIGGER IF EXISTS student_general_materials_upd ON public.student;
CREATE TRIGGER student_general_materials_upd AFTER UPDATE OF idusers_fk, status ON public.student
  FOR EACH ROW WHEN (OLD.idusers_fk IS DISTINCT FROM NEW.idusers_fk OR OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.share_general_materials_with_student();

-- O material já cadastrado ("Material disponível para todos os alunos") passa a valer para os novos.
UPDATE public.material SET for_all_students = true
WHERE id = '76e81e3d-3aaf-4216-92f7-dca1fac59747' AND title = 'Material disponível para todos os alunos';

NOTIFY pgrst, 'reload schema';
