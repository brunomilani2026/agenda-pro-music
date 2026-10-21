-- Teste da etapa 14. Rode DEPOIS de 14-email-do-responsavel.sql. Não deixa nada gravado (termina com erro de propósito).
-- Confere: (1) a coluna existe e aceita valor; (2) o aluno NÃO consegue mudar o próprio guardian_email.
DO $$
DECLARE s record; antes text; depois_prof text; depois_aluno text;
BEGIN
  SELECT idstudent, idusers_fk, account_fk INTO s FROM public.student WHERE account_fk IS NOT NULL AND idusers_fk IS NOT NULL LIMIT 1;
  UPDATE public.student SET guardian_email = 'responsavel-teste@example.com' WHERE idstudent = s.idstudent;
  SELECT guardian_email INTO depois_prof FROM public.student WHERE idstudent = s.idstudent;

  -- Simula o próprio aluno tentando trocar o campo.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s.account_fk, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', s.account_fk::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.student SET guardian_email = 'invasor@example.com' WHERE idstudent = s.idstudent;
  RESET ROLE;
  SELECT guardian_email INTO depois_aluno FROM public.student WHERE idstudent = s.idstudent;

  RAISE EXCEPTION 'RESULTADO: professor gravou=% (esperado responsavel-teste@example.com) | depois da tentativa do aluno=% (esperado responsavel-teste@example.com)', depois_prof, depois_aluno;
END $$;
