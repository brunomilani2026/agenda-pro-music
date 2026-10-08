import { NextRequest, NextResponse } from 'next/server';
import { EmailService } from '@/services/email.service';
import { PaymentService } from '@/services/payment.service';

export const dynamic = 'force-dynamic';

/**
 * Diagnóstico administrativo do sistema de notificações.
 *
 * O EmailJS falha silencioso do ponto de vista do usuário: o motivo real (cota
 * estourada, template sem "To Email", chave errada) só aparece no corpo da
 * resposta HTTP da API, que os logs da Vercel não retêm. Este endpoint dispara
 * um envio de teste e devolve a resposta crua do EmailJS, além de indicar quais
 * envs estão presentes no runtime (sem expor valores).
 *
 * Autenticação: header `x-debug-key` igual à SUPABASE_SECRET_KEY — quem tem a
 * chave do banco já tem acesso total; não cria um segredo novo. Fail-closed.
 *
 * GET  + x-debug-key                          → presença das envs
 * GET ?to=email + x-debug-key                 → envio de teste + resposta crua
 * GET ?action=seed + x-debug-key              → roda a ponte plano→fatura do cron
 */
export async function GET(request: NextRequest) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  const key = request.headers.get('x-debug-key');
  if (!secret || key !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get('action') === 'seed') {
    const invoicesCreated = await PaymentService.generateMensalidadesFromExpiredPlans();
    return NextResponse.json({ invoicesCreated });
  }

  const envPresence = {
    NEXT_PUBLIC_EMAILJS_SERVICE_ID: !!process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID,
    NEXT_PUBLIC_EMAILJS_PUBLIC_KEY: !!process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY,
    EMAILJS_PRIVATE_KEY: !!process.env.EMAILJS_PRIVATE_KEY,
    EMAILJS_TEMPLATE_NOTIFICATION: !!process.env.EMAILJS_TEMPLATE_NOTIFICATION,
    EMAILJS_TEMPLATE_STUDENT_CONFIRM: !!process.env.EMAILJS_TEMPLATE_STUDENT_CONFIRM,
  };

  const to = request.nextUrl.searchParams.get('to');
  if (!to) {
    return NextResponse.json({ envPresence, note: 'Passe ?to=email para disparar um envio de teste.' });
  }

  const result = await EmailService.sendNotification({
    toEmail: to,
    toName: 'Diagnóstico',
    title: 'Teste de e-mail — Agenda Pro Music',
    message: 'Envio de diagnóstico do sistema de notificações. Se você recebeu este e-mail, o EmailJS está funcionando.',
  });

  return NextResponse.json({ envPresence, emailResult: result });
}
