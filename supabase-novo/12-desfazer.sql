-- Desfaz a etapa 12. ATENÇÃO: apaga o registro de e-mails já gravado.
DROP TABLE IF EXISTS public.email_log;
NOTIFY pgrst, 'reload schema';
