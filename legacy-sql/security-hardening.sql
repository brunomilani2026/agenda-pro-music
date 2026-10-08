-- ============================================================
-- REFORÇO DE SEGURANÇA (defense-in-depth) — projeto de produção
-- Rode DEPOIS de já ter aplicado o security-rls.sql, no MESMO projeto (B).
-- Idempotente e seguro de rodar mais de uma vez.
--
-- O servidor usa a CHAVE SECRETA (service_role), que tem BYPASSRLS e USAGE
-- próprios — NENHUM comando abaixo afeta o acesso do servidor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Bloquear introspecção de ESTRUTURA pela chave pública.
--    Mesmo com RLS, o papel `anon` ainda enxerga os nomes de tabelas/colunas
--    via PostgREST porque tem USAGE no schema. Removendo o USAGE, a API pública
--    deixa de expor até o "mapa" do banco.
--    ⚠️ NÃO revogue de `authenticated`: com o Supabase Auth, esse papel é usado
--    pelos usuários logados e PRECISA de USAGE (a RLS já filtra as linhas).
-- ------------------------------------------------------------
REVOKE USAGE ON SCHEMA public FROM anon;

-- ------------------------------------------------------------
-- 2. Limite de tempo de query para os papéis públicos.
--    Evita queries abusivas/pesadas por quem tenha a chave pública.
-- ------------------------------------------------------------
ALTER ROLE anon SET statement_timeout = '5s';
ALTER ROLE authenticated SET statement_timeout = '8s';

-- ------------------------------------------------------------
-- 3. (VERIFICAÇÃO) Extensões perigosas habilitadas?
--    `http` e `pg_net` permitem requisições de saída a partir do banco (SSRF).
--    `pg_cron` agenda jobs. Se aparecerem e você NÃO usa, remova.
-- ------------------------------------------------------------
-- SELECT extname FROM pg_extension WHERE extname IN ('http', 'pg_net', 'pg_cron');
-- DROP EXTENSION IF EXISTS http;
-- DROP EXTENSION IF EXISTS pg_net;

-- ------------------------------------------------------------
-- 4. (VERIFICAÇÃO) Confirme o resultado:
--    - Toda tabela do schema public com rowsecurity = true (do security-rls.sql).
--    - anon/authenticated sem USAGE no schema public.
-- ------------------------------------------------------------
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' ORDER BY rowsecurity, tablename;
-- SELECT nspname, r.rolname, has_schema_privilege(r.rolname, 'public', 'USAGE') AS tem_usage
--   FROM pg_roles r, pg_namespace n
--   WHERE n.nspname = 'public' AND r.rolname IN ('anon','authenticated','service_role');
