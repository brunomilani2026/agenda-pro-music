-- ============================================================
-- AGENDA PRO MUSIC (cópia) — estrutura completa do banco
-- Gerado a partir da estrutura REAL do banco atual (sem dados).
-- Colar INTEIRO no SQL Editor do Supabase NOVO e clicar em Run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tipos
CREATE TYPE public.lessonstatus AS ENUM ('in_progress', 'done', 'agendada', 'realizada', 'cancelada', 'remarcada', 'aguardando_pagamento');
CREATE TYPE public.status AS ENUM ('approved', 'waiting_approvement');
CREATE TYPE public.usertype AS ENUM ('professor', 'admin', 'aluno');

-- Tabelas
CREATE TABLE public.admin (
  idadmin uuid DEFAULT uuid_generate_v4() NOT NULL,
  idusers_fk uuid NOT NULL
);

CREATE TABLE public.blocked_slot (
  created_at timestamp with time zone DEFAULT now(),
  date character varying(10) NOT NULL,
  endtime character varying(5) NOT NULL,
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idusers_fk uuid NOT NULL,
  reason text,
  starttime character varying(5) NOT NULL
);

CREATE TABLE public.credit (
  created_at timestamp with time zone DEFAULT now(),
  expires_at date NOT NULL,
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idstudent_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,
  origin_lesson_fk uuid,
  used boolean DEFAULT false,
  used_at timestamp with time zone
);

CREATE TABLE public.credit_package (
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  credits integer NOT NULL,
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idusers_fk uuid NOT NULL,
  name character varying(100) NOT NULL,
  popular boolean DEFAULT false,
  price numeric(10,2) NOT NULL,
  sort_order integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  validity_days integer DEFAULT 180 NOT NULL
);

CREATE TABLE public.feedback (
  created_at timestamp with time zone DEFAULT now(),
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  idusers_fk uuid,
  message text,
  rating smallint
);

CREATE TABLE public.instrument (
  haskeys boolean DEFAULT false,
  hasstrings boolean DEFAULT false,
  idadmin_fk uuid,
  idinstrument uuid DEFAULT uuid_generate_v4() NOT NULL,
  idlesson_fk uuid,
  idteacher_fk uuid,
  nameinstrument character varying(45) NOT NULL
);

CREATE TABLE public.instrument_catalog (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  name character varying(100) NOT NULL
);

CREATE TABLE public.lesson (
  date character varying(15),
  datelesson timestamp with time zone NOT NULL,
  endtime character varying(5),
  idlesson uuid DEFAULT uuid_generate_v4() NOT NULL,
  idusers_fk uuid NOT NULL,
  instrument character varying(45),
  lessonprice numeric(10,2),
  lessonstatus lessonstatus DEFAULT 'in_progress'::lessonstatus,
  obs text,
  starttime character varying(5),
  student_fk uuid,
  studentname character varying(255) NOT NULL,
  teachername character varying(255)
);

CREATE TABLE public.lesson_request (
  created_at timestamp with time zone DEFAULT now(),
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idstudent_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,
  instrument character varying(100),
  original_lesson_fk uuid,
  reason text,
  requested_date character varying(15),
  requested_endtime character varying(5),
  requested_starttime character varying(5),
  status character varying(20) DEFAULT 'pendente'::character varying,
  type character varying(20) NOT NULL,
  updated_at timestamp with time zone
);

CREATE TABLE public.notification (
  created_at timestamp with time zone DEFAULT now(),
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idstudent_fk uuid,
  idusers_fk uuid,
  message text,
  read boolean DEFAULT false,
  recipient character varying(10) DEFAULT 'student'::character varying NOT NULL,
  title character varying(255) NOT NULL,
  type character varying(30) NOT NULL
);

CREATE TABLE public.password_reset_token (
  created_at timestamp with time zone DEFAULT now(),
  email character varying(255) NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  token character varying(255) NOT NULL,
  used boolean DEFAULT false
);

