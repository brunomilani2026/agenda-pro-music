-- Teste de privacidade da etapa 4 (biblioteca de materiais). Rode DEPOIS de 05-biblioteca-de-materiais.sql.
-- Não deixa nada gravado: termina de propósito com um erro "RESULTADO: ..." que desfaz tudo.

DO $$
DECLARE
  t_id uuid; s_id uuid; s_acc uuid; outro uuid := gen_random_uuid();
  m_arq uuid; m_priv uuid; l_id uuid;
  caminho_comp text; caminho_priv text;
  n int; falhas text := ''; total int := 0; passou int := 0;
BEGIN
  SELECT s.idusers_fk, s.idstudent, s.account_fk INTO t_id, s_id, s_acc
    FROM public.student s
    WHERE s.account_fk IS NOT NULL AND s.idusers_fk IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.lesson l WHERE l.student_fk = s.idstudent) LIMIT 1;
  IF s_id IS NULL THEN RAISE EXCEPTION 'RESULTADO: sem dados para testar (nenhum aluno com conta e aula).'; END IF;
  SELECT idlesson INTO l_id FROM public.lesson WHERE student_fk = s_id LIMIT 1;
  caminho_comp := t_id::text || '/teste-compartilhado.pdf';
  caminho_priv := t_id::text || '/teste-privado.pdf';

  -- ===== PROFESSOR =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.material (idusers_fk, kind, title, storage_path, file_name, mime_type, size_bytes)
    VALUES (t_id, 'arquivo', 'PDF compartilhado', caminho_comp, 'a.pdf', 'application/pdf', 10) RETURNING id INTO m_arq;
  INSERT INTO public.material (idusers_fk, kind, title, storage_path, file_name, mime_type, size_bytes)
    VALUES (t_id, 'arquivo', 'PDF privado', caminho_priv, 'b.pdf', 'application/pdf', 10) RETURNING id INTO m_priv;
  INSERT INTO public.material (idusers_fk, kind, title, url) VALUES (t_id, 'youtube', 'Vídeo', 'https://youtu.be/abc');
  total := total + 1; passou := passou + 1;   -- professor cadastra arquivo, privado e YouTube

  INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('materials', caminho_comp, t_id, '{"mimetype":"application/pdf"}'::jsonb);
  INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('materials', caminho_priv, t_id, '{"mimetype":"application/pdf"}'::jsonb);
  total := total + 1; passou := passou + 1;   -- professor grava arquivos na própria pasta

  INSERT INTO public.material_share (material_fk, idstudent_fk, idusers_fk) VALUES (m_arq, s_id, t_id);
  INSERT INTO public.lesson_material (lesson_fk, material_fk, idusers_fk) VALUES (l_id, m_arq, t_id);
  total := total + 1; passou := passou + 1;   -- compartilha com o aluno e vincula à aula

  total := total + 1;
  BEGIN   -- NÃO pode gravar arquivo na pasta de outro professor
    INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('materials', outro::text || '/invasao.pdf', t_id);
    falhas := falhas || ' [professor gravou arquivo na pasta de outro]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  total := total + 1;
  BEGIN   -- NÃO pode cadastrar material apontando para a pasta de outro professor
    INSERT INTO public.material (idusers_fk, kind, title, storage_path) VALUES (t_id, 'arquivo', 'x', outro::text || '/x.pdf');
    falhas := falhas || ' [cadastrou material com arquivo da pasta de outro]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  total := total + 1;
  BEGIN   -- link precisa ser http(s)
    INSERT INTO public.material (idusers_fk, kind, title, url) VALUES (t_id, 'link', 'x', 'javascript:alert(1)');
    falhas := falhas || ' [aceitou link que não é http(s)]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  -- ===== ALUNO =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_acc, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO n FROM public.material;
  total := total + 1;
  IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || format(' [aluno viu %s material(is), esperado 1 (só o compartilhado)]', n); END IF;

  SELECT count(*) INTO n FROM public.material WHERE id = m_priv;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno viu material privado]'; END IF;

  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'materials';
  total := total + 1;
  IF n = 1 THEN passou := passou + 1; ELSE falhas := falhas || format(' [aluno enxergou %s arquivo(s), esperado 1]', n); END IF;

  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'materials' AND name = caminho_priv;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno enxergou arquivo privado]'; END IF;

  total := total + 1;
  BEGIN
    INSERT INTO public.material_share (material_fk, idstudent_fk, idusers_fk) VALUES (m_priv, s_id, t_id);
    falhas := falhas || ' [aluno se deu acesso a material privado]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  total := total + 1;
  BEGIN
    INSERT INTO public.material (idusers_fk, kind, title, url) VALUES (t_id, 'link', 'x', 'https://exemplo.com');
    falhas := falhas || ' [aluno cadastrou material]';
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  UPDATE public.material SET title = 'adulterado' WHERE id = m_arq;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno alterou material]'; END IF;

  DELETE FROM public.material_share WHERE material_fk = m_arq;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno removeu compartilhamento]'; END IF;

  total := total + 1;
  BEGIN
    DELETE FROM storage.objects WHERE bucket_id = 'materials' AND name = caminho_comp;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [aluno apagou arquivo]'; END IF;
  EXCEPTION WHEN OTHERS THEN passou := passou + 1; END;

  -- ===== TERCEIRO =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', outro, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT (SELECT count(*) FROM public.material) + (SELECT count(*) FROM public.material_share)
       + (SELECT count(*) FROM public.lesson_material) + (SELECT count(*) FROM storage.objects WHERE bucket_id = 'materials') INTO n;
  total := total + 1;
  IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || format(' [terceiro viu %s linha(s)]', n); END IF;

  -- ===== VISITANTE sem login =====
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  total := total + 1;
  BEGIN
    PERFORM 1 FROM public.material LIMIT 1;
    falhas := falhas || ' [visitante leu materiais]';
  EXCEPTION WHEN insufficient_privilege THEN passou := passou + 1; END;
  total := total + 1;
  BEGIN
    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'materials';
    IF n = 0 THEN passou := passou + 1; ELSE falhas := falhas || ' [visitante enxergou arquivos]'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN passou := passou + 1; END;

  EXECUTE 'RESET ROLE';
  IF falhas = '' THEN
    RAISE EXCEPTION 'RESULTADO: TUDO CERTO (% de % verificações). Nada ficou gravado.', passou, total;
  ELSE
    RAISE EXCEPTION 'RESULTADO: FALHOU (% de % verificações). Problemas:%', passou, total, falhas;
  END IF;
END
$$;
