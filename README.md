# Agenda Pro Music 

## 1. Objetivo do Documento 
Este documento descreve os requisitos

-funcionais e técnicos do sistema **Agenda Pro Music**, uma plataforma web destinada a professores de música para gerenciamento de alunos, aulas e finanças.

O objetivo deste documento é fornecer informações claras para os desenvolvedores responsáveis pela implementação da aplicação

## 2. Visão Geral do Sistema
A Agenda Pro Music será uma aplicação web que permitirá que professores de música gerenciem suas atividades de ensino em uma única plataforma

O sistema centralizará:
- Gestão de alunos
- Organização de agenda
- Controle de aulas
- Controle financeiro
- Gerenciamento de pacotes de aulas

## 3. Arquitetura do Software
### Frontend
Tecnologias sugeridas:
- React
- Next.js
- TailwindCSS
- Biblioteca de Calendário (FullCalendar ou similar)

### Backend
- Node.js (Express ou NestJS)
**OU**
- Supabase (PostgreSQL + Auth)

### Banco de Dados
- PostgreSQL

### Hospedagem
- HostGator / VPS
- Vercel para testes e validação

## 4. Tipos de Usuários
### Professor
Usuário principal da plataforma
**Permissões:**
- Cadastrar alunos
- Gerenciar agenda
- Registrar aulas
- Registrar pagamentos
- Visualizar relatórios
- Gerenciar pacotes de aulas

### Administrador
Usuário responsável pela gestão da plataforma.  
**Permissões:**
- Aprovar cadastro de professores
- Visualizar usuários
- Bloquear contas
- Alterar planos
- Visualizar métricas da plataforma

## 5. Requisitos Funcionais

### RF01 – Cadastro de Professor
O sistema deve permitir que um professor solicite cadastro.  
*Nota: Serão enviados emails automáticos para: (a) confirmação de recebimento do cadastro, (b) notificação de aprovação e (c) notificação de rejeição (com campo opcional para motivo)*

**Campos obrigatórios:**
- Nome
- Email
- Telefone
- Instrumento principal
- Cidade
- Experiência

**Status possíveis:** Pendente, Aprovado, Rejeitado.

**Fluxo:**
1. Professor envia cadastro
2. Sistema salva como pendente
3. Admin analisa
4. Admin aprova ou rejeita
5. Sistema envia email automático

### RF02 – Autenticação
Autenticação baseada em **Email + Senha**.  
O sistema deve permitir:
- Login
- Logout
- Recuperação de senha

### RF03 – Cadastro de Alunos
Cada professor poderá cadastrar alunos.

**Campos:**
- Nome
- Telefone
- Email
- Instrumento
- Valor da aula
- Observações
- Tipo de pagamento

### RF04 – Limite de Plano
**Plano gratuito:** Máximo de 2 alunos.  
Caso o limite seja atingido, o sistema deve exibir no Dashboard, ao tentar cadastrar um novo aluno, a seguinte mensagem: *"Você atingiu o limite do plano gratuito. Faça upgrade para continuar."*

### RF05 – Agenda de Aulas
O sistema deve possuir um calendário para gerenciar as aulas.  
*Atenção à Remarcação: Ao remarcar, a aula original muda para status "remarcada" e uma nova entrada com status "agendada" é criada, ou apenas a data/horário da entrada existente é alterada (conforme definição de regra de negócio).*

**Funcionalidades:**
- Criar aula
- Editar aula
- Cancelar aula
- Remarcar aula
- Marcar aula como realizada

**Campos:**
- Aluno
- Data
- Horário
- Duração
- Observações

**Status da aula:** Agendada, Realizada, Cancelada, Remarcada.

### RF06 – Pacotes de Aulas
*Cálculo Financeiro: Deve haver um campo na tabela de pagamentos ou pacotes para vincular o pagamento à compra do pacote, garantindo o controle financeiro correto.*

**Campos:**
- Aluno
- Quantidade de aulas
- Valor total
- Validade (opcional)

