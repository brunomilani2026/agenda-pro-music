-- Teste de privacidade da etapa 5 (tarefas e entregas). Rode DEPOIS de 06-tarefas-e-entregas.sql.
-- Não deixa nada gravado: termina de propósito com um erro "RESULTADO: ..." que desfaz tudo.

DO $$
DECLARE
  t_id uuid; s_id uuid; s_acc uuid; outro uuid := gen_random_uuid();
  tarefa uuid; mat uuid; sub1 uuid; sub2 uuid;
  caminho_ok text; caminho_alheio text;
  n int; falhas text := ''; total int := 0; passou int := 0;
BEGIN
  SELECT s.idusers_fk, s.idstudent, s.account_fk INTO t_id, s_id, s_acc
    FROM public.student s WHERE s.account_fk IS NOT NULL AND s.idusers_fk IS NOT NULL LIMIT 1;
  IF s_id IS NULL THEN RAISE EXCEPTION 'RESULTADO: sem dados para testar (nenhum aluno com conta).'; END IF;
  caminho_ok := t_id::text || '/' || s_id::text || '/audio-teste.mp3';
  caminho_alheio := t_id::text || '/' || outro::text || '/audio-teste.mp3';

  -- ===== PROFESSOR cria a tarefa, material de apoio e conclui depois =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.material (idusers_fk, kind, title, url) VALUES (t_id, 'link', 'Apoio', 'https://exemplo.com') RETURNING id INTO mat;
  INSERT INTO public.task (idusers_fk, idstudent_fk, title, due_date) VALUES (t_id, s_id, 'Tarefa de teste', current_date + 7) RETURNING id INTO tarefa;
  INSERT INTO public.task_material (task_fk, material_fk, idusers_fk) VALUES (tarefa, mat, t_id);
  total := total + 1; passou := passou + 1;   -- professor cria tarefa com material de apoio

  total := total + 1;
  BEGIN   -- professor NÃO cria tarefa para aluno que não é dele
    INSERT INTO public.task (idusers_fk, idstudent_fk, title) VALUES (t_id, outro, 'x');
    falhas := falhas || ' [criou tarefa para aluno inexistente/alheio]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  -- ===== ALUNO =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_acc, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO n FROM public.task WHERE id = tarefa;
  total := total + 1;
  IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno não vê a própria tarefa]'; END IF;

  SELECT count(*) INTO n FROM public.task_material WHERE task_fk = tarefa;
  total := total + 1;
  IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno não vê o material de apoio da tarefa]'; END IF;

  UPDATE public.task SET status = 'concluida' WHERE id = tarefa;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno concluiu a própria tarefa]'; END IF;

  total := total + 1;
  BEGIN
    INSERT INTO public.task (idusers_fk, idstudent_fk, title) VALUES (t_id, s_id, 'criada pelo aluno');
    falhas := falhas || ' [aluno criou tarefa]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  INSERT INTO public.task_submission (task_fk, idstudent_fk, idusers_fk, kind, url, note)
    VALUES (tarefa, s_id, t_id, 'link', 'https://youtu.be/abc', 'fiz o exercício') RETURNING id INTO sub1;
  total := total + 1; passou := passou + 1;   -- aluno entrega por link

  INSERT INTO public.task_submission (task_fk, idstudent_fk, idusers_fk, kind, storage_path, file_name, mime_type, size_bytes)
    VALUES (tarefa, s_id, t_id, 'arquivo', caminho_ok, 'audio-teste.mp3', 'audio/mpeg', 10) RETURNING id INTO sub2;
  INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('entregas', caminho_ok, s_acc, '{"mimetype":"audio/mpeg"}'::jsonb);
  total := total + 1; passou := passou + 1;   -- aluno entrega arquivo na própria pasta

  total := total + 1;
  BEGIN   -- aluno NÃO entrega já com feedback escrito
    INSERT INTO public.task_submission (task_fk, idstudent_fk, idusers_fk, kind, url, feedback, feedback_at)
      VALUES (tarefa, s_id, t_id, 'link', 'https://exemplo.com', 'nota 10', now());
    falhas := falhas || ' [aluno escreveu o próprio feedback]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  total := total + 1;
  BEGIN   -- aluno NÃO aponta para arquivo de outra pasta
    INSERT INTO public.task_submission (task_fk, idstudent_fk, idusers_fk, kind, storage_path)
      VALUES (tarefa, s_id, t_id, 'arquivo', caminho_alheio);
    falhas := falhas || ' [aluno apontou para arquivo de outra pasta]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  total := total + 1;
  BEGIN   -- aluno NÃO grava arquivo na pasta de outro aluno
    INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('entregas', caminho_alheio, s_acc);
    falhas := falhas || ' [aluno gravou na pasta de outro aluno]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  total := total + 1;
  BEGIN   -- aluno NÃO entrega em tarefa que não é dele
    INSERT INTO public.task_submission (task_fk, idstudent_fk, idusers_fk, kind, url)
      VALUES (gen_random_uuid(), s_id, t_id, 'link', 'https://exemplo.com');
    falhas := falhas || ' [aluno entregou em tarefa inexistente/alheia]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  UPDATE public.task_submission SET feedback = 'escrito pelo aluno' WHERE id = sub1;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno alterou feedback]'; END IF;

  SELECT count(*) INTO n FROM public.task_submission WHERE idstudent_fk = s_id;
  total := total + 1;
  IF n = 2 THEN passou := passou + 1; ELSE falhas := falhas || format(' [aluno viu %s entrega(s), esperado 2]', n); END IF;

  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'entregas';
  total := total + 1;
  IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || format(' [aluno enxergou %s arquivo(s), esperado 1]', n); END IF;

  -- ===== PROFESSOR responde, vê o arquivo e conclui =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  UPDATE public.task_submission SET feedback = 'Muito bem!', feedback_at = now() WHERE id = sub1;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || ' [professor não conseguiu dar retorno]'; END IF;

  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'entregas' AND name = caminho_ok;
  total := total + 1;
  IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || ' [professor não enxerga o arquivo do aluno]'; END IF;

  -- ===== ALUNO de novo: não apaga entrega que já tem retorno, apaga a que não tem =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_acc, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  DELETE FROM public.task_submission WHERE id = sub1;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno apagou entrega que já tem retorno]'; END IF;

  DELETE FROM public.task_submission WHERE id = sub2;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno não conseguiu apagar a própria entrega sem retorno]'; END IF;

  -- professor conclui a tarefa; depois o aluno não entrega mais
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.task SET status = 'concluida', completed_at = now() WHERE id = tarefa;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_acc, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  total := total + 1;
  BEGIN
    INSERT INTO public.task_submission (task_fk, idstudent_fk, idusers_fk, kind, url) VALUES (tarefa, s_id, t_id, 'link', 'https://exemplo.com');
    falhas := falhas || ' [aluno entregou em tarefa já concluída]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  -- ===== TERCEIRO =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', outro, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT (SELECT count(*) FROM public.task) + (SELECT count(*) FROM public.task_material)
       + (SELECT count(*) FROM public.task_submission) + (SELECT count(*) FROM storage.objects WHERE bucket_id = 'entregas') INTO n;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || format(' [terceiro viu %s linha(s)]', n); END IF;

  -- ===== VISITANTE =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  total := total + 1;
  BEGIN
    PERFORM 1 FROM public.task_submission LIMIT 1;
    falhas := falhas || ' [visitante leu entregas]';
  EXCEPTION WHEN insufficient_privilege THEN passou := passou + 1; END;
  total := total + 1;
  BEGIN
    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'entregas';
    IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [visitante enxergou arquivos de entregas]'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN passou := passou + 1; END;

  EXECUTE 'RESET ROLE';
  IF falhas = '' THEN
    RAISE EXCEPTION 'RESULTADO: TUDO CERTO (% de % verificações). Nada ficou gravado.', passou, total;
  ELSE
    RAISE EXCEPTION 'RESULTADO: FALHOU (% de % verificações). Problemas:%', passou, total, falhas;
  END IF;
END
$$;
