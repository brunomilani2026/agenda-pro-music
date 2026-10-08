# 📧 Templates de E-mail — Agenda Pro Music

Todos os e-mails do sistema, no tema da marca (fundo claro, cabeçalho escuro `#18181b` com faixa dourada `#f59e0b`).

O sistema usa **dois canais de envio**, cada um configurado em um painel diferente:

| Canal | Para quê | Onde configurar |
|-------|----------|-----------------|
| **Supabase Auth** | E-mails de autenticação (confirmar cadastro, redefinir senha…) | Painel do **Supabase** |
| **EmailJS (via Brevo)** | Notificações do app (ativação de aluno, boas-vindas) | Painel do **EmailJS** |

Remetente de todos: **`notificacoes@agendapromusic.com.br`** (entregue pelo SMTP do Brevo).

---

## 🔐 Supabase Auth — pasta `supabase/`

**Onde:** Supabase → **Authentication → Emails → Templates** (uma aba para cada).
**Variáveis:** sintaxe do Supabase (Go), ex.: `{{ .ConfirmationURL }}`. ⚠️ **Não altere os nomes das variáveis.**

| Arquivo | Aba no Supabase | Assunto sugerido | Essencial? |
|---------|-----------------|------------------|------------|
| `confirm-signup.html` | Confirm sign up | `Confirme seu cadastro - Agenda Pro Music` | ✅ Sim |
| `reset-password.html` | Reset Password | `Redefinir senha - Agenda Pro Music` | ✅ Sim |
| `magic-link.html` | Magic Link | `Seu link de acesso - Agenda Pro Music` | Opcional |
| `change-email.html` | Change Email Address | `Confirme seu novo e-mail - Agenda Pro Music` | Opcional |

### 🔔 Avisos de segurança (notificações nativas do Supabase)

Em **Authentication → Emails**, abaixo dos templates de ação, há os **toggles de notificação** — o Supabase envia o aviso sozinho, sem código no app. Já estão **ativados** e com template configurado no painel:

| Toggle no Supabase | Quando dispara | Status |
|--------------------|----------------|--------|
| **Password changed** | Sempre que a senha muda **via Supabase Auth** (redefinição em `/redefinir-senha` e troca logado em Configurações) | ✅ Ativo |
| **Email address changed** | Quando o e-mail muda via Supabase Auth | ✅ Ativo (sem fluxo de troca no app ainda) |
| **Phone number changed** | Quando o telefone muda via Supabase Auth | ✅ Ativo (não usado) |

> ⚠️ Esses avisos **só disparam se a mudança passar pelo Supabase Auth**. Por isso o `changePassword` (Configurações) foi roteado para `supabase.auth.updateUser({ password })` — antes ele só atualizava o hash bcrypt da tabela e não notificava (nem mudava a senha de login de verdade).
> O HTML desses templates é editado **direto no painel do Supabase** (sintaxe Go, ex.: `{{ .Email }}`); não há cópia no repositório.

## 📨 EmailJS — pasta `emailjs/`

**Onde:** EmailJS → **Email Templates** → criar template e colar o HTML no campo **Content**.
**Variáveis:** sintaxe do EmailJS, ex.: `{{student_name}}`. ⚠️ **Não altere os nomes** (o código envia exatamente esses).

> ⚠️ **Plano grátis do EmailJS = só 2 templates.** Por isso usamos **1 template genérico reaproveitável** (`notification.html`) para a maioria dos avisos, e **1 dedicado** para a ativação de aluno. Os avisos de senha/e-mail alterados ficam no **Supabase** (não gastam slot do EmailJS).

### Slot 1 — Genérico (reaproveitável)

| Arquivo | Variáveis | Assunto | Usado em | Env (Template ID) |
|---------|-----------|---------|----------|-------------------|
| `notification.html` | `to_name`, `title`, `message`, `button_label`, `button_url` | dinâmico (passe via `title`) | **pagamentos, aulas, boas-vindas e qualquer aviso transacional** | `EMAILJS_TEMPLATE_NOTIFICATION` |

Enviado pelo helper `EmailService.sendNotification(...)`. O campo `message` aceita quebras de linha (`\n`) — o template preserva via CSS `white-space: pre-line`. Exemplo:

```ts
await EmailService.sendNotification({
  toEmail: student.email,
  toName: student.name,
  title: 'Pagamento confirmado',
  message: `Recebemos seu pagamento. Tudo certo!\n\nValor: R$ 450,00\nReferente: Mensalidade de julho`,
  buttonLabel: 'Ver meus pagamentos',
  buttonUrl: `${process.env.NEXT_PUBLIC_APP_URL}/aluno/dashboard`,
});
```

### Slot 2 — Dedicado

| Arquivo | Variáveis | Assunto sugerido | Usado em | Env (Template ID) |
|---------|-----------|------------------|----------|-------------------|
| `student-confirmation.html` | `student_name`, `teacher_name`, `activation_link` | `Confirme seu cadastro - Agenda Pro Music` | ativação de aluno (link/token crítico) | `EMAILJS_TEMPLATE_STUDENT_CONFIRM` |

> `teacher-welcome.html` continua na pasta como referência, mas **as boas-vindas do professor saem pelo template genérico** (`title: "Bem-vindo(a)!"`, botão para `/login`). Não há template dedicado a boas-vindas no painel — os 2 slots do plano grátis são os da tabela acima.
>
> ⚠️ A env `EMAILJS_TEMPLATE_TEACHER_WELCOME` ficou órfã: apontava para um template que não existe mais, então o e-mail de boas-vindas falhava com HTTP 400 e nunca chegava. Nenhum código a lê hoje — pode ser removida da Vercel.

> Em cada template do EmailJS, na aba **Settings**:
> **To Email** = `{{to_email}}` · **From Name** = `Agenda Pro Music` · **From Email** = `notificacoes@agendapromusic.com.br`
>
> Após criar cada template no painel do EmailJS, copie o **Template ID** para a variável de ambiente correspondente (coluna acima). Sem ela, o aviso é silenciosamente ignorado.

---

### Observação
Os arquivos `student-confirmation.html` e `teacher-welcome.html` na raiz desta pasta são as versões antigas — as versões organizadas e atuais estão em `emailjs/`.
