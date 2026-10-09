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
