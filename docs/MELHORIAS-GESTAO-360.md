# Gestão 360° do aluno — andamento

Origem: documento do Bruno (09/10/2026). Regra dele: auditar, propor, **aguardar aprovação antes de mudanças estruturais**; só adicionar (sem apagar nada); preservar dados.

## Etapas
1. [x] **Ficha em leitura** — `/alunos/[id]` (visão geral, aulas, financeiro, reposições). Publicada e validada pelo Bruno em 09/10/2026. Sem tabelas novas. Cálculo em `lib/ficha-aluno.ts`.
2. [ ] **Diário de aula + anotações** — desenho enviado, aguardando aprovação.
3. [ ] Plano de estudos (trilhas/módulos/conteúdos)
4. [ ] Biblioteca de materiais (Supabase Storage privado)
5. [ ] Tarefas e entregas
6. [ ] Portal do aluno ampliado, indicadores e alertas

## Fatos do código que guiam o desenho
- Aula liga ao aluno por `student_fk` (nova) ou só por `studentname` (antigas): sempre casar pelos dois.
- `lesson.obs` é ENVIADO POR E-MAIL ao aluno nos lembretes: **nunca** usar para anotação privada.
- Motivo de cancelamento hoje só existe para inadimplência (texto em `obs`).
- RN03: crédito de reposição só no 1º cancelamento da vida do aluno.
- RLS por professor (`idusers_fk = auth.uid()`); aluno via `my_student_ids()`. Não existe "organização": tabelas novas seguem o mesmo padrão (dono = professor) e deixam espaço para organização no futuro.
- Fotos hoje no Firebase (regra de Storage só `avatars/`); materiais novos irão para Supabase Storage.

## Andamento (atualização 09/10/2026, noite)
- Etapa 2 (diário + anotações): código publicado; SQL `03-*.sql` aplicado pelo Bruno; **resultado do teste de privacidade ainda a confirmar** (ele disse "rodei e testei").
- Etapa 3 (plano de estudos): código publicado (`/trilhas`, aba Estudos na ficha); SQL `04-*.sql` (cópia em Drive/sql-etapa-3-estudos) **ainda não aplicado**; rodar 04-plano-de-estudos e depois 04-teste-privacidade (espera "RESULTADO: TUDO CERTO").
- Decisões tomadas pelo Bruno ("faça o que achar melhor"): cópia de conteúdos por aluno; competência = texto livre com sugestões; tela "Trilhas" no menu.

## Confirmações (09/10/2026, ~18h40)
- [x] Etapa 2 (diário + anotações): SQL aplicado (tabelas lesson_record, student_note, visão lesson_record_shared). Teste de privacidade: "TUDO CERTO (18 de 18)".
- [x] Etapa 3 (plano de estudos): SQL aplicado (study_track, study_module, study_item, student_study_item). Teste de privacidade: "TUDO CERTO (12 de 12)". Bruno já criou a 1ª trilha na tela /trilhas.
- Próximas: etapa 4 (materiais, Supabase Storage privado), 5 (tarefas e entregas), 6 (portal do aluno ampliado + indicadores). Pendências da troca: GitHub antigo (senha+2FA); apagar projetos antigos Vercel/Supabase por volta de 16–24/10/2026 (backup JSON no Drive).

## Etapa 4 (09/10/2026, noite): biblioteca de materiais NO AR e validada
- Código publicado (`/materiais`, aba Materiais na ficha, materiais no registro da aula). SQL `05-*.sql` aplicado pelo Bruno (cópia no Drive: sql-etapa-4-materiais).
- O 1º teste de privacidade achou **recursão infinita** entre as regras de `material` e `material_share`; corrigido com as funções `material_is_mine` e `material_shared_with_me` (SECURITY DEFINER). Teste final: **TUDO CERTO (18 de 18)**.
- Limites: 50 MB por arquivo; plano grátis do Supabase = 1 GB de storage no total (vídeo pesado: preferir link do YouTube).
- Falta: etapa 5 (tarefas e entregas, com envio de áudio/vídeo pelo aluno) e etapa 6 (portal do aluno ampliado: ver materiais, notas compartilhadas, plano de estudos; indicadores e alertas).

