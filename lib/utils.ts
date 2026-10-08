// Funções utilitárias do projeto

import { type ClassValue, clsx } from "clsx";

/**
 * Combina classes CSS de forma condicional
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Formata um nome completo para mostrar apenas o primeiro e o último nome
 */
export function formatName(fullName: string | undefined | null): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName.trim();
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/**
 * Remove tudo o que não for número de uma string.
 */
export const unmask = (value: string): string => {
  if (!value) return '';
  return value.replace(/\D/g, '');
};

/**
 * Adiciona a máscara de CPF (000.000.000-00)
 */
export const maskCPF = (value: string): string => {
  return value
    .replace(/\D/g, '') // Remove o que não é número
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1'); // Limita a 11 números
};

/**
 * Adiciona a máscara de Telefone celular.
 */
export const maskPhone = (value: string): string => {
  if (!value) return '';
  let v = value.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  
  if (v.length > 10) {
    // 11 digits: (XX) XXXXX-XXXX
    return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  } else if (v.length > 6) {
    // 7-10 digits: (XX) XXXX-XXXX (will format partially while typing)
    return v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  } else if (v.length > 2) {
    // 3-6 digits: (XX) XXXX
    return v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
  }
  return v;
};

/**
 * Remove o DDI 55 de uma sequência só de dígitos quando ela claramente o
 * inclui. Números nacionais BR têm 10-11 dígitos (mesmo com DDD 55, que
 * existe no RS); com DDI são 12-13 — o comprimento desambigua.
 */
export function stripBrazilDdi(digits: string): string {
  return (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
    ? digits.slice(2)
    : digits;
}

/**
 * Retorna as datas da semana a partir de uma data fornecida (ou atual).
 */
export function getWeekDates(date: Date = new Date()): string[] {
  const current = new Date(date);
  const dayOfWeek = current.getDay();
  const monday = new Date(current);
  // Ajusta para segunda-feira (getDay() = 0 é Domingo, 1 é Segunda)
  monday.setDate(current.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(getLocalISODate(d));
  }
  return dates;
}

/**
 * "Agora" no fuso de São Paulo, independente do fuso do dispositivo/servidor.
 * Mesmo padrão usado nas validações server-side (horário que já passou, 6h de
 * antecedência) — mantém cliente e servidor de acordo sobre que horas são.
 */
export function nowInSaoPaulo(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

/**
 * Formata um timestamp (ISO/timestamptz) como data e hora exatas no padrão
 * brasileiro e SEMPRE no fuso de Brasília — "18/07/2026 às 11:00" —
 * independentemente do fuso do dispositivo de quem vê.
 */
export function formatDateTimeBR(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d
    .toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', ' às');
}

/**
 * Retorna a data no formato YYYY-MM-DD respeitando o fuso horário local,
 * evitando problemas de shift de datas ao usar toISOString().
 */
export function getLocalISODate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Avança `months` meses a partir de uma data ISO (YYYY-MM-DD) preservando o
 * mesmo dia do mês. Se o mês de destino não tiver aquele dia (ex.: 31 → fev),
 * usa o último dia disponível. Retorna no formato YYYY-MM-DD.
 *
 * Usado para calcular o vencimento da próxima mensalidade mantendo o dia do
 * vencimento anterior (ex.: 04/06 → 04/07).
 */
export function addMonthsKeepDay(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const ref = new Date(y, (m - 1) + months, 1);
  const lastDayOfTarget = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDayOfTarget);
  return getLocalISODate(new Date(ref.getFullYear(), ref.getMonth(), day));
}

/**
 * Projeta o vencimento da próxima mensalidade de um plano recorrente.
 * - Com histórico de faturas: avança um período a partir da última, mantendo o dia.
 * - Sem histórico: a PRIMEIRA mensalidade vence na data do plano definida pelo
 *   professor na ficha do aluno (expirationdate) — avançada por períodos até
 *   alcançar hoje caso esteja no passado.
 * - Sem histórico e sem data do plano: hoje + um período (último recurso).
 */
export function projectNextMensalidadeDue(
  lastDue: string | null | undefined,
  planExpiration: string | null | undefined,
  monthsToAdd: number,
): string {
  if (lastDue) return addMonthsKeepDay(lastDue, monthsToAdd);
  const today = getLocalISODate();
  if (planExpiration) {
    let due = planExpiration;
    // Limite de 60 iterações — nunca trava (5 anos no plano mensal).
    for (let i = 0; i < 60 && due < today; i++) due = addMonthsKeepDay(due, monthsToAdd);
    return due;
  }
  return addMonthsKeepDay(today, monthsToAdd);
}

/**
 * Normaliza o método de pagamento para os valores aceitos pelo CHECK da
 * tabela payment ('pix', 'boleto', 'cartao', 'dinheiro', 'transferencia').
 * Aceita os rótulos da UI ("Pix", "Cartão", "Transferência"), o billingType
 * do Asaas (CREDIT_CARD) e variações de caixa/acento. Fallback: 'pix'.
 */
export function normalizePaymentMethod(raw?: string | null): string {
  const allowed = ['pix', 'boleto', 'cartao', 'dinheiro', 'transferencia'];
  const value = (raw || 'pix')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, ''); // remove acentos: cartão → cartao
  if (value === 'credit_card') return 'cartao';
  return allowed.includes(value) ? value : 'pix';
}

/**
 * Aplica o desconto individual do aluno sobre um preço (pacotes de créditos).
 * 'percent' → discount_value é % (limitado a 100); 'fixed' → R$ abatidos.
 * discount_value ausente ou 0 devolve o preço original. Nunca fica negativo.
 */
export function applyStudentDiscount(
  price: number,
  discountType?: string | null,
  discountValue?: number | null,
): number {
  const value = Number(discountValue) || 0;
  if (value <= 0) return price;
  const discounted = discountType === 'fixed'
    ? price - value
    : price * (1 - Math.min(value, 100) / 100);
  return Math.max(0, Math.round(discounted * 100) / 100);
}

/**
 * Validação rigorosa de CPF (algoritmo de módulo 11).
 */
export function isValidCPF(cpf: string): boolean {
  if (!cpf || typeof cpf !== 'string') return false;
  
  // Remove formatação
  const cleanCPF = cpf.replace(/[^\d]+/g, '');
  
  // Verifica tamanho ou se é uma sequência repetida (ex: 111.111.111-11)
  if (cleanCPF.length !== 11 || !!cleanCPF.match(/(\d)\1{10}/)) return false;

  const split = cleanCPF.split('').map(Number);
  
  // Valida 1º dígito verificador
  let rest = (split.slice(0, 9).reduce((acc, curr, i) => acc + curr * (10 - i), 0) * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== split[9]) return false;

  // Valida 2º dígito verificador
  rest = (split.slice(0, 10).reduce((acc, curr, i) => acc + curr * (11 - i), 0) * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== split[10]) return false;

  return true;
}

/**
 * Validação de formato de Email.
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Validação de telefone internacional: só garante um total de dígitos
 * plausível (DDI + número), já que validar o formato exato por país exigiria
 * uma lib de telefone. Números BR sem DDI (formato legado, 10-11 dígitos)
 * continuam passando.
 */
export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

/**
 * Normaliza telefone pra armazenamento: mantém o "+" (DDI) quando presente e
 * remove o resto da formatação. Diferente de `unmask`, que descartaria o "+".
 */
export function normalizePhoneForStorage(value: string): string {
  if (!value) return '';
  const hasPlus = value.trim().startsWith('+');
  const digits = value.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

