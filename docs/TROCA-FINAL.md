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

---

## 4. DNS e e-mail do domínio (achados em 08/10/2026)

Estado público de `agendapromusic.com.br`:
- **NS:** `ns1.vercel-dns.com` / `ns2.vercel-dns.com` — a DNS está na **conta Vercel do site atual**.
- **MX:** nenhum. Por isso a caixa `notificacoes@agendapromusic.com.br` (HostGator, webmail `sh00112.hostgator.com.br`) **não recebe nada**, nem respostas de alunos aos e-mails do sistema.
- **TXT:** só `brevo-code:...` (conta Brevo existe; dono ainda desconhecido). Sem SPF, sem DMARC.
- **CNAME `brevo1._domainkey` / `brevo2._domainkey`:** DKIM do Brevo — **não apagar**.
- **`mail.agendapromusic.com.br`:** aponta para IP da Vercel (não serve como servidor de e-mail).
- **EmailJS atual:** conta aberta em 23/06/2026 em nome de Bruno Milani com `notificacoes@agendapromusic.com.br`; recuperação de senha depende de a caixa voltar a receber.

Tarefas:
- [x] (feito 09/10/2026) Adicionar **1 registro MX** na DNS da Vercel (conta antiga): tipo MX, nome `@`, valor `sh00112.hostgator.com.br`, prioridade 0. Só adicionar; não editar nem apagar nenhum outro registro.
- [x] (feito, chegou) Testar recebimento (enviar do Gmail para `notificacoes@`), configurar encaminhamento no cPanel para o Gmail.
- [ ] Recuperar a conta EmailJS antiga (ou manter a conta nova do Bruno e descartar a antiga).
- [ ] Descobrir o dono da conta Brevo (recuperar senha por `notificacoes@` depois do MX) e decidir se mantém.
- [ ] Depois da troca: adicionar SPF (incluindo o Brevo) e DMARC para melhorar a entrega.
- [ ] Na troca final, o domínio passa do projeto antigo da Vercel para o novo (a DNS já está na Vercel, então não muda de provedor).

---

## 5. Asaas: o que fazer com os dados na migração (inventário de 08/10/2026)

Todo uso do Asaas no código está protegido por `process.env.ASAAS_API_KEY` (e por `asaas_customer_id`). **Sem a chave, o site já funciona em modo manual** (mensalidade gerada localmente pelo cron, Pix estático, baixa manual). Por isso não é preciso apagar o código do Asaas para a troca; a limpeza é opcional e vem depois.

Armadilhas ao migrar os dados do banco antigo:
- [ ] **Zerar `student.asaas_subscription_id`** de todos os alunos. Hoje `generateMensalidadesFromExpiredPlans` **pula** quem tem assinatura Asaas ("o Asaas emite a próxima fatura"). Se o campo ficar preenchido, esses alunos **nunca mais ganham mensalidade nova** no site sem Asaas. Também faz `fetchAlunoNextInvoiceInfo` devolver `asaas_auto` e bloquear a antecipação de fatura.
- [ ] **Cancelar as assinaturas e cobranças abertas no painel do Asaas** (senão o Asaas continua cobrando o aluno por fora do sistema).
- [ ] Faturas abertas (`pendente`/`vencido`) vindas do Asaas: o site gera o Pix estático na primeira vez que o aluno abre a fatura **somente se `asaas_pix_payload` estiver vazio**. Limpar `asaas_pix_payload`, `asaas_pix_qrcode`, `asaas_invoice_url` e `asaas_payment_id` das faturas abertas migradas, para não mostrarem o Pix/link antigo do Asaas.
- [ ] Remover a rota `app/api/webhooks/asaas` (endpoint público sem uso) e o texto "Cobrança Asaas Automática" do banner.
- [ ] O **cron de cobrança NÃO é do Asaas** (gera mensalidades, marca atrasos, bloqueia inadimplentes, manda lembretes): **manter**.
- [ ] Depois da troca: revogar a chave de API do Asaas e remover o webhook configurado lá.

---

## 6. Estado da cópia e pendências (08/10/2026, fim do dia)

Funcionando e testado na cópia (`agenda-pro-music-novo.vercel.app`): cadastro e login, aluno avulso/mensal, compra de pacote, **Pix estático validado com pagamento real** (QR idêntico ao gerado pelo app do Inter), botão "Já paguei", baixa manual, e-mails de notificação e de confirmação de cadastro (EmailJS), sem limite de alunos.