CREATE TABLE public.payment (
  amount numeric(10,2) NOT NULL,
  asaas_invoice_url text,
  asaas_payment_id character varying(100),
  asaas_pix_payload text,
  asaas_pix_qrcode text,
  created_at timestamp with time zone DEFAULT now(),
  credits_qty integer DEFAULT 0,
  credits_validity_days integer,
  duedate date NOT NULL,
  fine numeric(10,2) DEFAULT 0,
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idstudent_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL,
  interest numeric(10,2) DEFAULT 0,
  lesson_fk uuid,
  method character varying(20),
  notes text,
  paymentdate date,
  renegotiated_from uuid,
  status character varying(20) DEFAULT 'pendente'::character varying
);

CREATE TABLE public.phone_number (
  ddd character varying(3) NOT NULL,
  idphone_number uuid DEFAULT uuid_generate_v4() NOT NULL,
  phone_number character varying(9) NOT NULL
);

CREATE TABLE public.phone_number_has_users (
  idphone_fk uuid NOT NULL,
  idusers_fk uuid NOT NULL
);

CREATE TABLE public.student (
  account_fk uuid,
  asaas_customer_id character varying(100),
  asaas_subscription_id character varying(100),
  avatar_url text,
  cpf character varying(14),
  discount_type character varying(10) DEFAULT 'percent'::character varying NOT NULL,
  discount_value numeric(10,2) DEFAULT 0 NOT NULL,
  email character varying(255),
  expirationdate date,
  idstudent uuid DEFAULT uuid_generate_v4() NOT NULL,
  idusers_fk uuid,
  instrument character varying(100),
  lessonprice numeric(10,2),
  name character varying(255) NOT NULL,
  notes character varying(255),
  packagetype character varying(50),
  paymentmethod character varying(50),
  phone character varying(20),
  status character varying(20) DEFAULT 'ativo'::character varying,
  totallessons integer DEFAULT 0,
  usedlessons integer DEFAULT 0
);

CREATE TABLE public.teacher (
  avatar_url text,
  bio text,
  cpf character(11) NOT NULL,
  email character varying(255),
  idteacher uuid DEFAULT uuid_generate_v4() NOT NULL,
  idusers_fk uuid NOT NULL,
  info character varying(255),
  meet_link text,
  name character varying(255),
  phone character varying(20)
);

CREATE TABLE public.teacher_day_off (
  created_at timestamp with time zone DEFAULT now(),
  day_of_week integer NOT NULL,
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idusers_fk uuid NOT NULL,
  reason text
);

CREATE TABLE public.teacher_pricing (
  created_at timestamp with time zone DEFAULT now(),
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  idteacher_fk uuid NOT NULL,
  instrument character varying(100) NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  price numeric(10,2) NOT NULL
);

CREATE TABLE public.users (
  accountstatus status DEFAULT 'waiting_approvement'::status,
  email character varying(45) NOT NULL,
  fname character varying(255) NOT NULL,
  idusers uuid DEFAULT uuid_generate_v4() NOT NULL,
  ispremium boolean DEFAULT false,
  usertype usertype NOT NULL
);