**Controle automático:**
- Aulas usadas
- Aulas restantes
*(Quando aula = realizada → sistema reduz 1 aula do pacote)*

### RF07 – Controle Financeiro
O sistema deve permitir registrar pagamentos.

**Campos:**
- Aluno
- Valor
- Data
- Método de pagamento
- Observação

**Métodos de Pagamento:** Pix, Dinheiro, Cartão, Transferência.

### RF08 – Relatórios
O sistema deve gerar relatórios básicos no escopo do MVP para garantir que o professor tenha visibilidade do seu negócio desde a primeira versão.

**Relatórios:**
- Faturamento mensal
- Faturamento por aluno
- Total de aulas realizadas
- Total de aulas canceladas

**Visualização:** Tabela e Gráfico.

### RF09 – Notificações
O sistema deve gerar notificações in-app (com envio de emails/SMS como funcionalidade futura) para:
- Aula próxima
- Pacote acabando
- Cadastro aprovado
- Limite de alunos atingido

## 6. Requisitos Não Funcionais
*Importantes para a arquitetura SaaS:*

- **Performance:** O sistema deve suportar até 1.000 professores simultâneos (MVP).
- **Segurança:** Autenticação segura, criptografia de senha, controle de acesso por tipo de usuário.
- **Usabilidade:** Interface simples, criação rápida de aulas, navegação intuitiva.
- **Escalabilidade:** Permitir expansão futura para app mobile, integração com pagamentos e com Google Calendar.

## 7. Estrutura de Banco de Dados

### Tabela: `users`
- `id`
- `name`
- `email`
- `password`
- `role`
- `plan`
- `status`
- `created_at`
- *[Perfil do Professor]*: `instrumento_principal`, `cidade`, `modalidade_aula`, `experiencia` *(Adicionados à tabela user ou em uma tabela separada `teachers_profile` ligada por `user_id`)*

### Tabela: `students`
- `id`
- `teacher_id` *(usado para controle de acesso do professor)*
- `name`
- `phone`
- `email`
- `instrument`
- `lesson_price`
- `notes`
- `payment_method`
- `created_at`

### Tabela: `lessons`
- `id`
- `teacher_id`
- `student_id`
- `date`
- `time`
- `duration`
- `status`
- `notes`
- `created_at`

### Tabela: `packages`
- `id`
- `student_id`
- `total_lessons`
- `used_lessons`
- `expiration_date`
- `created_at`

### Tabela: `payments`
- `id`
- `student_id`
- `amount`
- `payment_method`
- `payment_date`
- `notes`
- `created_at`

## 8. Telas do Sistema
- Login
- Cadastro de professor
- Dashboard
- Lista de alunos
- Cadastro de aluno
- Agenda de aulas
- Registro de aula
- Financeiro
- Relatórios
- Perfil | Upgrade de plano

## 9. Painel Administrativo (Admin)
**Funções:**
- Aprovar professores
- Rejeitar cadastro
- Listar usuários
- Bloquear contas
- Alterar plano
- Visualizar métricas

## 10. Escopo de Entrega

### Escopo Implementado (Pronto para Produção)
- Cadastro de professores e aprovação de cadastro
- Login e proteção de rotas com Edge Middleware
- Cadastro de alunos e bloqueio automático de inadimplentes
- Agenda de aulas, registro de aulas e bloqueio de horários
- Integração de Pagamentos via Pix/Boleto (Asaas) e Webhooks
- Sistema de Reposição e Créditos
- Notificações In-App e envio de Emails automáticos (EmailJS)
- Dashboard e relatórios financeiros

### Funcionalidades Futuras
- App mobile nativo
- Aulas em grupo
- Envio de materiais e PDFs
- Integração com Google Calendar

---

**Conclusão**  
O **Agenda Pro Music** será uma plataforma SaaS voltada para professores de música, com foco em organização de aulas, alunos e finanças. O sistema será desenvolvido inicialmente como **MVP**, permitindo a validação de mercado antes da expansão para novas funcionalidades.