Lições que valem na troca final:
- **Pix:** o Inter recusa QR com `txid` próprio; usamos `***` (igual ao QR do Inter). Nome do recebedor `Bruno T Milani` e cidade `Braganca Paul` (abreviações do Inter). Variáveis: `PIX_CHAVE`, `PIX_NOME_RECEBEDOR`, `PIX_CIDADE`.
- **Aluno avulso não recebe fatura automática:** ele compra crédito em "Planos e Créditos". Só mensal/trimestral/semestral tem fatura gerada pelo cron.
- **Testar papéis diferentes:** usar janelas/navegadores separados (cadastrar aluno no mesmo navegador troca a sessão do professor).
- **E-mail no modo escuro do Gmail:** título dourado nos modelos (`#fbbf24`); branco/fundos explícitos foram invertidos pelo Gmail.

Pendências de segurança (fazer antes de entrar dado real):
- [ ] Gerar **nova chave secreta do Supabase novo** (a atual foi colada no chat) e atualizar `.env.local` e Vercel.
- [ ] Gerar **nova Private Key do EmailJS** se a que apareceu no chat foi a atual; colar só no `.env.local`/Vercel.
- [ ] A conta EmailJS nova usa o Gmail `musicobrunomilani@gmail.com`; trocar para SMTP do Brevo/domínio na troca final (só muda o Service ID).
- [ ] E-mails do Supabase Auth (confirmar cadastro, redefinir senha) ainda usam o envio padrão do Supabase (limite baixo): configurar SMTP próprio e colar os templates de `email-templates/supabase`.
- [ ] Vercel: remover variáveis do Asaas (`ASAAS_SANDBOX`) se ainda existirem.

Dados importados do site antigo (configuração, sem dados de aluno): pacotes (Avulsa R$150, Mensal R$450, Trimestral R$1.250, Anual R$2.300; 180 dias), instrumentos (Cavaquinho, Banjo, Banjo/Cavaquinho) e bio do professor. Alunos, aulas, pagamentos e contas de login ficam para o ensaio de migração e a troca final.

---

## 7. Migração de dados: ensaio aplicado (09/10/2026)

Ferramenta: `C:\dev\migracao-agenda\migrar.mjs` (lê o banco antigo em modo SOMENTE LEITURA e grava no novo numa transação; sem `--aplicar` apenas ensaia e desfaz). Conexões em `C:\dev\migracao-agenda\conexoes.env` (fora do Git; contêm senhas de banco: **trocar essas senhas depois da troca final**).

Copiado do banco antigo para o novo (ensaio já APLICADO): professor Bruno Milani + 23 alunos, 355 aulas, 60 pagamentos (totais idênticos), 635 notificações, 747 horários bloqueados, 15 créditos, 4 pacotes, 10 solicitações, 25 contas de login **com as senhas preservadas**, e o admin `admin@agendapromusic.com.br`.
Fora da cópia de propósito: admin do desenvolvedor (`ricardomarinho1101@...`), admin de teste, "Professor Teste" e seus 6 alunos, aluno "Ricardo Marinho", Pamela Pereira (teste).
Higiene: vínculos ao Asaas zerados (7 alunos) e faturas abertas sem dados do Asaas (o Pix próprio é gerado ao abrir a fatura).

Para a troca final (repetir com dados do dia):
- [ ] Parar escritas no site antigo (manutenção) e rodar `node migrar.mjs` (ensaio) e depois `node migrar.mjs --aplicar`.
- [ ] Repetir a higiene do Asaas e **cancelar no painel do Asaas** assinaturas e cobranças abertas.
- [ ] **O desenvolvedor é administrador do site antigo** (`ricardomarinho1101@gmail.com`): não migrar essa conta; remover do site antigo ao desligá-lo.
- [ ] Recolocar `NEXT_PUBLIC_EMAILJS_SERVICE_ID=service_1fw7xqm` na Vercel e no `.env.local` (foi esvaziado durante o ensaio para não notificar alunos reais).
- [ ] Trocar as senhas de banco dos dois projetos Supabase e apagar `conexoes.env`.

---

## 8. Alunos inativos (pedido do Bruno, 09/10/2026)

Regra nova no código: **aluno com status `inativo` fica fora de lembretes de cobrança e de atraso, lembretes de aula (diário e 1h antes), bloqueio automático por atraso e geração de mensalidade** (`lib/aluno-inativo.ts`). Faturas abertas e aulas futuras dele **permanecem** no sistema, só sem aviso/cobrança automática.