## Etapa 6 (portal do aluno, parte de leitura) publicada em 09/10/2026
- Telas do aluno: `/aluno/diario` (registros liberados via visão `lesson_record_shared`, recados compartilhados e anotações PESSOAIS CRUD), `/aluno/estudos` (plano somente leitura + evolução), `/aluno/materiais` (compartilhados; arquivo por link temporário de 2 min, caminho nunca sai do servidor).
- Sem SQL novo. Pendente: Bruno validar logado como aluno (janela anônima!).
- Falta: etapa 5 (tarefas/entregas, aluno envia áudio/vídeo; exige novas tabelas + bucket de entregas) e indicadores/alertas ampliados.

## Etapa 5 (tarefas e entregas) e portal do aluno: concluídos (13/10/2026)
- Bruno confirmou "já está tudo ok" após rodar o SQL `06-*.sql` e os testes (cópia no Drive: sql-etapa-5-tarefas). **Texto exato do resultado do teste de privacidade da etapa 5 não foi enviado** (conferir se aparece "TUDO CERTO" na próxima oportunidade).
- Roteiro original (1 a 6) entregue. Melhorias futuras sugeridas: avisos automáticos (sino/e-mail) em entregas e retornos; indicadores e alertas no painel (alunos sem registro recente, faltas seguidas); mover fotos do Firebase para o Supabase Storage; desativar /cadastro público; Google Calendar, resumo para o briefing diário e integração com o app financeiro.
- Pendências da troca: GitHub antigo (senha+2FA); apagar projetos antigos Vercel/Supabase entre 16 e 24/10/2026 (backup JSON no Drive: backup-banco-antigo).

## Correção e confirmação da etapa 5 (13/10/2026)
- O SQL da etapa 5 NÃO estava aplicado quando Bruno disse "tudo ok" (a aba Tarefas mostrava "ainda não foram ativadas no banco"). Aplicado depois; teste de privacidade: **TUDO CERTO (23 de 23)**.
- Bug visual corrigido: a barra de abas da ficha encolhia a altura zero quando a página ficava comprida (faltava shrink-0).
- Lição: quando a tela diz "não foi ativado no banco", é o SQL que não rodou; conferir com `select table_name from information_schema.tables ...` antes de presumir.

## Atualização 13/10/2026
- Backup automático: `C:\dev\migracao-agenda\backup-novo.mjs` (lê o .env.local; grava em Drive/backup-banco-novo/AAAA-MM-DD-HH-MM; guarda os 8 últimos). Agendado no Windows: "Backup Agenda Pro Music", domingos 20h.
- Cadastro público de professor fechado (reabre com ALLOW_TEACHER_SIGNUP=1). Cabeçalhos de segurança em next.config.ts.
- Painel "Atenção" no início do professor (lib/painel-alertas.ts + dashboard/PainelAlertas.tsx).
- Pendentes: nível musical, gestão completa de reposições, log/LGPD, fotos Firebase→Supabase, integrações; limpeza dos projetos antigos (16–24/10).

## Atualização 13/10/2026 (tarde)
- Painel "Atenção": diário só conta aulas após 13/10/2026 e vira 1 linha. 
- Nível musical (SQL 07) e trava do aluno na própria ficha (SQL 08): aplicados e testados (TUDO CERTO).
- Google Agenda por link: rota /api/calendario?t=<ICS_TOKEN> (env ICS_TOKEN, ICS_TEACHER_ID na Vercel). Só primeiro nome + instrumento. Para desligar: apagar ICS_TOKEN e Redeploy.
- Resumo diário por e-mail: /api/cron/resumo, vercel.json "0 10 * * *" (07h BRT, ±1h). Bruno filtra no Gmail (assunto "Resumo do dia" -> marcador "Agenda Pro", pula caixa de entrada) para o briefing ler.
- Reposições completas: decidido NÃO fazer por ora. App financeiro: fora de escopo.
- Pendente: limpeza dos projetos antigos Vercel/Supabase/GitHub (16–24/10/2026); incluir seção Agenda Pro no briefing (Assistente Executivo).
