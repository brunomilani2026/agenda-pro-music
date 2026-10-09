-- Teste de privacidade da etapa 2. Rode DEPOIS de 03-diario-e-anotacoes.sql.
--
-- Simula, dentro do banco, um professor, um aluno dele, outro professor e um visitante,
-- tentando ler e escrever o que não deveriam. Usa um aluno real que tenha conta de login,
-- mas NÃO deixa nada gravado: no fim ele provoca de propósito um erro com o resultado
-- ("RESULTADO: ..."), e esse erro desfaz tudo.
--
-- Leia a mensagem final. Se começar com "RESULTADO: TUDO CERTO", a privacidade está garantida.
-- Se aparecer "FALHOU", copie a mensagem e me mostre.

DO $$
DECLARE
  t_id uuid; s_id uuid; s_acc uuid; l_id uuid; outro uuid := gen_random_uuid();
  n int; falhas text := ''; total int := 0; passou int := 0;
  nota_priv uuid; nota_comp uuid;
  s2 uuid; l2 uuid;
BEGIN
  -- escolhe um professor, um aluno dele COM conta de login, e uma aula desse aluno
  SELECT s.idusers_fk, s.idstudent, s.account_fk INTO t_id, s_id, s_acc
    FROM public.student s
    WHERE s.account_fk IS NOT NULL AND s.idusers_fk IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.lesson l WHERE l.student_fk = s.idstudent)
    LIMIT 1;
  IF s_id IS NULL THEN
    RAISE EXCEPTION 'RESULTADO: sem dados para testar (nenhum aluno com conta e aula).';
  END IF;
  SELECT idlesson INTO l_id FROM public.lesson WHERE student_fk = s_id LIMIT 1;

  -- ===== PROFESSOR =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.lesson_record (idlesson_fk, idstudent_fk, idusers_fk, content_worked, private_note, shared_note, share_with_student)
    VALUES (l_id, s_id, t_id, 'Escala de Dó', 'SEGREDO-DO-PROFESSOR', 'Bom trabalho', true);
  total := total + 1; passou := passou + 1;   -- professor consegue registrar a aula

  INSERT INTO public.student_note (idstudent_fk, idusers_fk, author_id, visibility, body)
    VALUES (s_id, t_id, t_id, 'professor_privada', 'nota privada') RETURNING id INTO nota_priv;
  INSERT INTO public.student_note (idstudent_fk, idusers_fk, author_id, visibility, body)
    VALUES (s_id, t_id, t_id, 'compartilhada', 'nota compartilhada') RETURNING id INTO nota_comp;
  total := total + 1; passou := passou + 1;   -- professor consegue escrever privada e compartilhada

  total := total + 1;
  BEGIN   -- professor NÃO pode escrever nota "pessoal do aluno"
    INSERT INTO public.student_note (idstudent_fk, idusers_fk, author_id, visibility, body)
      VALUES (s_id, t_id, t_id, 'aluno_pessoal', 'x');
    falhas := falhas || ' [professor conseguiu escrever nota pessoal do aluno]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  -- professor NÃO pode registrar aula de aluno que é de OUTRO professor (só testa se existir)
  EXECUTE 'RESET ROLE';
  SELECT s.idstudent, l.idlesson INTO s2, l2
    FROM public.student s JOIN public.lesson l ON l.student_fk = s.idstudent
    WHERE s.idusers_fk IS DISTINCT FROM t_id LIMIT 1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF s2 IS NOT NULL THEN
    total := total + 1;
    BEGIN
      INSERT INTO public.lesson_record (idlesson_fk, idstudent_fk, idusers_fk, content_worked)
        VALUES (l2, s2, t_id, 'invasão');
      falhas := falhas || ' [professor registrou aula de aluno de outro professor]';
    EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;
  END IF;

  -- ===== ALUNO =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_acc, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO n FROM public.lesson_record;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || format(' [aluno leu %s registro(s) da tabela do diário]', n); END IF;

  SELECT count(*) INTO n FROM public.lesson_record_shared WHERE idlesson_fk = l_id;
  total := total + 1;
  IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || format(' [aluno viu %s na visão compartilhada, esperado 1]', n); END IF;

  total := total + 1;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'lesson_record_shared' AND column_name IN ('private_note','difficulties','progress','exercises','objectives')) THEN
    passou := passou + 1;
  ELSE falhas := falhas || ' [a visão do aluno expõe campo privado]'; END IF;

  SELECT count(*) INTO n FROM public.student_note WHERE visibility = 'professor_privada';
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || format(' [aluno viu %s nota(s) privada(s) do professor]', n); END IF;

  SELECT count(*) INTO n FROM public.student_note WHERE visibility = 'compartilhada';
  total := total + 1;
  IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || format(' [aluno viu %s compartilhada(s), esperado 1]', n); END IF;

  INSERT INTO public.student_note (idstudent_fk, idusers_fk, author_id, visibility, body)
    VALUES (s_id, t_id, s_acc, 'aluno_pessoal', 'minha anotação');
  total := total + 1; passou := passou + 1;   -- aluno escreve a própria nota pessoal

  total := total + 1;
  BEGIN   -- aluno NÃO pode escrever nota privada do professor
    INSERT INTO public.student_note (idstudent_fk, idusers_fk, author_id, visibility, body)
      VALUES (s_id, t_id, s_acc, 'professor_privada', 'x');
    falhas := falhas || ' [aluno conseguiu escrever nota privada do professor]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  total := total + 1;
  BEGIN   -- aluno NÃO pode escrever nota "compartilhada" (essa é do professor)
    INSERT INTO public.student_note (idstudent_fk, idusers_fk, author_id, visibility, body)
      VALUES (s_id, t_id, s_acc, 'compartilhada', 'x');
    falhas := falhas || ' [aluno conseguiu escrever nota compartilhada]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  UPDATE public.student_note SET body = 'adulterada' WHERE id = nota_comp;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno alterou nota do professor]'; END IF;

  DELETE FROM public.student_note WHERE id = nota_comp;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno apagou nota do professor]'; END IF;

  UPDATE public.lesson_record SET share_with_student = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno alterou o diário]'; END IF;

  -- ===== PROFESSOR de novo: não vê a nota pessoal do aluno =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.student_note WHERE visibility = 'aluno_pessoal';
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [professor viu nota pessoal do aluno]'; END IF;

  -- ===== OUTRO PROFESSOR (usuário qualquer, sem relação): nada =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', outro, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT (SELECT count(*) FROM public.lesson_record) + (SELECT count(*) FROM public.student_note) + (SELECT count(*) FROM public.lesson_record_shared) INTO n;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || format(' [terceiro viu %s linha(s)]', n); END IF;

  -- ===== VISITANTE (sem login) =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  total := total + 1;
  BEGIN
    PERFORM 1 FROM public.lesson_record_shared LIMIT 1;
    falhas := falhas || ' [visitante sem login leu a visão]';
  EXCEPTION WHEN insufficient_privilege THEN passou := passou + 1; END;
  total := total + 1;
  BEGIN
    PERFORM 1 FROM public.student_note LIMIT 1;
    falhas := falhas || ' [visitante sem login leu as anotações]';
  EXCEPTION WHEN insufficient_privilege THEN passou := passou + 1; END;

  EXECUTE 'RESET ROLE';

  -- O erro abaixo é PROPOSITAL: ele desfaz tudo que o teste gravou e mostra o resultado.
  IF falhas = '' THEN
    RAISE EXCEPTION 'RESULTADO: TUDO CERTO (% de % verificações). Nada ficou gravado.', passou, total;
  ELSE
    RAISE EXCEPTION 'RESULTADO: FALHOU (% de % verificações). Problemas:%', passou, total, falhas;
  END IF;
END
$$;
