# SQL legado — NÃO EXECUTAR

Os arquivos desta pasta pertencem a um modelo de segurança **anterior e
incompatível** com o atual.

Eles assumem que o app não usa Supabase Auth e que todo acesso passa pelo
`service_role`: ligam RLS *deny-all* (sem nenhuma policy) e revogam os GRANTs
do role `authenticated`.

O modelo vigente é o de `auth-rls-phase1.sql` + `auth-rls-phase3.sql` (+ os
arquivos em `migrations/`): Supabase Auth ativo, cliente user-scoped nas
server actions e policies de RLS por tabela.

**Executar qualquer arquivo desta pasta em produção derruba o app logado**
(remove os GRANTs e as permissões que as policies atuais pressupõem). Estão
mantidos apenas como registro histórico.
