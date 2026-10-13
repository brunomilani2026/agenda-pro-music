-- Teste da etapa 8. Rode DEPOIS de 07-nivel-musical.sql e 08-trava-aluno-editar-proprio-cadastro.sql.
-- Não deixa nada gravado (termina com erro de propósito).
DO $$
DECLARE
  t_id uuid; s_id uuid; s_acc uuid; preco numeric; preco0 numeric; stt text; usadas int; prof uuid; av text;
  total int := 0; passou int := 0; falhas text := '';
BEGIN
  SELECT idusers_fk, idstudent, account_fk INTO t_id, s_id, s_acc
    FROM public.student WHERE account_fk IS NOT NULL AND idusers_fk IS NOT NULL LIMIT 1;
  IF s_id IS NULL THEN RAISE EXCEPTION 'RESULTADO: sem dados para testar.'; END IF;
  SELECT lessonprice, status, usedlessons INTO preco0, stt, usadas FROM public.student WHERE idstudent = s_id;

  -- ALUNO tenta mexer em tudo
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_acc, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.student SET lessonprice = 1, discount_type = 'fixed', discount_value = 9999, status = 'ativo',
         usedlessons = -50, idusers_fk = s_acc, avatar_url = 'https://exemplo.com/foto.png' WHERE idstudent = s_id;
  EXECUTE 'RESET ROLE';

  total := total + 1;
  SELECT lessonprice, status, usedlessons, idusers_fk, avatar_url INTO preco, stt, usadas, prof, av FROM public.student WHERE idstudent = s_id;
  IF preco IS NOT DISTINCT FROM preco0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno mudou o preço]'; END IF;
  total := total + 1; IF usadas <> -50 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno mudou aulas usadas]'; END IF;
  total := total + 1; IF prof = t_id THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno trocou de professor]'; END IF;
  total := total + 1; IF av = 'https://exemplo.com/foto.png' THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno não conseguiu trocar a foto]'; END IF;

  -- PROFESSOR continua podendo
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.student SET lessonprice = 123 WHERE idstudent = s_id;
  EXECUTE 'RESET ROLE';
  total := total + 1;
  SELECT lessonprice INTO preco FROM public.student WHERE idstudent = s_id;
  IF preco = 123 THEN passou := passou + 1; ELSE falhas := falhas || ' [professor não conseguiu mudar o preço]'; END IF;

  RAISE EXCEPTION 'RESULTADO: % (% de % verificações)%', CASE WHEN falhas = '' THEN 'TUDO CERTO' ELSE 'PROBLEMAS' END, passou, total, falhas;
END $$;