-- Chaves primárias, únicas e checks primeiro; chaves estrangeiras depois
ALTER TABLE admin ADD CONSTRAINT admin_pkey PRIMARY KEY (idadmin);
ALTER TABLE blocked_slot ADD CONSTRAINT blocked_slot_pkey PRIMARY KEY (id);
ALTER TABLE credit ADD CONSTRAINT credit_pkey PRIMARY KEY (id);
ALTER TABLE credit_package ADD CONSTRAINT credit_package_credits_check CHECK ((credits > 0));
ALTER TABLE credit_package ADD CONSTRAINT credit_package_pkey PRIMARY KEY (id);
ALTER TABLE credit_package ADD CONSTRAINT credit_package_price_check CHECK ((price >= (0)::numeric));
ALTER TABLE credit_package ADD CONSTRAINT credit_package_validity_days_check CHECK ((validity_days > 0));
ALTER TABLE feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);
ALTER TABLE feedback ADD CONSTRAINT feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE instrument ADD CONSTRAINT instrument_pkey PRIMARY KEY (idinstrument);
ALTER TABLE instrument_catalog ADD CONSTRAINT instrument_catalog_name_key UNIQUE (name);
ALTER TABLE instrument_catalog ADD CONSTRAINT instrument_catalog_pkey PRIMARY KEY (id);
ALTER TABLE lesson ADD CONSTRAINT lesson_pkey PRIMARY KEY (idlesson);
ALTER TABLE lesson_request ADD CONSTRAINT lesson_request_pkey PRIMARY KEY (id);
ALTER TABLE lesson_request ADD CONSTRAINT lesson_request_status_check CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'aprovada'::character varying, 'recusada'::character varying])::text[])));
ALTER TABLE lesson_request ADD CONSTRAINT lesson_request_type_check CHECK (((type)::text = ANY ((ARRAY['agendamento'::character varying, 'remarcacao'::character varying, 'cancelamento'::character varying])::text[])));
ALTER TABLE notification ADD CONSTRAINT notification_pkey PRIMARY KEY (id);
ALTER TABLE notification ADD CONSTRAINT notification_recipient_check CHECK (((recipient)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying])::text[])));
ALTER TABLE notification ADD CONSTRAINT notification_type_check CHECK (((type)::text = ANY ((ARRAY['confirmacao'::character varying, 'lembrete'::character varying, 'cancelamento'::character varying, 'cobranca'::character varying, 'manual'::character varying, 'sistema'::character varying])::text[])));
ALTER TABLE password_reset_token ADD CONSTRAINT password_reset_token_pkey PRIMARY KEY (id);
ALTER TABLE password_reset_token ADD CONSTRAINT password_reset_token_token_key UNIQUE (token);
ALTER TABLE payment ADD CONSTRAINT payment_method_check CHECK (((method)::text = ANY ((ARRAY['pix'::character varying, 'boleto'::character varying, 'cartao'::character varying, 'dinheiro'::character varying, 'transferencia'::character varying])::text[])));
ALTER TABLE payment ADD CONSTRAINT payment_pkey PRIMARY KEY (id);
ALTER TABLE payment ADD CONSTRAINT payment_status_check CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'pago'::character varying, 'vencido'::character varying, 'cancelado'::character varying, 'renegociado'::character varying])::text[])));
ALTER TABLE phone_number ADD CONSTRAINT phone_number_pkey PRIMARY KEY (idphone_number);
ALTER TABLE phone_number_has_users ADD CONSTRAINT phone_number_has_users_pkey PRIMARY KEY (idphone_fk, idusers_fk);
ALTER TABLE student ADD CONSTRAINT student_discount_type_check CHECK (((discount_type)::text = ANY ((ARRAY['percent'::character varying, 'fixed'::character varying])::text[])));
ALTER TABLE student ADD CONSTRAINT student_discount_value_check CHECK ((discount_value >= (0)::numeric));
ALTER TABLE student ADD CONSTRAINT student_pkey PRIMARY KEY (idstudent);
ALTER TABLE student ADD CONSTRAINT unique_student_cpf UNIQUE (cpf);
ALTER TABLE student ADD CONSTRAINT unique_student_email UNIQUE (email);
ALTER TABLE teacher ADD CONSTRAINT teacher_cpf_key UNIQUE (cpf);
ALTER TABLE teacher ADD CONSTRAINT teacher_pkey PRIMARY KEY (idteacher);
ALTER TABLE teacher_day_off ADD CONSTRAINT teacher_day_off_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
ALTER TABLE teacher_day_off ADD CONSTRAINT teacher_day_off_idusers_fk_day_of_week_key UNIQUE (idusers_fk, day_of_week);
ALTER TABLE teacher_day_off ADD CONSTRAINT teacher_day_off_pkey PRIMARY KEY (id);
ALTER TABLE teacher_pricing ADD CONSTRAINT teacher_pricing_pkey PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (idusers);

