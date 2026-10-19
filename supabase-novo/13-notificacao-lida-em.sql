-- Etapa 13: guarda QUANDO o aviso do app foi lido (notification.read_at). Só ACRESCENTA uma coluna e um gatilho; nada existente muda.
-- O gatilho preenche read_at sozinho quando read passa de false para true, por qualquer caminho (sino, tela de avisos, "marcar todas").
-- Avisos já lidos antes desta etapa ficam com read_at vazio (aparecem só como "Lida").
ALTER TABLE public.notification ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE OR REPLACE FUNCTION public.notification_set_read_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.read IS TRUE AND (OLD.read IS NOT TRUE) AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_set_read_at_trg ON public.notification;
CREATE TRIGGER notification_set_read_at_trg BEFORE UPDATE ON public.notification
  FOR EACH ROW EXECUTE FUNCTION public.notification_set_read_at();

NOTIFY pgrst, 'reload schema';
