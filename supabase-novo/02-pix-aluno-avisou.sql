-- Pix estático: guarda quando o aluno clicou "Já paguei".
-- Só avisa o professor; a baixa continua sendo dele (Financeiro > Receber).
ALTER TABLE public.payment ADD COLUMN IF NOT EXISTS aluno_avisou_em timestamptz;
