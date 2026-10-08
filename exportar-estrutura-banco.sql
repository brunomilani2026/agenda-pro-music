-- ============================================================
-- EXPORTAR ESTRUTURA DO BANCO (SOMENTE LEITURA — não altera nada, não traz dados)
-- Rodar no SQL Editor do Supabase do site ATUAL (agendapromusic).
-- Resultado: uma tabela com a estrutura completa (tipos, colunas, constraints,
-- índices, RLS, policies, funções, triggers e permissões).
-- Depois: botão "Download CSV" do resultado.
-- ============================================================
with objs as (
  -- extensões
  select 0 as ord, 'extensao'::text as tipo, extname::text as objeto,
         format('CREATE EXTENSION IF NOT EXISTS %I;', extname)::text as ddl
  from pg_extension where extname not in ('plpgsql')

  union all
  -- enums
  select 1, 'enum', t.typname::text,
         format('CREATE TYPE public.%I AS ENUM (%s);', t.typname,
           (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
            from pg_enum e where e.enumtypid = t.oid))
  from pg_type t where t.typtype = 'e' and t.typnamespace = 'public'::regnamespace

  union all
  -- colunas
  select 2, 'coluna', c.relname::text,
         format('%s.%s | %s | %s | default: %s', c.relname, a.attname,
                format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then 'NOT NULL' else 'NULL' end,
                coalesce(pg_get_expr(d.adbin, d.adrelid), '-'))
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and a.attnum > 0 and not a.attisdropped

  union all
  -- constraints (PK, FK, UNIQUE, CHECK)
  select 3, 'constraint', conrelid::regclass::text,
         format('ALTER TABLE %s ADD CONSTRAINT %I %s;', conrelid::regclass, conname, pg_get_constraintdef(oid))
  from pg_constraint where connamespace = 'public'::regnamespace

  union all
  -- índices
  select 4, 'indice', tablename::text, indexdef || ';'
  from pg_indexes where schemaname = 'public'

  union all
  -- RLS ligado/desligado
  select 5, 'rls', relname::text,
         format('ALTER TABLE public.%I %s ROW LEVEL SECURITY;', relname,
                case when relrowsecurity then 'ENABLE' else 'DISABLE' end)
  from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'

  union all
  -- policies (schemas public e storage)
  select 6, 'policy', (schemaname || '.' || tablename)::text,
         format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
                policyname, schemaname, tablename, permissive, cmd,
                array_to_string(roles, ', '),
                case when qual is not null then ' USING (' || qual || ')' else '' end,
                case when with_check is not null then ' WITH CHECK (' || with_check || ')' else '' end)
  from pg_policies where schemaname in ('public', 'storage')

  union all
  -- funções
  select 7, 'funcao', proname::text, pg_get_functiondef(oid) || ';'
  from pg_proc where pronamespace = 'public'::regnamespace and prokind in ('f', 'p')

  union all
  -- triggers (public e auth.users)
  select 8, 'trigger', tgrelid::regclass::text, pg_get_triggerdef(oid) || ';'
  from pg_trigger
  where not tgisinternal
    and tgrelid in (select oid from pg_class where relnamespace in ('public'::regnamespace, 'auth'::regnamespace))

  union all
  -- permissões (grants) de anon / authenticated
  select 9, 'grant', table_name::text,
         format('GRANT %s ON public.%I TO %s;', string_agg(privilege_type, ', ' order by privilege_type), table_name, grantee)
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  group by table_name, grantee

  union all
  -- acesso ao schema public
  select 10, 'schema', r.rolname::text,
         format('%s USAGE no schema public: %s', r.rolname, has_schema_privilege(r.rolname, 'public', 'USAGE'))
  from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role')

  union all
  -- buckets de storage (se houver)
  select 11, 'bucket', id::text, format('bucket %s | public: %s', id, public)
  from storage.buckets
)
select ord, tipo, objeto, ddl from objs order by ord, objeto, ddl;
