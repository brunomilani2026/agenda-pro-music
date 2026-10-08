-- ============================================================
-- SEGURANÇA: Row Level Security (RLS) — bloqueio total (deny-all)
-- ============================================================
--
-- CONTEXTO DA ARQUITETURA
-- Este app NÃO usa Supabase Auth. A autenticação é própria (bcrypt nas
-- tabelas users/teacher/admin/student) e TODO acesso ao banco acontece no
-- servidor (server actions / route handlers), nunca pelo navegador.
--
-- ESTRATÉGIA
-- 1. O servidor passa a usar a CHAVE SECRETA (service_role), que tem o
--    atributo BYPASSRLS — ou seja, ignora as políticas abaixo e continua
--    funcionando normalmente.
-- 2. Ligamos RLS em TODAS as tabelas SEM criar nenhuma política. Em Postgres,
--    RLS ligado + zero políticas = nega tudo para os papéis `anon` e
--    `authenticated`. Assim, a chave pública (publishable/anon) que é enviada
--    ao navegador deixa de conseguir ler ou escrever qualquer dado.
-- 3. Como reforço (defense-in-depth), revogamos os GRANTs padrão de `anon` e
--    `authenticated` no schema public.
--
-- Rode este arquivo no SQL Editor do Supabase (ou via migração).
-- É idempotente e seguro de rodar mais de uma vez.
-- ============================================================

-- Reforço: remove privilégios padrão dos papéis públicos no schema public.
-- (RLS já bloquearia, mas isto evita até erros de permissão vazarem schema.)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Garante que tabelas criadas no futuro também não recebam GRANT automático.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ------------------------------------------------------------
-- Liga RLS (deny-all) em cada tabela do schema public.
-- ------------------------------------------------------------
ALTER TABLE public.student                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_pricing        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_number           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_number_has_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_catalog     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_request         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_token   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_package         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_slot           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_day_off        ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- VERIFICAÇÃO (opcional): rode para confirmar que toda tabela
-- do schema public está com rowsecurity = true.
-- ------------------------------------------------------------
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY rowsecurity, tablename;
