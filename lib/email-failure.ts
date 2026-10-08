/**
 * Motivo estruturado de falha de e-mail, compartilhado entre servidor e cliente.
 *
 * Módulo puro (sem imports de servidor) de propósito: os toasts das páginas
 * client ('use client') importam `emailFailureText` e os services importam os
 * tipos — um único vocabulário de falha para toda a cadeia de envio.
 */

export type EmailFailReason =
  /** Variáveis do EmailJS ausentes no ambiente do servidor. */
  | 'config'
  /** Chamada montada sem destinatário (toEmail vazio). */
  | 'sem-destinatario'
  /** Destinatário existe no banco, mas sem e-mail cadastrado. */
  | 'sem-email'
  /** Não foi possível consultar o cadastro do destinatário. */
  | 'lookup'
  /** A API do EmailJS respondeu erro (cota, bloqueio, template/chave inválida…). */
  | 'api'
  /** Falha de rede ao contatar a API do EmailJS. */
  | 'rede';

export type EmailFailure = { reason: EmailFailReason; detail?: string };

export type EmailResult = { ok: true } | ({ ok: false } & EmailFailure);

/**
 * Converte a falha em uma frase em minúsculas para compor mensagens do tipo
 * "…mas o e-mail não foi enviado: {frase}". Para `reason: 'api'`, tenta
 * reconhecer os corpos de erro conhecidos do EmailJS e apontar a correção;
 * corpos desconhecidos são exibidos crus para não esconder a causa de novo.
 */
export function emailFailureText(fail?: EmailFailure): string {
  if (!fail) return 'verifique o e-mail do aluno e a configuração do EmailJS.';

  switch (fail.reason) {
    case 'config':
      return 'as variáveis do EmailJS não estão configuradas no servidor (confira na Vercel).';
    case 'sem-destinatario':
    case 'sem-email':
      return 'o destinatário não tem e-mail cadastrado.';
    case 'lookup':
      return 'não foi possível consultar o cadastro do destinatário.';
    case 'rede':
      return `falha de rede ao contatar o EmailJS${fail.detail ? ` (${fail.detail})` : ''}.`;
    case 'api': {
      const d = fail.detail || '';
      if (/non-?browser/i.test(d))
        return 'o EmailJS está bloqueando envios feitos pelo servidor — habilite "Allow EmailJS API for non-browser applications" em Account → Security no painel do EmailJS.';
      if (/strict mode|private key/i.test(d))
        return 'o EmailJS exige a Private Key e ela não chegou — confira EMAILJS_PRIVATE_KEY na Vercel.';
      if (/quota|limit|no free|requests left|exceeded/i.test(d))
        return 'o limite de envios do plano do EmailJS foi atingido.';
      if (/template/i.test(d))
        return 'o template não existe no EmailJS — confira EMAILJS_TEMPLATE_NOTIFICATION na Vercel.';
      if (/service/i.test(d))
        return 'o serviço não existe no EmailJS — confira NEXT_PUBLIC_EMAILJS_SERVICE_ID na Vercel.';
      if (/public key|user_?id/i.test(d))
        return 'a chave pública do EmailJS está incorreta — confira NEXT_PUBLIC_EMAILJS_PUBLIC_KEY na Vercel.';
      if (/recipient/i.test(d))
        return 'o EmailJS não recebeu o destinatário — confira se o campo "To Email" do template é {{to_email}}.';
      return `o EmailJS recusou o envio${d ? ` (${d})` : ''}.`;
    }
  }
}
