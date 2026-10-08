/**
 * Cliente para API Asaas v3
 * Documentação: https://docs.asaas.com/reference
 */

// .replace(/^\uFEFF/, ...) remove um BOM que às vezes vem colado no início
// da env var quando ela é copiada de um arquivo salvo como "UTF-8 com BOM"
// (ex.: Notepad no Windows). Sem isso, o fetch falha ao montar o header
// 'access_token' com "Cannot convert argument to a ByteString" — a chave tem
// um caractere > 255 (o BOM) na posição 0, e headers HTTP exigem Latin-1.
const ASAAS_API_KEY = (process.env.ASAAS_API_KEY || '').replace(/^\uFEFF/, '').trim();
const ASAAS_BASE_URL = process.env.ASAAS_SANDBOX === 'true'
  ? 'https://api-sandbox.asaas.com/v3'
  : 'https://api.asaas.com/v3';

async function asaasRequest(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'access_token': ASAAS_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Asaas API error:', data);
    throw new Error(data?.errors?.[0]?.description || 'Erro na API Asaas');
  }

  return data;
}

export class AsaasClient {
  /**
   * Cria um cliente no Asaas
   */
  static async createCustomer(data: {
    name: string;
    cpfCnpj: string;
    email?: string;
    phone?: string;
  }): Promise<{ id: string }> {
    return asaasRequest('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        cpfCnpj: data.cpfCnpj.replace(/[^0-9]/g, ''),
        email: data.email || undefined,
        phone: data.phone || undefined,
        notificationDisabled: false,
      }),
    });
  }

  /**
   * Atualiza os dados de um cliente no Asaas
   */
  static async updateCustomer(customerId: string, data: {
    name?: string;
    cpfCnpj?: string;
    email?: string;
    phone?: string;
  }): Promise<{ id: string }> {
    const payload: any = {};
    if (data.name) payload.name = data.name;
    if (data.cpfCnpj) payload.cpfCnpj = data.cpfCnpj.replace(/[^0-9]/g, '');
    if (data.email) payload.email = data.email;
    if (data.phone) payload.phone = data.phone;

    return asaasRequest(`/customers/${customerId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Cria uma cobrança avulsa
   */
  static async createPayment(data: {
    customer: string; // Asaas customer ID
    billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED';
    value: number;
    dueDate: string; // YYYY-MM-DD
    description?: string;
    fine?: { value: number }; // Multa em %
    interest?: { value: number }; // Juros mensal em %
  }): Promise<{ id: string; invoiceUrl: string; bankSlipUrl?: string; status: string }> {
    return asaasRequest('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: data.customer,
        billingType: data.billingType,
        value: data.value,
        dueDate: data.dueDate,
        description: data.description || 'Aula de música - PRO MUSIC',
        fine: data.fine || { value: 2 }, // 2% multa padrão
        interest: data.interest || { value: 1 }, // 1% juros mensal padrão
      }),
    });
  }

  /**
   * Cria cobrança recorrente (subscription)
   */
  static async createSubscription(data: {
    customer: string;
    billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD';
    value: number;
    nextDueDate: string;
    cycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY';
    description?: string;
  }): Promise<{ id: string }> {
    return asaasRequest('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: data.customer,
        billingType: data.billingType,
        value: data.value,
        nextDueDate: data.nextDueDate,
        cycle: data.cycle,
        description: data.description || 'Pacote de aulas - PRO MUSIC',
        fine: { value: 2 },
        interest: { value: 1 },
      }),
    });
  }

  /**
   * Gera QR Code Pix para pagamento
   */
  static async getPixQrCode(paymentId: string): Promise<{ encodedImage: string; payload: string }> {
    return asaasRequest(`/payments/${paymentId}/pixQrCode`);
  }

  /**
   * Remove uma cobrança (o Asaas só permite para PENDING/OVERDUE).
   * Usada na baixa manual para o aluno não pagar duas vezes.
   */
  static async deletePayment(paymentId: string): Promise<{ deleted: boolean; id: string }> {
    return asaasRequest(`/payments/${paymentId}`, { method: 'DELETE' });
  }
}

/**
 * Mapeia tipo de pacote do sistema para ciclo do Asaas
 */
export function packageTypeToCycle(packageType: string): 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | null {
  switch (packageType) {
    case 'mensal': return 'MONTHLY';
    case 'trimestral': return 'QUARTERLY';
    case 'semestral': return 'SEMIANNUALLY';
    default: return null; // avulsa não tem recorrência
  }
}

/**
 * Mapeia método de pagamento do sistema para billingType do Asaas
 */
export function methodToBillingType(method: string): 'BOLETO' | 'PIX' | 'CREDIT_CARD' {
  switch (method) {
    case 'boleto': return 'BOLETO';
    case 'cartao': return 'CREDIT_CARD';
    default: return 'PIX';
  }
}
