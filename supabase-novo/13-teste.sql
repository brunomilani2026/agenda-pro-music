-- Teste da etapa 13. Rode DEPOIS de 13-notificacao-lida-em.sql. Não deixa nada gravado (termina com erro de propósito).
DO $$
DECLARE s record; nid uuid; r1 timestamptz; r2 timestamptz; antes timestamptz;
BEGIN
  SELECT idstudent, idusers_fk INTO s FROM public.student WHERE idusers_fk IS NOT NULL LIMIT 1;
  INSERT INTO public.notification (idusers_fk, idstudent_fk, recipient, type, title, message, read)
    VALUES (s.idusers_fk, s.idstudent, 'student', 'sistema', 'TESTE etapa 13', 'x', false) RETURNING id INTO nid;
  SELECT read_at INTO antes FROM public.notification WHERE id = nid;
  UPDATE public.notification SET read = true WHERE id = nid;
  SELECT read_at INTO r1 FROM public.notification WHERE id = nid;
  UPDATE public.notification SET read = true, message = 'y' WHERE id = nid;
  SELECT read_at INTO r2 FROM public.notification WHERE id = nid;
  RAISE EXCEPTION 'RESULTADO: antes=% | depois de ler=% (esperado: preenchido) | segunda atualizacao manteve=% (esperado: true)',
    antes, r1, (r1 = r2);
END $$;
