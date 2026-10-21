-- Etapa 14: e-mail do responsável (para aluno menor de idade). Só ACRESCENTA uma coluna; nada existente muda.
-- Quando preenchido, os e-mails que o sistema manda ao aluno também são enviados a esse endereço.
ALTER TABLE public.student ADD COLUMN IF NOT EXISTS guardian_email text;

-- O aluno não pode mudar esse campo na própria ficha (mesma trava das etapas 8 e 10, com mais um campo).
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
    NEW.is_test := OLD.is_test;
    NEW.guardian_email := OLD.guardian_email;
    IF OLD.idusers_fk IS NOT NULL THEN NEW.idusers_fk := OLD.idusers_fk; END IF;
  END IF;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
