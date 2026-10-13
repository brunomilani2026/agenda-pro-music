-- Teste da etapa 11. Rode DEPOIS de 11-material-para-todos.sql. Não deixa nada gravado (termina com erro de propósito).
DO $$
DECLARE
  t_id uuid; mat uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  n int; total int := 0; passou int := 0; falhas text := '';
BEGIN
  SELECT idusers_fk INTO t_id FROM public.student WHERE idusers_fk IS NOT NULL LIMIT 1;
  IF t_id IS NULL THEN RAISE EXCEPTION 'RESULTADO: sem dados para testar.'; END IF;

  INSERT INTO public.material (id, idusers_fk, kind, title, url, for_all_students) VALUES (mat, t_id, 'link', 'MATERIAL TESTE GERAL', 'https://exemplo.com', true);

  INSERT INTO public.student (idstudent, name, idusers_fk, status) VALUES (a, 'ALUNO NOVO ATIVO', t_id, 'ativo');
  SELECT count(*) INTO n FROM public.material_share WHERE material_fk = mat AND idstudent_fk = a;
  total := total + 1; IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno novo não recebeu o material]'; END IF;

  INSERT INTO public.student (idstudent, name, idusers_fk, status) VALUES (b, 'ALUNO NOVO INATIVO', t_id, 'inativo');
  SELECT count(*) INTO n FROM public.material_share WHERE material_fk = mat AND idstudent_fk = b;
  total := total + 1; IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno inativo recebeu o material]'; END IF;

  UPDATE public.student SET status = 'ativo' WHERE idstudent = b;
  SELECT count(*) INTO n FROM public.material_share WHERE material_fk = mat AND idstudent_fk = b;
  total := total + 1; IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno reativado não recebeu]'; END IF;

  INSERT INTO public.student (idstudent, name, idusers_fk, status) VALUES (c, 'ALUNO SEM PROFESSOR', NULL, 'ativo');
  SELECT count(*) INTO n FROM public.material_share WHERE material_fk = mat AND idstudent_fk = c;
  total := total + 1; IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno sem professor recebeu]'; END IF;
  UPDATE public.student SET idusers_fk = t_id WHERE idstudent = c;
  SELECT count(*) INTO n FROM public.material_share WHERE material_fk = mat AND idstudent_fk = c;
  total := total + 1; IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno que escolheu o professor depois não recebeu]'; END IF;

  RAISE EXCEPTION 'RESULTADO: % (% de % verificações)%', CASE WHEN falhas = '' THEN 'TUDO CERTO' ELSE 'PROBLEMAS' END, passou, total, falhas;
END $$;
