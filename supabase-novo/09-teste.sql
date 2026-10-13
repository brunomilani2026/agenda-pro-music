-- Teste da etapa 9. Rode DEPOIS de 09-excluir-aluno-com-aulas.sql. Não deixa nada gravado (termina com erro de propósito).
DO $$
DECLARE
  t_id uuid; s_id uuid := gen_random_uuid(); l_id uuid; n int; fk uuid; nome text;
  total int := 0; passou int := 0; falhas text := '';
BEGIN
  SELECT idusers_fk INTO t_id FROM public.student WHERE idusers_fk IS NOT NULL LIMIT 1;
  IF t_id IS NULL THEN RAISE EXCEPTION 'RESULTADO: sem dados para testar.'; END IF;

  INSERT INTO public.student (idstudent, name, idusers_fk, status) VALUES (s_id, 'ALUNO TESTE EXCLUSAO', t_id, 'ativo');
  INSERT INTO public.lesson (studentname, student_fk, idusers_fk, datelesson, date, starttime, endtime, lessonstatus)
    VALUES ('ALUNO TESTE EXCLUSAO', s_id, t_id, now(), to_char(now(), 'YYYY-MM-DD'), '10:00', '10:50', 'realizada') RETURNING idlesson INTO l_id;

  -- o PROFESSOR exclui o aluno (regras de acesso valendo)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.student WHERE idstudent = s_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';

  total := total + 1; IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || ' [professor não conseguiu excluir o aluno]'; END IF;

  SELECT count(*) INTO n FROM public.student WHERE idstudent = s_id;
  total := total + 1; IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno ainda existe]'; END IF;

  SELECT student_fk, studentname INTO fk, nome FROM public.lesson WHERE idlesson = l_id;
  total := total + 1; IF nome = 'ALUNO TESTE EXCLUSAO' THEN passou := passou + 1; ELSE falhas := falhas || ' [a aula não ficou como histórico]'; END IF;
  total := total + 1; IF fk IS NULL THEN passou := passou + 1; ELSE falhas := falhas || ' [a aula ainda aponta para o aluno]'; END IF;

  RAISE EXCEPTION 'RESULTADO: % (% de % verificações)%', CASE WHEN falhas = '' THEN 'TUDO CERTO' ELSE 'PROBLEMAS' END, passou, total, falhas;
END $$;
