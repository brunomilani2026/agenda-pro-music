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
