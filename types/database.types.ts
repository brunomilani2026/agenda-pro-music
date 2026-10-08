export type UserType = 'professor' | 'admin' | 'aluno';
export type AccountStatus = 'approved' | 'waiting_approvement';
export type LessonStatus = 'in_progress' | 'done' | 'agendada' | 'aguardando_pagamento' | 'realizada' | 'cancelada' | 'remarcada';
export type RequestType = 'agendamento' | 'remarcacao' | 'cancelamento';
export type RequestStatus = 'pendente' | 'aprovada' | 'recusada';
export type PaymentStatus = 'pendente' | 'pago' | 'vencido' | 'cancelado' | 'renegociado';
export type PaymentMethod = 'pix' | 'boleto' | 'cartao' | 'dinheiro' | 'transferencia';
export type NotificationType = 'confirmacao' | 'lembrete' | 'cancelamento' | 'cobranca' | 'manual' | 'sistema';

export interface User {
  idusers: string;
  fname: string;
  email: string;
  usertype: UserType;
  accountstatus: AccountStatus;
  ispremium: boolean;
}

export interface Teacher {
  idteacher: string; // UUID
  cpf: string;
  info?: string;
  idusers_fk: string; // UUID
  avatar_url?: string; // Firebase Storage URL
  /** Sala virtual (Google Meet/Zoom) usada em todas as aulas — CTA "Entrar na aula". */
  meet_link?: string | null;
}

export interface TeacherPricing {
  id: string; // UUID
  idteacher_fk: string; // UUID
  instrument: string;
  price: number;
  is_primary: boolean;
  created_at: string;
}

export interface Admin {
  idadmin: string; // UUID
  idusers_fk: string; // UUID
}

export interface Lesson {
  idlesson: string; // UUID
  datelesson?: string; // TIMESTAMPTZ (Legacy / Backup)
  studentname: string;
  lessonprice?: number;
  obs?: string;
  lessonstatus: LessonStatus;
  idusers_fk?: string; // UUID (Optional to ease the frontend mock conversion)
  student_fk?: string | null; // UUID do aluno — usado pela RLS (lesson_select)
  reminder_sent?: boolean; // lembrete de aula já enviado (cron /api/cron/lembretes)

  // UI extended columns
  starttime: string;
  endtime: string;
  instrument: string;
  teachername: string;
  date: string;
}

export interface Student {
  idstudent: string; // UUID
  name: string;
  phone?: string | null;
  email?: string;
  instrument?: string | null;
  lessonprice?: number;
  paymentmethod?: string;
  status: string;
  totallessons: number;
  usedlessons: number;
  notes?: string;
  packagetype?: string;
  cpf?: string | null;
  expirationdate?: string | null;
  asaas_customer_id?: string;
  asaas_subscription_id?: string;
  idusers_fk?: string | null; // UUID REFERENCES users(idusers) — nulo até vincular a um professor
  account_fk?: string | null; // UUID da conta Supabase Auth do aluno
  avatar_url?: string; // Firebase Storage URL
  discount_type?: 'percent' | 'fixed';
  discount_value?: number; // 0 = sem desconto
}

export interface Instrument {
  idinstrument: string; // UUID
  nameinstrument: string;
  hasstrings: boolean;
  haskeys: boolean;
  idteacher_fk?: string; // UUID
  idlesson_fk?: string; // UUID
  idadmin_fk?: string; // UUID
}

export interface PhoneNumber {
  idphone_number: string; // UUID
  ddd: string;
  phone_number: string;
}

export interface PhoneNumberHasUsers {
  idphone_fk: string; // UUID
  idusers_fk: string; // UUID
}

export interface InstrumentCatalog {
  id: string; // UUID
  name: string;
}

// ============================================================
// EXTENSÃO RAIZTECH — Novas interfaces
// ============================================================

export interface LessonRequest {
  id: string;
  idstudent_fk: string;
  idusers_fk: string;
  type: RequestType;
  original_lesson_fk?: string;
  requested_date?: string;
  requested_starttime?: string;
  requested_endtime?: string;
  instrument?: string;
  status: RequestStatus;
  reason?: string;
  created_at: string;
}

export interface Payment {
  id: string;
  idstudent_fk: string;
  idusers_fk: string;
  amount: number;
  duedate: string;
  paymentdate?: string;
  status: PaymentStatus;
  method?: PaymentMethod;
  asaas_payment_id?: string;
  asaas_invoice_url?: string;
  asaas_pix_qrcode?: string;
  asaas_pix_payload?: string;
  fine: number;
  interest: number;
  notes?: string;
  credits_qty?: number;
  credits_validity_days?: number;
  renegotiated_from?: string;
  lesson_fk?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  idusers_fk?: string;
  idstudent_fk?: string;
  /** Caixa em que a notificação aparece: aluno ou professor. */
  recipient: 'student' | 'teacher';
  type: NotificationType;
  title: string;
  message?: string;
  read: boolean;
  created_at: string;
}

export interface Feedback {
  id: string;
  idusers_fk?: string;
  rating: number;
  message?: string;
  created_at: string;
}

export interface Credit {
  id: string;
  idstudent_fk: string;
  idusers_fk: string;
  origin_lesson_fk?: string;
  expires_at: string;
  used: boolean;
  used_at?: string;
  created_at: string;
}

export interface CreditPackage {
  id: string;
  idusers_fk: string;
  name: string;
  credits: number;
  price: number;
  validity_days: number;
  popular: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PasswordResetToken {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  used: boolean;
  created_at: string;
}
