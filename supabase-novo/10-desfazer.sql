-- Desfaz a etapa 10: remove a marca de teste. (As faturas canceladas e o status do aluno NÃO são revertidos automaticamente.)
UPDATE public.student SET is_test = false WHERE is_test = true;
ALTER TABLE public.student DROP COLUMN IF EXISTS is_test;
NOTIFY pgrst, 'reload schema';
