# Agenda Pro Music — Lista da troca final

Objetivo: o site novo (`agenda-pro-music-novo`) assume o lugar do site atual (`agendapromusic.com.br`), com **tudo na mão do Bruno** e **sem acesso do desenvolvedor**.

Este arquivo não tem senhas nem chaves. Marque `[x]` conforme for concluindo.

---

## 0. Decisões já tomadas

- [x] **Asaas sai.** Não vamos configurar Asaas sandbox nem manter o Asaas no site novo.
- [x] **Pix estático com confirmação manual** substitui o Asaas (decisão do Bruno: o Inter MEI não oferece API Pix com webhook). Ver seção 1.3.
- [x] **Fotos de perfil continuam** como estão (Firebase Storage). Ver item 3.4 sobre quem é o dono do Firebase.
- [x] **Alunos e professores não se cadastram de novo**: migramos contas (com as senhas) e todos os dados.
- [x] Dados reais só entram no **ensaio** e na **troca final**, nunca antes (LGPD: nome, telefone, CPF de alunos).

---

## 1. Antes da troca (preparação)

### 1.1 Produto
- [ ] Melhorias que o Bruno quer estão prontas e testadas (lista a definir).
- [ ] Teste completo na cópia: cadastro de professor, aluno, aula, remarcação, cancelamento, crédito, notificação.
- [ ] Confirmar o que o `aula-1h` e os lembretes precisam para rodar (ver 1.4).

### 1.2 Contas e chaves novas (tudo em nome do Bruno)
- [ ] **Supabase novo**: gerar **nova chave secreta** (a atual foi colada no chat) e trocar no `.env.local` e na Vercel.
- [ ] `CRON_SECRET` novo (a atual está só no `.env.local`/Vercel, mas gerar outra na troca).
- [ ] **EmailJS próprio**: criar conta e serviço em nome do Bruno; recriar os templates da pasta `email-templates/emailjs`; preencher as 6 variáveis `EMAILJS_*`. Confirmar de quem é a conta EmailJS atual.
- [ ] **E-mail de autenticação do Supabase**: configurar SMTP próprio (o padrão do Supabase tem limite baixíssimo de e-mails por hora) e colar os templates de `email-templates/supabase` (confirmação, redefinir senha, magic link, troca de e-mail).
- [ ] **Firebase**: descobrir de quem é o projeto Firebase atual. Se for do desenvolvedor, **criar um projeto do Bruno, copiar as fotos e atualizar os endereços no banco**; se for do Bruno, só conferir os acessos.
- [ ] Supabase novo: ativar **backup** (plano grátis não tem; combinar export periódico ou plano Pro).
- [ ] Vercel: o plano Hobby é só para uso não comercial. Como o site vai receber pagamentos, avaliar o **Pro**.

### 1.3 Pix direto (substitui o Asaas)
Pontos do código que usam Asaas e precisam ser trocados:
- `lib/asaas.ts`
- `services/payment.service.ts`
- `app/api/webhooks/asaas/route.ts`
- `app/api/cron/cobranca/route.ts`
- compra de créditos do aluno (`app/(aluno)/aluno/compra-creditos`) e financeiro (professor e aluno)
- colunas `asaas_*` no banco (podem ficar sem uso)

Opções para o Pix (definir antes de codar):
- [x] **A. ESCOLHIDA — Pix estático (copia e cola + QR)** com **confirmação manual** pelo professor. Sem custo, sem baixa automática.
- [ ] (descartada por ora) **B. API Pix de um banco ou instituição de pagamento** (cobrança com baixa automática por webhook). Depende do banco do Bruno oferecer API Pix; exige certificado e cadastro.
- [ ] Decidir também: o que fazer com **cobranças e assinaturas pendentes no Asaas** no dia da troca (deixar liquidar, cancelar ou refazer como Pix).

### 1.4 Tarefas automáticas
- [ ] No banco atual, rodar `select * from cron.job;` para ver se há **jobs do pg_cron** (o banco atual tem `pg_cron` e `pg_net`) que disparam lembretes ou o `aula-1h`. O `vercel.json` do código só agenda 2 rotas; o resto pode estar no banco e **não foi copiado**.
- [ ] Recriar os agendamentos necessários no site novo (Vercel Cron ou pg_cron).
- [ ] No site novo, `vercel.json` está com `"crons": []`. **Religar só na troca final**, sem a rota `cobranca` se o Asaas sair.

### 1.5 Ensaio de migração de dados
- [ ] Receber a *connection string* do banco atual (o Bruno coloca num arquivo local, **nunca no chat**).
- [ ] Copiar para um projeto Supabase de ensaio: tabelas do `public` **e** contas de login (`auth.users` e `auth.identities`, com os hashes de senha), mantendo os mesmos IDs.
- [ ] Conferir: contagem de professores, alunos, aulas, pagamentos; login de um professor e de um aluno reais com a senha de sempre; valores e datas.
- [ ] Anotar quanto tempo a cópia leva (define a janela de manutenção).

