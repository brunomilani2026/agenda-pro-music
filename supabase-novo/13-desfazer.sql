-- Desfaz a etapa 13 (apaga só as datas de leitura já gravadas; o "lida/não lida" continua).
DROP TRIGGER IF EXISTS notification_set_read_at_trg ON public.notification;
DROP FUNCTION IF EXISTS public.notification_set_read_at();
ALTER TABLE public.notification DROP COLUMN IF EXISTS read_at;
NOTIFY pgrst, 'reload schema';