ALTER TABLE admin ADD CONSTRAINT admin_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers) ON DELETE CASCADE;
ALTER TABLE blocked_slot ADD CONSTRAINT blocked_slot_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers) ON DELETE CASCADE;
ALTER TABLE credit ADD CONSTRAINT credit_idstudent_fk_fkey FOREIGN KEY (idstudent_fk) REFERENCES student(idstudent) ON DELETE CASCADE;
ALTER TABLE credit ADD CONSTRAINT credit_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers);
ALTER TABLE credit ADD CONSTRAINT credit_origin_lesson_fk_fkey FOREIGN KEY (origin_lesson_fk) REFERENCES lesson(idlesson);
ALTER TABLE credit_package ADD CONSTRAINT credit_package_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers) ON DELETE CASCADE;
ALTER TABLE feedback ADD CONSTRAINT feedback_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers) ON DELETE CASCADE;
ALTER TABLE instrument ADD CONSTRAINT instrument_idadmin_fk_fkey FOREIGN KEY (idadmin_fk) REFERENCES admin(idadmin);
ALTER TABLE instrument ADD CONSTRAINT instrument_idlesson_fk_fkey FOREIGN KEY (idlesson_fk) REFERENCES lesson(idlesson);
ALTER TABLE instrument ADD CONSTRAINT instrument_idteacher_fk_fkey FOREIGN KEY (idteacher_fk) REFERENCES teacher(idteacher);
ALTER TABLE lesson ADD CONSTRAINT lesson_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers);
ALTER TABLE lesson ADD CONSTRAINT lesson_student_fk_fkey FOREIGN KEY (student_fk) REFERENCES student(idstudent);
ALTER TABLE lesson_request ADD CONSTRAINT lesson_request_idstudent_fk_fkey FOREIGN KEY (idstudent_fk) REFERENCES student(idstudent) ON DELETE CASCADE;
ALTER TABLE lesson_request ADD CONSTRAINT lesson_request_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers);
ALTER TABLE lesson_request ADD CONSTRAINT lesson_request_original_lesson_fk_fkey FOREIGN KEY (original_lesson_fk) REFERENCES lesson(idlesson);
ALTER TABLE notification ADD CONSTRAINT notification_idstudent_fk_fkey FOREIGN KEY (idstudent_fk) REFERENCES student(idstudent) ON DELETE CASCADE;
ALTER TABLE notification ADD CONSTRAINT notification_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers);
ALTER TABLE payment ADD CONSTRAINT payment_idstudent_fk_fkey FOREIGN KEY (idstudent_fk) REFERENCES student(idstudent) ON DELETE CASCADE;
ALTER TABLE payment ADD CONSTRAINT payment_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers);
ALTER TABLE payment ADD CONSTRAINT payment_lesson_fk_fkey FOREIGN KEY (lesson_fk) REFERENCES lesson(idlesson);
ALTER TABLE payment ADD CONSTRAINT payment_renegotiated_from_fkey FOREIGN KEY (renegotiated_from) REFERENCES payment(id);
ALTER TABLE phone_number_has_users ADD CONSTRAINT phone_number_has_users_idphone_fk_fkey FOREIGN KEY (idphone_fk) REFERENCES phone_number(idphone_number) ON DELETE CASCADE;
ALTER TABLE phone_number_has_users ADD CONSTRAINT phone_number_has_users_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers) ON DELETE CASCADE;
ALTER TABLE student ADD CONSTRAINT student_account_fk_fkey FOREIGN KEY (account_fk) REFERENCES users(idusers);
ALTER TABLE student ADD CONSTRAINT student_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers);
ALTER TABLE teacher ADD CONSTRAINT teacher_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers) ON DELETE CASCADE;
ALTER TABLE teacher_day_off ADD CONSTRAINT teacher_day_off_idusers_fk_fkey FOREIGN KEY (idusers_fk) REFERENCES users(idusers) ON DELETE CASCADE;
ALTER TABLE teacher_pricing ADD CONSTRAINT teacher_pricing_idteacher_fk_fkey FOREIGN KEY (idteacher_fk) REFERENCES teacher(idteacher) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT users_auth_fk FOREIGN KEY (idusers) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Índices (os de PK/UNIQUE já nascem com as constraints)
CREATE INDEX IF NOT EXISTS idx_blocked_slot_user_date ON public.blocked_slot USING btree (idusers_fk, date);
CREATE INDEX IF NOT EXISTS idx_credit_origin_lesson ON public.credit USING btree (origin_lesson_fk);
CREATE INDEX IF NOT EXISTS idx_credit_student ON public.credit USING btree (idstudent_fk, used, expires_at);
CREATE INDEX IF NOT EXISTS idx_credit_package_teacher ON public.credit_package USING btree (idusers_fk, active);
CREATE INDEX IF NOT EXISTS idx_lesson_agendada_datelesson ON public.lesson USING btree (datelesson) WHERE (lessonstatus = 'agendada'::lessonstatus);
CREATE INDEX IF NOT EXISTS idx_lesson_idusers_fk ON public.lesson USING btree (idusers_fk);
CREATE INDEX IF NOT EXISTS idx_lesson_student_fk ON public.lesson USING btree (student_fk);
CREATE INDEX IF NOT EXISTS idx_lesson_user_date ON public.lesson USING btree (idusers_fk, date);
CREATE INDEX IF NOT EXISTS idx_lesson_user_datelesson ON public.lesson USING btree (idusers_fk, datelesson);
CREATE INDEX IF NOT EXISTS idx_lesson_request_original_lesson ON public.lesson_request USING btree (original_lesson_fk);
CREATE INDEX IF NOT EXISTS idx_lesson_request_status ON public.lesson_request USING btree (status);
CREATE INDEX IF NOT EXISTS idx_lesson_request_student ON public.lesson_request USING btree (idstudent_fk, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_request_user_status ON public.lesson_request USING btree (idusers_fk, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_student ON public.notification USING btree (idstudent_fk, recipient, read);
CREATE INDEX IF NOT EXISTS idx_notification_teacher ON public.notification USING btree (idusers_fk, recipient, read);
CREATE INDEX IF NOT EXISTS idx_notification_user ON public.notification USING btree (idusers_fk, recipient, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_asaas_payment_id ON public.payment USING btree (asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_idusers_fk ON public.payment USING btree (idusers_fk);
CREATE INDEX IF NOT EXISTS idx_payment_lesson_fk ON public.payment USING btree (lesson_fk);
CREATE INDEX IF NOT EXISTS idx_payment_status_duedate ON public.payment USING btree (status, duedate);
CREATE INDEX IF NOT EXISTS idx_payment_student_duedate ON public.payment USING btree (idstudent_fk, duedate DESC);
CREATE INDEX IF NOT EXISTS idx_payment_user_duedate ON public.payment USING btree (idusers_fk, duedate DESC);
CREATE INDEX IF NOT EXISTS idx_student_account_fk ON public.student USING btree (account_fk);
CREATE INDEX IF NOT EXISTS idx_student_idusers_fk ON public.student USING btree (idusers_fk);
CREATE INDEX IF NOT EXISTS idx_student_user_name ON public.student USING btree (idusers_fk, name);
CREATE INDEX IF NOT EXISTS idx_teacher_user ON public.teacher USING btree (idusers_fk);
CREATE INDEX IF NOT EXISTS idx_teacher_pricing_teacher ON public.teacher_pricing USING btree (idteacher_fk, instrument);
CREATE UNIQUE INDEX IF NOT EXISTS teacher_pricing_one_primary ON public.teacher_pricing USING btree (idteacher_fk) WHERE is_primary;

-- Funções
CREATE OR REPLACE FUNCTION public.auth_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT usertype::text FROM public.users WHERE idusers = auth.uid()
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users (idusers, email, fname, usertype, accountstatus, ispremium)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'fname', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'usertype')::usertype, 'aluno'),
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'usertype','') = 'professor'
         THEN 'waiting_approvement'::status ELSE 'approved'::status END,
    false
  )
  ON CONFLICT (idusers) DO NOTHING;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE idusers = auth.uid() AND usertype = 'admin')
