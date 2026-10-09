-- Desfaz a etapa 3 (plano de estudos). Apaga SOMENTE o que ela criou.
-- ATENÇÃO: apaga as trilhas e os planos de estudo dos alunos já montados.
DROP TABLE IF EXISTS public.student_study_item;
DROP TABLE IF EXISTS public.study_item;
DROP TABLE IF EXISTS public.study_module;
DROP TABLE IF EXISTS public.study_track;