Alunos inativos hoje: **Artur Lacerda** e **Luis Montenegro** (inativados na cópia; também sem aulas futuras: as 7 do Luis foram canceladas em 09/10/2026, as do Artur já estavam; e as faturas abertas deles (R$ 275 do Artur e R$ 450 do Luis) foram canceladas; `migrar.mjs` passos 2e, 2f e 2g repetem isso na migração final).

- [ ] **No site ATUAL (antigo), a regra NÃO existe**: inativar lá não impede os avisos. Até a troca final, esses dois ainda podem receber avisos do site antigo (lembrete de atraso e de aula). Para silenciar já: cancelar/renegociar as faturas abertas deles e cancelar as aulas futuras (Luis tem 7), ou aguardar a troca.
- [ ] Na troca final, conferir se continuam `inativo` depois de rodar `migrar.mjs --aplicar`.

---

## 9. Roteiro do dia da troca (preparado em 09/10/2026)

**Achado importante:** o banco antigo tem um job do pg_cron (`*/15 * * * *`) que chama `/api/cron/aula-1h` (lembrete de 1h) e funciona (192 execuções ok em 2 dias). Ele fica no banco, **não vem na migração**. Recriar com `agendar-cron.mjs`. Os outros dois crons (cobrança 11:30 UTC e lembretes 12:00 UTC) ficam no `vercel.json`; a versão pronta é `vercel.json.troca` (o `vercel.json` atual segue com `crons: []` até o dia).

Ensaio de migração rodado em 09/10/2026: todas as contagens OK, 25 contas com senha, totais financeiros idênticos.

Ordem no dia (≈30 min):
1. [ ] Avisar alunos/professores (manutenção curta).
2. [ ] Site antigo em manutenção (sem escritas).
3. [ ] Backup do banco antigo no Drive.
4. [ ] `node migrar.mjs` (ensaio) e `node migrar.mjs --aplicar` (em `C:\dev\migracao-agenda`).
5. [ ] Vercel novo: `NEXT_PUBLIC_APP_URL=https://www.agendapromusic.com.br`; `NEXT_PUBLIC_EMAILJS_SERVICE_ID` (SMTP do domínio); **Redeploy**.
6. [ ] Supabase novo → Authentication → URL Configuration: Site URL e Redirect `https://www.agendapromusic.com.br` (+ `/**`).
7. [ ] Copiar `vercel.json.troca` por cima de `vercel.json`, commit e push.
8. [ ] Mover o domínio (`agendapromusic.com.br` e `www`) do projeto antigo para o novo.
9. [ ] `node agendar-cron.mjs --aplicar` (cria o lembrete de 1h no banco novo).
10. [ ] Testar no domínio oficial: login professor e aluno, criar aula, e-mail, Pix, foto, "Já paguei".
11. [ ] Desligar o job antigo no banco ANTIGO (`select cron.unschedule(1)`), para não duplicar lembretes se o site antigo voltar.
12. [ ] Fim da manutenção + aviso. Depois, seção 3 (remover o desenvolvedor).

## 10. Troca executada (09/10/2026, ~16h30)
- Backup do banco antigo em `Claude Code/backup-banco-antigo/` (Drive). Migração `--aplicar` OK (25 contas com senha, 355 aulas, 60 pagamentos, totais idênticos).
- Domínio: removido do projeto antigo (`calendario-de-aulas-de-musica`, conta siteagendapromusic) e adicionado ao `agenda-pro-music-novo` (conta bruno-milani). Verificação por 2 TXT `_vercel` na DNS da conta antiga (a DNS fica na Vercel antiga; o registrador é a HostGator, **não** usar o assistente "Alterar plataforma" dela).
- `www.agendapromusic.com.br` serve o site novo; o domínio sem www redireciona (308) para o www.
- Lembrete de 1h agendado no banco novo (pg_cron `aula-1h`, a cada 15 min). Crons diários religados no `vercel.json`.
- O job antigo no banco antigo continua existindo, mas chama o site novo com o segredo antigo (recebe 401, inofensivo). Some junto com o projeto antigo.
- Falta: testes no domínio oficial; seção 3 (remover o desenvolvedor, trocar chaves e senhas); SPF/DMARC; apagar `conexoes.env` ao final.
- **Fotos (Firebase):** após a troca o upload deu `storage/unauthorized`: a regra antiga do Storage tinha expirado. Corrigido em 09/10/2026 no console do Firebase (projeto do Bruno) com regra só para `avatars/{tipo}/{arquivo}`: leitura pública, escrita só imagem < 5 MB. Melhoria futura: mover as fotos para o Supabase Storage (exige login).