$function$
;
CREATE OR REPLACE FUNCTION public.my_student_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT idstudent FROM public.student WHERE account_fk = auth.uid()
$function$
;
CREATE OR REPLACE FUNCTION public.my_teacher_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT idusers_fk FROM public.student WHERE account_fk = auth.uid()
$function$
;

-- Trigger: cria o perfil em public.users quando alguém se cadastra no Auth
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Segurança: RLS ligado em todas as tabelas
ALTER TABLE public.admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_slot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_package ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_number ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_number_has_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_day_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY admin_only ON public.admin AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY blocked_manage ON public.blocked_slot AS PERMISSIVE FOR ALL TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin())) WITH CHECK (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY blocked_select ON public.blocked_slot AS PERMISSIVE FOR SELECT TO authenticated USING (((idusers_fk = auth.uid()) OR (idusers_fk IN ( SELECT my_teacher_ids() AS my_teacher_ids)) OR is_admin()));
CREATE POLICY credit_manage ON public.credit AS PERMISSIVE FOR ALL TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin())) WITH CHECK (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY credit_select ON public.credit AS PERMISSIVE FOR SELECT TO authenticated USING (((idusers_fk = auth.uid()) OR (idstudent_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin()));
CREATE POLICY cpkg_manage ON public.credit_package AS PERMISSIVE FOR ALL TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin())) WITH CHECK (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY cpkg_select ON public.credit_package AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY feedback_delete ON public.feedback AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin());
CREATE POLICY feedback_insert ON public.feedback AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((idusers_fk = auth.uid()));
CREATE POLICY feedback_select ON public.feedback AS PERMISSIVE FOR SELECT TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY instrument_manage ON public.instrument AS PERMISSIVE FOR ALL TO authenticated USING (((idteacher_fk IN ( SELECT teacher.idteacher
   FROM teacher
  WHERE (teacher.idusers_fk = auth.uid()))) OR is_admin())) WITH CHECK (((idteacher_fk IN ( SELECT teacher.idteacher
   FROM teacher
  WHERE (teacher.idusers_fk = auth.uid()))) OR is_admin()));
