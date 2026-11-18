-- Avisos no celular (Web Push): assinaturas dos aparelhos + gatilho que avisa o app a cada notificação nova.
-- 1) Assinaturas. Só o servidor (service role) lê e grava: nenhuma política para usuário comum.
CREATE TABLE IF NOT EXISTS public.push_subscription (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  idstudent_fk uuid REFERENCES public.student(idstudent) ON DELETE CASCADE,
  idusers_fk uuid REFERENCES public.users(idusers) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscription_student_idx ON public.push_subscription (idstudent_fk);
ALTER TABLE public.push_subscription ENABLE ROW LEVEL SECURITY;

-- 2) Gatilho: cada linha nova em notification chama /api/push/enviar (que manda o aviso ao celular).
--    Nunca derruba o INSERT: qualquer erro é engolido.
--    Troque __SEGREDO__ pelo valor de PUSH_WEBHOOK_SECRET (o mesmo configurado no Vercel).
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION public.notificar_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://www.agendapromusic.com.br/api/push/enviar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', '__SEGREDO__'),
    body := jsonb_build_object('record', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS push_notificacao ON public.notification;
CREATE TRIGGER push_notificacao AFTER INSERT ON public.notification FOR EACH ROW EXECUTE FUNCTION public.notificar_push();
