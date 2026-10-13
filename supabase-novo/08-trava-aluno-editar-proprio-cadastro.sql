-- Etapa 8: o aluno só pode alterar da própria ficha a foto (avatar_url), o telefone, o instrumento
-- e (apenas se ainda não tiver professor) o vínculo com um professor.
-- Qualquer outro campo (preço, desconto, status, aulas, pacote, professor já definido, conta...) é IGNORADO
-- quando a alteração vem do login do próprio aluno. Professor dono, admin e o servidor (cron) não são afetados.
-- Só cria uma trava; não altera nem apaga dados.
CREATE OR REPLACE FUNCTION public.student_guard_self_update()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.account_fk
     AND auth.uid() IS DISTINCT FROM OLD.idusers_fk
     AND NOT is_admin() THEN
    NEW.idstudent := OLD.idstudent;
    NEW.account_fk := OLD.account_fk;
    NEW.name := OLD.name;
    NEW.email := OLD.email;
    NEW.cpf := OLD.cpf;
    NEW.lessonprice := OLD.lessonprice;
    NEW.discount_type := OLD.discount_type;
    NEW.discount_value := OLD.discount_value;
    NEW.status := OLD.status;
    NEW.totallessons := OLD.totallessons;
    NEW.usedlessons := OLD.usedlessons;
    NEW.packagetype := OLD.packagetype;
    NEW.expirationdate := OLD.expirationdate;
    NEW.paymentmethod := OLD.paymentmethod;
    NEW.notes := OLD.notes;
    NEW.asaas_subscription_id := OLD.asaas_subscription_id;
    NEW.music_level := OLD.music_level;
    -- escolher o primeiro professor é permitido; trocar de professor depois, não.
    IF OLD.idusers_fk IS NOT NULL THEN NEW.idusers_fk := OLD.idusers_fk; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS student_guard_self_update ON public.student;
CREATE TRIGGER student_guard_self_update BEFORE UPDATE ON public.student
  FOR EACH ROW EXECUTE FUNCTION public.student_guard_self_update();
