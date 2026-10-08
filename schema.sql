CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TYPE userType AS ENUM ('professor', 'admin');
CREATE TYPE status AS ENUM ('approved', 'waiting_approvement');
CREATE TYPE lessonStatus AS ENUM ('in_progress', 'done');

SET datestyle TO 'ISO, DMY';

CREATE TABLE IF NOT EXISTS student (
    idstudent UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    instrument VARCHAR(100),
    lessonprice DECIMAL(10,2),
    paymentmethod VARCHAR(50),
    status VARCHAR(20) DEFAULT 'ativo',
    totallessons INT DEFAULT 0,
    usedlessons INT DEFAULT 0,
    notes varchar(255),
    idusers_fk UUID REFERENCES users(idusers),
    avatar_url TEXT
);

CREATE TABLE users (
    idUsers UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    Fname VARCHAR(255) NOT NULL,
    email VARCHAR(45) UNIQUE NOT NULL,
    userType userType NOT NULL,
    accountStatus status DEFAULT 'waiting_approvement',
    isPremium BOOLEAN DEFAULT FALSE
);

CREATE TABLE teacher (
    idTeacher UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    password VARCHAR(255) NOT NULL,
    cpf CHAR(11) UNIQUE NOT NULL,
    info VARCHAR(255),
    idUsers_fk UUID NOT NULL REFERENCES users(idUsers) ON DELETE CASCADE,
    avatar_url TEXT
);

CREATE TABLE IF NOT EXISTS teacher_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idteacher_fk UUID NOT NULL REFERENCES teacher(idTeacher) ON DELETE CASCADE,
    instrument VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- No máximo um instrumento principal por professor.
CREATE UNIQUE INDEX IF NOT EXISTS teacher_pricing_one_primary
    ON teacher_pricing (idteacher_fk) WHERE is_primary;

CREATE TABLE admin (
    idAdmin UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    password VARCHAR(255) NOT NULL,
    idUsers_fk UUID NOT NULL REFERENCES users(idUsers) ON DELETE CASCADE
);

CREATE TABLE lesson (
    idLesson UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dateLesson TIMESTAMPTZ NOT NULL,
    studentName VARCHAR(255) NOT NULL,
    lessonPrice DECIMAL(10,2),
    obs TEXT,
    lessonStatus lessonStatus DEFAULT 'in_progress',
    idUsers_fk UUID NOT NULL REFERENCES users(idUsers)
);

CREATE TABLE instrument (
    idInstrument UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nameInstrument VARCHAR(45) NOT NULL,
    hasStrings BOOLEAN DEFAULT FALSE,
    hasKeys BOOLEAN DEFAULT FALSE,
    idTeacher_fk UUID REFERENCES teacher(idTeacher),
    idLesson_fk UUID REFERENCES lesson(idLesson),
    idAdmin_fk UUID REFERENCES admin(idAdmin)
);

CREATE TABLE phone_number (
    idPhone_number UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ddd VARCHAR(3) NOT NULL,
    phone_number VARCHAR(9) NOT NULL
);

CREATE TABLE phone_number_has_users (
    idPhone_fk UUID NOT NULL REFERENCES phone_number(idPhone_number) ON DELETE CASCADE,
    idUsers_fk UUID NOT NULL REFERENCES users(idUsers) ON DELETE CASCADE,
    PRIMARY KEY (idPhone_fk, idUsers_fk)
);

CREATE TABLE instrument_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO instrument_catalog (name) VALUES 
('Violão'), ('Guitarra'), ('Piano / Teclado'), ('Canto'), ('Bateria'), ('Baixo'), ('Violino'), ('Saxofone'), ('Cavaquinho'), ('Banjo'), ('Outros');

ALTER TYPE lessonStatus ADD VALUE IF NOT EXISTS 'agendada';
ALTER TYPE lessonStatus ADD VALUE IF NOT EXISTS 'realizada';
ALTER TYPE lessonStatus ADD VALUE IF NOT EXISTS 'cancelada';
ALTER TYPE lessonStatus ADD VALUE IF NOT EXISTS 'remarcada';

ALTER TABLE lesson ADD COLUMN IF NOT EXISTS starttime VARCHAR(5);
ALTER TABLE lesson ADD COLUMN IF NOT EXISTS endtime VARCHAR(5);
ALTER TABLE lesson ADD COLUMN IF NOT EXISTS instrument VARCHAR(45);
ALTER TABLE lesson ADD COLUMN IF NOT EXISTS teachername VARCHAR(255);
ALTER TABLE lesson ADD COLUMN IF NOT EXISTS date VARCHAR(15);

