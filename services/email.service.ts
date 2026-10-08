import type { EmailResult } from '@/lib/email-failure';

export class EmailService {
  /**
   * Envia um e-mail através da API REST do EmailJS
   * Utilizado em Server Actions onde o @emailjs/browser não funciona
   *
   * Retorna um `EmailResult` com o motivo estruturado da falha — quem reporta
   * ao usuário (aviso manual, reenvio de ativação) repassa o motivo; os demais
   * pontos podem ignorar o retorno (envio é best effort e nunca lança).
   */
  static async sendEmail(templateId: string, templateParams: Record<string, string>): Promise<EmailResult> {
    const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
    const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY; // Opcional, aumenta segurança

    const resolvedTemplateId = templateId || process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
    if (!serviceId || !publicKey || !resolvedTemplateId) {
      console.warn('⚠️ Configurações do EmailJS ausentes. O e-mail não será enviado.');
      return { ok: false, reason: 'config' };
    }
    templateId = resolvedTemplateId;

    // Garantir mapeamento correto de campos de e-mail para o template EmailJS
    // O EmailJS requer "to_email" para definir o destinatário
    const enrichedParams = { ...templateParams };
    if (!enrichedParams.to_email) {
      enrichedParams.to_email =
        enrichedParams.student_email ||
        enrichedParams.teacher_email ||
        enrichedParams.email ||
        '';
    }
    if (!enrichedParams.to_name) {
      enrichedParams.to_name =
        enrichedParams.student_name ||
        enrichedParams.teacher_name ||
        enrichedParams.name ||
        '';
    }

    try {
      const payload: any = {
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: enrichedParams,
      };

      if (privateKey) {
        payload.accessToken = privateKey;
      }

      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Falha ao enviar e-mail via EmailJS [${response.status}]: ${errorText}`);
        console.error('📧 Template:', templateId, '| Serviço:', serviceId);
        console.error('📋 Params:', JSON.stringify(enrichedParams));
        return { ok: false, reason: 'api', detail: `HTTP ${response.status}: ${errorText.slice(0, 180)}` };
      }

      console.log('✅ E-mail enviado com sucesso via EmailJS!', { to: enrichedParams.to_email, template: templateId });
      return { ok: true };
    } catch (err) {
      console.error('❌ Erro na requisição para o EmailJS:', err);
      return { ok: false, reason: 'rede', detail: (err instanceof Error ? err.message : String(err)).slice(0, 180) };
    }
  }

  /**
   * Envia uma notificação genérica usando o template reaproveitável do EmailJS.
   * Use para qualquer aviso transacional (pagamentos, aulas, boas-vindas, etc.).
   *
   * O campo `message` aceita quebras de linha (\n), que o template preserva via
   * CSS `white-space: pre-line`. Cuidado: o Outlook para Windows renderiza com o
   * motor do Word e não trata essa propriedade de forma confiável — lá as quebras
   * somem e o texto vira um parágrafo corrido. Prefira uma frase única; se
   * precisar mesmo listar detalhes, aceite que uma parte da base verá tudo junto.
   *
   * Falha silenciosamente (nunca lança) — avisos não devem quebrar o fluxo.
   */
  static async sendNotification(params: {
    toEmail: string;
    toName?: string;
    /** Título exibido na faixa do cabeçalho. Ex.: "Pagamento confirmado" */
    title: string;
    /** Corpo da mensagem. Aceita \n para quebras de linha. */
    message: string;
    /** Texto do botão (CTA). Padrão: "Acessar painel". */
    buttonLabel?: string;
    /** Link do botão. Padrão: /login. */
    buttonUrl?: string;
  }): Promise<EmailResult> {
    const templateId = process.env.EMAILJS_TEMPLATE_NOTIFICATION;
    if (!templateId) {
      console.warn('⚠️ EMAILJS_TEMPLATE_NOTIFICATION ausente. Notificação não enviada.');
      return { ok: false, reason: 'config' };
    }
    if (!params.toEmail) return { ok: false, reason: 'sem-destinatario' };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.agendapromusic.com.br';

    return this.sendEmail(templateId, {
      to_email: params.toEmail,
      to_name: params.toName || '',
      title: params.title,
      message: params.message,
      button_label: params.buttonLabel || 'Acessar painel',
      button_url: params.buttonUrl || `${appUrl}/login`,
    });
  }
}
