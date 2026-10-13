-- Teste da etapa 12. Rode DEPOIS de 12-registro-de-emails.sql. Não deixa nada gravado (termina com erro de propósito).
DO $$
DECLARE
  t_id uuid; s_id uuid; s_acc uuid; outro uuid := gen_random_uuid(); n int;
  total int := 0; passou int := 0; falhas text := '';
BEGIN
  SELECT idusers_fk, idstudent, account_fk INTO t_id, s_id, s_acc
    FROM public.student WHERE account_fk IS NOT NULL AND idusers_fk IS NOT NULL LIMIT 1;
  IF s_id IS NULL THEN RAISE EXCEPTION 'RESULTADO: sem dados para testar.'; END IF;

  INSERT INTO public.email_log (idstudent_fk, idusers_fk, to_email, tipo, title, message, status)
    VALUES (s_id, t_id, 'teste@exemplo.com', 'aula', 'Sua aula é daqui a pouco', 'texto', 'enviado');

  -- PROFESSOR dono lê
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.email_log WHERE idstudent_fk = s_id;
  total := total + 1; IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || ' [professor não vê os e-mails do próprio aluno]'; END IF;

  total := total + 1;
  BEGIN
    INSERT INTO public.email_log (idstudent_fk, idusers_fk, title, status) VALUES (s_id, t_id, 'x', 'enviado');
    falhas := falhas || ' [professor conseguiu gravar]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;
  EXECUTE 'RESET ROLE';

  -- ALUNO não lê
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_acc, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.email_log;
  total := total + 1; IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [ALUNO enxerga e-mails]'; END IF;
  EXECUTE 'RESET ROLE';

  -- OUTRO professor não lê
  PERFORM set_config('request.jwt.claims', json_build_object('sub', outro, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.email_log;
  total := total + 1; IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [outro usuário enxerga e-mails alheios]'; END IF;
  EXECUTE 'RESET ROLE';

  -- ANÔNIMO não lê
  EXECUTE 'SET LOCAL ROLE anon';
  total := total + 1;
  BEGIN
    SELECT count(*) INTO n FROM public.email_log;
    falhas := falhas || ' [anônimo conseguiu consultar]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'RESULTADO: % (% de % verificações)%', CASE WHEN falhas = '' THEN 'TUDO CERTO' ELSE 'PROBLEMAS' END, passou, total, falhas;
END $$;
