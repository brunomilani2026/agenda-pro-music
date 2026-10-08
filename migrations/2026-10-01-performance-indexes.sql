-- ============================================================
-- MIGRAÇÃO: Índices de performance
--
-- O Postgres NÃO cria índice automaticamente para colunas de FOREIGN KEY (só
-- para PRIMARY KEY/UNIQUE). Até aqui, só existiam índices em payment(status,
-- duedate), lesson_request(status), blocked_slot, credit_package e nas PKs/UNIQUEs.
-- Todas as demais consultas quentes do app — que filtram por idusers_fk /
-- idstudent_fk / account_fk — faziam varredura sequencial da tabela inteira, e o
-- custo cresce com cada aula, pagamento e notificação criados.
--
-- Cada índice abaixo casa com uma consulta real do código (o padrão de filtro
-- está no comentário). Tudo é idempotente (IF NOT EXISTS) e NÃO altera dados nem
-- lógica: só acelera leituras. Custo: um pouco mais de escrita e espaço, irrisório
-- nestas tabelas.
--
-- COMO APLICAR: Supabase → SQL Editor → colar e executar. Pode rodar de novo sem
-- efeito colateral. Se algum índice equivalente já existir com outro nome, o novo
-- apenas duplica (inofensivo; dá para dropar o antigo depois).
-- ============================================================

-- ── lesson ──────────────────────────────────────────────────
-- Janela da agenda do professor: eq(idusers_fk) + range/order em datelesson
-- (LessonService.getLessonsByUserInRange, getLessonsByUser, auto-realizada).
CREATE INDEX IF NOT EXISTS idx_lesson_user_datelesson
  ON public.lesson (idusers_fk, datelesson);

-- Conflito de horário e slots do dia: eq(idusers_fk) + eq(date)
-- (teacher-availability, cachedLessonsByUserAndDate, getLessonsByUserAndDate).
CREATE INDEX IF NOT EXISTS idx_lesson_user_date
  ON public.lesson (idusers_fk, date);

-- Vínculo direto aula→aluno: eq(student_fk)
-- (releasePendingLessons, student-sync, resolveLessonStudent).
CREATE INDEX IF NOT EXISTS idx_lesson_student_fk
  ON public.lesson (student_fk);

-- Transição agendada→realizada e crons: lessonstatus='agendada' + datelesson.
-- Índice parcial: só indexa as aulas ainda agendadas (a minoria da tabela).
CREATE INDEX IF NOT EXISTS idx_lesson_agendada_datelesson
  ON public.lesson (datelesson)
  WHERE lessonstatus = 'agendada';

-- ── student ─────────────────────────────────────────────────
-- getSessionStudent() roda em TODO request do portal do aluno: eq(account_fk).
CREATE INDEX IF NOT EXISTS idx_student_account_fk
  ON public.student (account_fk);

-- Lista de alunos do professor: eq(idusers_fk) + order(name) / ilike(name).
CREATE INDEX IF NOT EXISTS idx_student_user_name
  ON public.student (idusers_fk, name);

-- ── payment ─────────────────────────────────────────────────
-- Financeiro do professor: eq(idusers_fk) + order(duedate desc).
CREATE INDEX IF NOT EXISTS idx_payment_user_duedate
  ON public.payment (idusers_fk, duedate DESC);

-- Financeiro do aluno / cobranças: eq(idstudent_fk) + order/range em duedate.
CREATE INDEX IF NOT EXISTS idx_payment_student_duedate
  ON public.payment (idstudent_fk, duedate DESC);

-- Webhook do Asaas e conciliação: eq(asaas_payment_id) — 5 pontos no código.
CREATE INDEX IF NOT EXISTS idx_payment_asaas_payment_id
  ON public.payment (asaas_payment_id);

-- Join embutido do PostgREST aula→pagamento (payment!payment_lesson_fk_fkey) e
-- in(lesson_fk): sem índice, cada aula listada varre a tabela payment inteira.
CREATE INDEX IF NOT EXISTS idx_payment_lesson_fk
  ON public.payment (lesson_fk);

-- ── notification ────────────────────────────────────────────
-- Caixa do aluno e contagem de não lidas:
-- eq(idstudent_fk) + eq(recipient) + order(created_at desc) / eq(read).
CREATE INDEX IF NOT EXISTS idx_notification_student
  ON public.notification (idstudent_fk, recipient, created_at DESC);

-- Caixa do professor: eq(idusers_fk) + eq(recipient) + order(created_at desc).
CREATE INDEX IF NOT EXISTS idx_notification_user
  ON public.notification (idusers_fk, recipient, created_at DESC);

-- ── credit ──────────────────────────────────────────────────
-- Créditos ativos do aluno: eq(idstudent_fk) + eq(used) + gte(expires_at).
CREATE INDEX IF NOT EXISTS idx_credit_student
  ON public.credit (idstudent_fk, used, expires_at);

-- Crédito de reposição amarrado à aula de origem: eq/in(origin_lesson_fk).
CREATE INDEX IF NOT EXISTS idx_credit_origin_lesson
  ON public.credit (origin_lesson_fk);

-- ── lesson_request ──────────────────────────────────────────
-- Solicitações pendentes do professor: eq(idusers_fk) + eq(status) + order(created_at).
CREATE INDEX IF NOT EXISTS idx_lesson_request_user_status
  ON public.lesson_request (idusers_fk, status, created_at DESC);

-- Solicitações do aluno: eq(idstudent_fk) + order(created_at).
CREATE INDEX IF NOT EXISTS idx_lesson_request_student
  ON public.lesson_request (idstudent_fk, created_at DESC);

-- Reposição/remarcação por aula de origem: eq/in(original_lesson_fk).
CREATE INDEX IF NOT EXISTS idx_lesson_request_original_lesson
  ON public.lesson_request (original_lesson_fk);

-- ── teacher / teacher_pricing ───────────────────────────────
-- TeacherService.getTeacherByUser roda no boot de toda página do professor.
CREATE INDEX IF NOT EXISTS idx_teacher_user
  ON public.teacher (idusers_fk);

-- Instrumentos/preços do professor: eq(idteacher_fk) (+ instrument).
CREATE INDEX IF NOT EXISTS idx_teacher_pricing_teacher
  ON public.teacher_pricing (idteacher_fk, instrument);

-- Atualiza as estatísticas para o planner já escolher os índices novos.
ANALYZE public.lesson;
ANALYZE public.student;
ANALYZE public.payment;
ANALYZE public.notification;
ANALYZE public.credit;
ANALYZE public.lesson_request;
ANALYZE public.teacher;
ANALYZE public.teacher_pricing;