-- Novas alterações solicitadas
ALTER TYPE usertype ADD VALUE IF NOT EXISTS 'aluno';
ALTER TABLE student ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);
ALTER TABLE student ADD COLUMN IF NOT EXISTS packagetype VARCHAR(50);
ALTER TABLE student ADD COLUMN IF NOT EXISTS expirationdate DATE;

-- ============================================================
-- EXTENSÃO RAIZTECH — Novas tabelas e colunas
-- ============================================================

-- Colunas extras na tabela student
ALTER TABLE student ADD COLUMN IF NOT EXISTS password VARCHAR(255);
ALTER TABLE student ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(100);

-- Tabela de solicitações de aula (agendamento/remarcação/cancelamento)
CREATE TABLE IF NOT EXISTS lesson_request (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idstudent_fk UUID NOT NULL REFERENCES student(idstudent) ON DELETE CASCADE,
    idusers_fk UUID NOT NULL REFERENCES users(idusers),
    type VARCHAR(20) NOT NULL CHECK (type IN ('agendamento', 'remarcacao', 'cancelamento')),
    original_lesson_fk UUID REFERENCES lesson(idlesson),
    requested_date VARCHAR(15),
    requested_starttime VARCHAR(5),
    requested_endtime VARCHAR(5),
    instrument VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'recusada')),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de pagamentos / cobranças (substitui localStorage)
CREATE TABLE IF NOT EXISTS payment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idstudent_fk UUID NOT NULL REFERENCES student(idstudent) ON DELETE CASCADE,
    idusers_fk UUID NOT NULL REFERENCES users(idusers),
    amount DECIMAL(10,2) NOT NULL,
    duedate DATE NOT NULL,
    paymentdate DATE,
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'vencido', 'cancelado')),
    method VARCHAR(20) CHECK (method IN ('pix', 'boleto', 'cartao', 'dinheiro', 'transferencia')),
    asaas_payment_id VARCHAR(100),
    asaas_invoice_url TEXT,
    fine DECIMAL(10,2) DEFAULT 0,
    interest DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de notificações
CREATE TABLE IF NOT EXISTS notification (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idusers_fk UUID REFERENCES users(idusers),
    idstudent_fk UUID REFERENCES student(idstudent) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('confirmacao', 'lembrete', 'cancelamento', 'cobranca', 'manual', 'sistema')),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de feedback (avaliação 1-5 estrelas + comentário livre)
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idusers_fk UUID REFERENCES users(idusers) ON DELETE CASCADE,
    rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de créditos de reposição
CREATE TABLE IF NOT EXISTS credit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idstudent_fk UUID NOT NULL REFERENCES student(idstudent) ON DELETE CASCADE,
    idusers_fk UUID NOT NULL REFERENCES users(idusers),
    origin_lesson_fk UUID REFERENCES lesson(idlesson),
    expires_at DATE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de tokens de recuperação de senha
