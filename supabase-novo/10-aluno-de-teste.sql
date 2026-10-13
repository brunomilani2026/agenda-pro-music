-- Etapa 10: marca de "aluno de teste". Aluno de teste não entra nos valores arrecadados, na inadimplência, nas cobranças
-- automáticas, nos alertas nem na renovação da agenda. Só acrescenta uma coluna e ajusta uma trava; dados existentes não são apagados.
ALTER TABLE public.student ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- O aluno não pode mudar essa marca na própria ficha (mesma trava da etapa 8, com mais um campo).
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
    IF OLD.idusers_fk IS NOT NULL THEN NEW.idusers_fk := OLD.idusers_fk; END IF;
  END IF;
  RETURN NEW;
END $$;

-- "Bruno Teste Aluno": vira aluno de teste, fica ativo e em dia (as duas faturas em aberto de setembro são canceladas).
UPDATE public.student
SET is_test = true, status = 'ativo', expirationdate = '2027-12-31'
WHERE idstudent = '6ae493bb-5e1f-452f-96d9-6cd6de678a83' AND name = 'Bruno Teste Aluno';

UPDATE public.payment
SET status = 'cancelado'
WHERE idstudent_fk = '6ae493bb-5e1f-452f-96d9-6cd6de678a83' AND status IN ('vencido', 'renegociado');

NOTIFY pgrst, 'reload schema';
