-- Teste da etapa 7. Rode DEPOIS de 07-nivel-musical.sql. Não deixa nada gravado (termina com erro de propósito).
DO $$
DECLARE
  t_id uuid; s_id uuid; s_acc uuid; v text; total int := 0; passou int := 0; falhas text := '';
BEGIN
  SELECT idusers_fk, idstudent, account_fk INTO t_id, s_id, s_acc
    FROM public.student WHERE account_fk IS NOT NULL AND idusers_fk IS NOT NULL LIMIT 1;
  IF s_id IS NULL THEN RAISE EXCEPTION 'RESULTADO: sem dados para testar.'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.student SET music_level = 'intermediario' WHERE idstudent = s_id;
  SELECT music_level INTO v FROM public.student WHERE idstudent = s_id;
  total := total + 1; IF v = 'intermediario' THEN passou := passou + 1; ELSE falhas := falhas || ' [professor não conseguiu definir o nível]'; END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_acc, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.student SET music_level = 'avancado' WHERE idstudent = s_id;
  SELECT music_level INTO v FROM public.student WHERE idstudent = s_id;
  total := total + 1; IF v = 'intermediario' THEN passou := passou + 1; ELSE falhas := falhas || ' [ALUNO conseguiu mudar o próprio nível]'; END IF;

  total := total + 1;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.student SET music_level = 'mestre' WHERE idstudent = s_id;
    falhas := falhas || ' [aceitou nível inválido]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'RESULTADO: % (% de % verificações)%', CASE WHEN falhas = '' THEN 'TUDO CERTO' ELSE 'PROBLEMAS' END, passou, total, falhas;
END $$;