CREATE POLICY instrument_select ON public.instrument AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY catalog_admin ON public.instrument_catalog AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY catalog_select ON public.instrument_catalog AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY lesson_manage ON public.lesson AS PERMISSIVE FOR ALL TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin())) WITH CHECK (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY lesson_select ON public.lesson AS PERMISSIVE FOR SELECT TO authenticated USING (((idusers_fk = auth.uid()) OR (student_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin()));
CREATE POLICY lreq_delete ON public.lesson_request AS PERMISSIVE FOR DELETE TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY lreq_insert ON public.lesson_request AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((idstudent_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin()));
CREATE POLICY lreq_select ON public.lesson_request AS PERMISSIVE FOR SELECT TO authenticated USING (((idusers_fk = auth.uid()) OR (idstudent_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin()));
CREATE POLICY lreq_update ON public.lesson_request AS PERMISSIVE FOR UPDATE TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin())) WITH CHECK (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY notif_delete ON public.notification AS PERMISSIVE FOR DELETE TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY notif_insert ON public.notification AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((idusers_fk = auth.uid()) OR (idstudent_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin()));
CREATE POLICY notif_select ON public.notification AS PERMISSIVE FOR SELECT TO authenticated USING (((idusers_fk = auth.uid()) OR (idstudent_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin()));
CREATE POLICY notif_update ON public.notification AS PERMISSIVE FOR UPDATE TO authenticated USING (((idusers_fk = auth.uid()) OR (idstudent_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin())) WITH CHECK (((idusers_fk = auth.uid()) OR (idstudent_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin()));
CREATE POLICY prt_admin ON public.password_reset_token AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY payment_delete ON public.payment AS PERMISSIVE FOR DELETE TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY payment_insert ON public.payment AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((idusers_fk = auth.uid()) OR (idstudent_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin()));
CREATE POLICY payment_select ON public.payment AS PERMISSIVE FOR SELECT TO authenticated USING (((idusers_fk = auth.uid()) OR (idstudent_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin()));
CREATE POLICY payment_update ON public.payment AS PERMISSIVE FOR UPDATE TO authenticated USING (((idusers_fk = auth.uid()) OR (idstudent_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin())) WITH CHECK (((idusers_fk = auth.uid()) OR (idstudent_fk IN ( SELECT my_student_ids() AS my_student_ids)) OR is_admin()));
CREATE POLICY phone_admin ON public.phone_number AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY phone_self ON public.phone_number_has_users AS PERMISSIVE FOR ALL TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin())) WITH CHECK (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY student_delete ON public.student AS PERMISSIVE FOR DELETE TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY student_insert ON public.student AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth_role() = 'professor'::text) OR (account_fk = auth.uid()) OR is_admin()));
CREATE POLICY student_select ON public.student AS PERMISSIVE FOR SELECT TO authenticated USING (((idusers_fk = auth.uid()) OR (account_fk = auth.uid()) OR is_admin()));
CREATE POLICY student_update ON public.student AS PERMISSIVE FOR UPDATE TO authenticated USING (((idusers_fk = auth.uid()) OR (account_fk = auth.uid()) OR is_admin())) WITH CHECK (((idusers_fk = auth.uid()) OR (account_fk = auth.uid()) OR is_admin()));
CREATE POLICY teacher_owner ON public.teacher AS PERMISSIVE FOR ALL TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin())) WITH CHECK (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY dayoff_manage ON public.teacher_day_off AS PERMISSIVE FOR ALL TO authenticated USING (((idusers_fk = auth.uid()) OR is_admin())) WITH CHECK (((idusers_fk = auth.uid()) OR is_admin()));
CREATE POLICY dayoff_select ON public.teacher_day_off AS PERMISSIVE FOR SELECT TO authenticated USING (((idusers_fk = auth.uid()) OR (idusers_fk IN ( SELECT my_teacher_ids() AS my_teacher_ids)) OR is_admin()));
CREATE POLICY pricing_manage ON public.teacher_pricing AS PERMISSIVE FOR ALL TO authenticated USING (((idteacher_fk IN ( SELECT teacher.idteacher
   FROM teacher
  WHERE (teacher.idusers_fk = auth.uid()))) OR is_admin())) WITH CHECK (((idteacher_fk IN ( SELECT teacher.idteacher
   FROM teacher
  WHERE (teacher.idusers_fk = auth.uid()))) OR is_admin()));
CREATE POLICY pricing_select ON public.teacher_pricing AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY users_admin_write ON public.users AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY users_select ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING (((idusers = auth.uid()) OR is_admin() OR (usertype = 'professor'::usertype)));
CREATE POLICY users_update ON public.users AS PERMISSIVE FOR UPDATE TO authenticated USING (((idusers = auth.uid()) OR is_admin())) WITH CHECK (((idusers = auth.uid()) OR is_admin()));

-- Permissões (grants)
GRANT DELETE, INSERT, SELECT, UPDATE ON public.admin TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.blocked_slot TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.credit TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.credit_package TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.feedback TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.instrument TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.instrument_catalog TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.lesson TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.lesson_request TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.notification TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.password_reset_token TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.payment TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.phone_number TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.phone_number_has_users TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.student TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.teacher TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.teacher_day_off TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.teacher_pricing TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.users TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Dados iniciais: catálogo de instrumentos
INSERT INTO public.instrument_catalog (name) VALUES ('Violão'),('Guitarra'),('Piano / Teclado'),('Canto'),('Bateria'),('Baixo'),('Violino'),('Saxofone'),('Cavaquinho'),('Banjo'),('Outros') ON CONFLICT (name) DO NOTHING;

-- Nota: no banco atual existe uma view "teacher_public" que o código não usa; não foi recriada.