CREATE TABLE IF NOT EXISTS password_reset_token (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraints de segurança
ALTER TABLE student ADD CONSTRAINT unique_student_cpf UNIQUE (cpf);
ALTER TABLE student ADD CONSTRAINT unique_student_email UNIQUE (email);

ALTER TABLE student ADD COLUMN IF NOT EXISTS asaas_subscription_id VARCHAR(100);

-- ============================================================
-- MIGRAÇÃO: Suporte a PIX QR Code e rastreamento de créditos
-- ============================================================
ALTER TABLE payment ADD COLUMN IF NOT EXISTS credits_qty INT DEFAULT 0;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS asaas_pix_qrcode TEXT;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS asaas_pix_payload TEXT;

-- ============================================================
-- MIGRAÇÃO: Bio do professor e campos extras
-- ============================================================
ALTER TABLE teacher ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE teacher ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE teacher ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE teacher ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- ============================================================
-- MIGRAÇÃO: Combos de créditos por professor
-- Cada professor define seus próprios pacotes (avulso/mensal/etc.)
-- O servidor é a fonte autoritativa de preço e quantidade de créditos.
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_package (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idusers_fk UUID NOT NULL REFERENCES users(idusers) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    credits INT NOT NULL CHECK (credits > 0),
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    validity_days INT NOT NULL DEFAULT 180 CHECK (validity_days > 0),
    popular BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE credit_package ADD COLUMN IF NOT EXISTS validity_days INT NOT NULL DEFAULT 180;

CREATE INDEX IF NOT EXISTS idx_credit_package_teacher ON credit_package(idusers_fk, active);

-- Espelhamos a validade no payment para que o webhook possa liberar créditos
-- com a regra que valia no momento da compra (mesmo que o combo seja editado depois).
ALTER TABLE payment ADD COLUMN IF NOT EXISTS credits_validity_days INT;

-- ============================================================
-- MIGRAÇÃO: Renegociação de pagamentos
-- Permite que o professor crie um novo vencimento para faturas
-- em atraso, mantendo rastro do pagamento original.
-- ============================================================
ALTER TABLE payment ADD COLUMN IF NOT EXISTS renegotiated_from UUID REFERENCES payment(id);
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_status_check;
ALTER TABLE payment ADD CONSTRAINT payment_status_check
  CHECK (status IN ('pendente', 'pago', 'vencido', 'cancelado', 'renegociado'));

-- ============================================================
-- MIGRAÇÃO: Pagamento obrigatório para aulas agendadas pelo aluno
-- ============================================================
ALTER TYPE lessonStatus ADD VALUE IF NOT EXISTS 'aguardando_pagamento';
ALTER TABLE payment ADD COLUMN IF NOT EXISTS lesson_fk UUID REFERENCES lesson(idlesson);

-- ============================================================
-- MIGRAÇÃO: Rastreamento de KPI — tempo de aprovação de solicitações
-- ============================================================
ALTER TABLE lesson_request ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_lesson_request_status ON lesson_request(status);
CREATE INDEX IF NOT EXISTS idx_payment_status_duedate ON payment(status, duedate);

-- ============================================================
-- MIGRAÇÃO: Horários bloqueados pelo professor
-- ============================================================
CREATE TABLE IF NOT EXISTS blocked_slot (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idusers_fk UUID NOT NULL REFERENCES users(idusers) ON DELETE CASCADE,
    date VARCHAR(10) NOT NULL,
    starttime VARCHAR(5) NOT NULL,
    endtime VARCHAR(5) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blocked_slot_user_date ON blocked_slot(idusers_fk, date);

-- ============================================================
-- MIGRAÇÃO: Dias de folga recorrentes do professor (por dia da semana)
-- ============================================================
CREATE TABLE IF NOT EXISTS teacher_day_off (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idusers_fk UUID NOT NULL REFERENCES users(idusers) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(idusers_fk, day_of_week)
);
-- ============================================================
-- MIGRAÇÃO: Desconto por aluno nas compras de créditos
-- O professor define um desconto individual na ficha do aluno,
-- aplicado no servidor sobre o preço dos pacotes de créditos.
-- 'percent' = % sobre o pacote | 'fixed' = R$ abatido do pacote
-- ============================================================
ALTER TABLE public.student
  ADD COLUMN IF NOT EXISTS discount_type VARCHAR(10) NOT NULL DEFAULT 'percent'
    CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (discount_value >= 0);

-- ============================================================
-- SINCRONIZAÇÃO: colunas que o código usa mas que não estavam versionadas
-- aqui (getSessionStudent, NotificationService, resolveLessonStudent, crons de
-- lembrete) — sem elas neste arquivo, recriar o banco do zero gerava um schema
-- quebrado. `teacher.meet_link` é a única nova: precisa ser aplicada em
-- produção, as demais já existem lá.
-- ============================================================

-- Vínculo entre a ficha do aluno e a conta do Supabase Auth.
-- Usada por getSessionStudent() em toda requisição autenticada de aluno.
ALTER TABLE public.student ADD COLUMN IF NOT EXISTS account_fk UUID;

-- Destinatário da notificação: separa a caixa do professor da do aluno.
-- Toda query de notificação filtra por esta coluna.
ALTER TABLE public.notification
  ADD COLUMN IF NOT EXISTS recipient VARCHAR(10) NOT NULL DEFAULT 'student'
    CHECK (recipient IN ('student', 'teacher'));

-- FK direta da aula para o aluno. Convive com o studentname legado
-- (resolveLessonStudent cai no nome quando student_fk é nulo).
ALTER TABLE public.lesson ADD COLUMN IF NOT EXISTS student_fk UUID REFERENCES student(idstudent);

-- Marca que o lembrete diário já saiu para a aula. O cron /api/cron/lembretes
-- filtra por ela em toda execução; sem a coluna, a query falha e NENHUM
-- lembrete é enviado — recriar o banco do zero quebrava o lembrete inteiro.
ALTER TABLE public.lesson ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- Sala virtual do professor (Google Meet, Zoom, etc.). É a mesma para todas as
-- aulas dele, então vive no perfil e não em cada lesson: colado à mão em
-- `lesson.obs`, o link era apagado toda vez que uma remarcação sobrescrevia o
-- campo. Alimenta o botão "Entrar na aula" dos e-mails e da tela do aluno.
ALTER TABLE public.teacher ADD COLUMN IF NOT EXISTS meet_link TEXT;

-- ============================================================
-- MIGRAÇÃO: Índices de performance (FKs e filtros quentes das consultas do app).
-- Vive em migrations/2026-10-01-performance-indexes.sql — rodar também ao
-- recriar o banco do zero com este arquivo.
-- ============================================================