---

## 2. Dia da troca

Escolher horário de pouco movimento (por exemplo, à noite).

1. [ ] Avisar professores e alunos (manutenção curta).
2. [ ] Colocar o site atual em manutenção (ou pausar escritas).
3. [ ] **Backup completo do banco atual** (arquivo guardado no Drive, fora do site).
4. [ ] Copiar dados finais (mesmo procedimento do ensaio) para o Supabase novo.
5. [ ] Conferir contagens e testar logins.
6. [ ] Supabase novo → **Authentication → URL Configuration**: Site URL e Redirect URLs com `https://www.agendapromusic.com.br`.
7. [ ] Vercel (projeto novo): `NEXT_PUBLIC_APP_URL=https://www.agendapromusic.com.br`; conferir todas as variáveis; **Redeploy**.
8. [ ] **Mover o domínio**: tirar `agendapromusic.com.br` e `www` do projeto antigo e adicionar ao projeto novo (o domínio está na conta Vercel do site antigo; se o DNS for de outro provedor, apontar de lá).
9. [ ] Religar crons necessários.
10. [ ] Testar no domínio oficial: login de professor, aluno, criar aula, e-mail chegando, Pix, foto de perfil.
11. [ ] Tirar a manutenção e avisar.

Plano B: se algo grave aparecer, devolver o domínio ao projeto antigo (que continua intacto) e investigar.

---

## 3. Depois da troca: tirar o desenvolvedor e trocar tudo

Fazer **no mesmo dia ou no seguinte**. O desenvolvedor (usuário GitHub `RicardoMarinho-code`) já abriu PRs direto no repositório do site atual, então tem acesso de escrita lá.

### 3.1 GitHub
- [ ] Repositório do site atual (`siteagendapromusic-cloud/calendario-de-aulas-de-musica`) → **Settings → Collaborators**: remover o desenvolvedor.
- [ ] Conferir **Deploy keys**, **Webhooks**, **GitHub Apps/OAuth Apps** autorizados e **Actions secrets**.
- [ ] Se possível, arquivar (read-only) ou apagar o repositório antigo depois dos dias de segurança.
- [ ] Repositório novo (`brunomilani2026/agenda-pro-music`): conferir que só o Bruno tem acesso.

### 3.2 Vercel
- [ ] Conta/projeto do site antigo: **Settings → Members**: remover qualquer acesso do desenvolvedor.
- [ ] Revogar **tokens de acesso** (Account Settings → Tokens) e integrações.
- [ ] Conferir as **variáveis de ambiente** do projeto antigo (o desenvolvedor pode ter chaves salvas lá) e apagar o projeto quando for seguro.

### 3.3 Supabase (projeto antigo)
- [ ] **Organization → Team**: remover o desenvolvedor.
- [ ] **Girar as chaves**: JWT secret / chaves de API (anon e service role / secret). **Trocar a senha do banco.**
- [ ] Revogar tokens de acesso pessoais, se houver.
- [ ] Pausar ou apagar o projeto antigo **somente** depois de guardar o backup final e passar os dias de segurança.

### 3.4 Firebase
- [ ] Remover o desenvolvedor do projeto (ou migrar para projeto do Bruno, ver 1.2).
- [ ] Girar a chave de API se ela estiver ligada a ele.

### 3.5 EmailJS
- [ ] Se a conta atual for do desenvolvedor: não será mais usada; a do Bruno já está em uso. Se for do Bruno: trocar a senha e as chaves (pública e privada), tirar acessos.

### 3.6 Asaas
- [ ] Mesmo sem uso, **girar/revogar a chave de API** e remover o webhook antigo. Decidir o encerramento da conta depois de liquidar o que estiver pendente.

### 3.7 Domínio e e-mails
- [ ] Conferir quem é o **dono do domínio** `agendapromusic.com.br` (Registro.br ou outro). Garantir que está no CPF/CNPJ e e-mail do Bruno e **sem o desenvolvedor como contato**.
- [ ] Trocar a senha das contas de e-mail usadas no site antigo (`siteagendapromusic@gmail.com`, se o desenvolvedor souber) e ativar **verificação em duas etapas**.

### 3.8 Fechamento
- [ ] Trocar **todas** as chaves e senhas citadas neste arquivo; guardar num gerenciador de senhas.
- [ ] Guardar backup final do banco antigo no Drive por pelo menos 90 dias.
- [ ] Combinar com o desenvolvedor a entrega de documentação ou acessos que só ele tenha (se houver), **antes** de remover tudo.
