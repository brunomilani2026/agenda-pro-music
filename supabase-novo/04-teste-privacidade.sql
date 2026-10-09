-- Teste de privacidade da etapa 3 (plano de estudos). Rode DEPOIS de 04-plano-de-estudos.sql.
-- Não deixa nada gravado: termina de propósito com um erro "RESULTADO: ..." que desfaz tudo.
-- Se começar com "RESULTADO: TUDO CERTO", está certo. Se "FALHOU", copie a mensagem e me mostre.

DO $$
DECLARE
  t_id uuid; s_id uuid; s_acc uuid; outro uuid := gen_random_uuid();
  trilha uuid; modulo uuid; item uuid; copia uuid;
  n int; falhas text := ''; total int := 0; passou int := 0;
BEGIN
  SELECT s.idusers_fk, s.idstudent, s.account_fk INTO t_id, s_id, s_acc
    FROM public.student s WHERE s.account_fk IS NOT NULL AND s.idusers_fk IS NOT NULL LIMIT 1;
  IF s_id IS NULL THEN RAISE EXCEPTION 'RESULTADO: sem dados para testar (nenhum aluno com conta).'; END IF;

  -- ===== PROFESSOR monta trilha e aplica ao aluno =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.study_track (idusers_fk, name, instrument) VALUES (t_id, 'Trilha de teste', 'qualquer') RETURNING id INTO trilha;
  INSERT INTO public.study_module (track_fk, idusers_fk, title, position) VALUES (trilha, t_id, 'Módulo 1', 0) RETURNING id INTO modulo;
  INSERT INTO public.study_item (module_fk, track_fk, idusers_fk, title, competency, position) VALUES (modulo, trilha, t_id, 'Escala', 'técnica', 0) RETURNING id INTO item;
  total := total + 1; passou := passou + 1;   -- professor monta trilha, módulo e conteúdo

  INSERT INTO public.student_study_item (idstudent_fk, idusers_fk, source_item_fk, track_name, module_title, title, competency, position)
    VALUES (s_id, t_id, item, 'Trilha de teste', 'Módulo 1', 'Escala', 'técnica', 0) RETURNING id INTO copia;
  total := total + 1; passou := passou + 1;   -- professor aplica ao aluno

  total := total + 1;
  BEGIN   -- aplicar de novo o mesmo conteúdo NÃO duplica
    INSERT INTO public.student_study_item (idstudent_fk, idusers_fk, source_item_fk, track_name, module_title, title, position)
      VALUES (s_id, t_id, item, 'Trilha de teste', 'Módulo 1', 'Escala', 0);
    falhas := falhas || ' [aplicar duas vezes duplicou o conteúdo]';
  EXCEPTION WHEN unique_violation THEN passou := passou + 1; END;

  total := total + 1;
  BEGIN   -- professor NÃO cria módulo numa trilha que não é dele
    INSERT INTO public.study_module (track_fk, idusers_fk, title) VALUES (gen_random_uuid(), t_id, 'x');
    falhas := falhas || ' [criou módulo em trilha inexistente/alheia]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  -- ===== ALUNO: só lê o próprio plano =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_acc, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO n FROM public.student_study_item WHERE id = copia;
  total := total + 1;
  IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || format(' [aluno viu %s do próprio plano, esperado 1]', n); END IF;

  SELECT (SELECT count(*) FROM public.study_track) + (SELECT count(*) FROM public.study_module) + (SELECT count(*) FROM public.study_item) INTO n;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || format(' [aluno viu %s linha(s) das trilhas do professor]', n); END IF;

  UPDATE public.student_study_item SET status = 'concluido' WHERE id = copia;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno alterou o próprio plano]'; END IF;

  DELETE FROM public.student_study_item WHERE id = copia;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno apagou item do plano]'; END IF;

  total := total + 1;
  BEGIN
    INSERT INTO public.student_study_item (idstudent_fk, idusers_fk, track_name, module_title, title) VALUES (s_id, t_id, 'x', 'x', 'x');
    falhas := falhas || ' [aluno criou item no próprio plano]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  -- ===== TERCEIRO (usuário sem relação): nada =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', outro, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT (SELECT count(*) FROM public.study_track) + (SELECT count(*) FROM public.study_module)
       + (SELECT count(*) FROM public.study_item) + (SELECT count(*) FROM public.student_study_item) INTO n;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || format(' [terceiro viu %s linha(s)]', n); END IF;

  -- ===== VISITANTE sem login =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  total := total + 1;
  BEGIN
    PERFORM 1 FROM public.student_study_item LIMIT 1;
    falhas := falhas || ' [visitante sem login leu planos de estudo]';
  EXCEPTION WHEN insufficient_privilege THEN passou := passou + 1; END;
  total := total + 1;
  BEGIN
    PERFORM 1 FROM public.study_track LIMIT 1;
    falhas := falhas || ' [visitante sem login leu trilhas]';
  EXCEPTION WHEN insufficient_privilege THEN passou := passou + 1; END;

  EXECUTE 'RESET ROLE';
  IF falhas = '' THEN
    RAISE EXCEPTION 'RESULTADO: TUDO CERTO (% de % verificações). Nada ficou gravado.', passou, total;
  ELSE
    RAISE EXCEPTION 'RESULTADO: FALHOU (% de % verificações). Problemas:%', passou, total, falhas;
  END IF;
END
$$;
