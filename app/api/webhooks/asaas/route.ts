import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getLocalISODate, normalizePaymentMethod } from "@/lib/utils";
import { createAdminClient } from '@/lib/supabase/server';
import { emailStudent, emailTeacher } from '@/lib/notify-email';

// Comparação de tempo constante para evitar timing attacks na validação do token.
function safeTokenEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Webhook do Asaas — RF11: Baixa Automática
 * Recebe notificações quando pagamentos são confirmados, cancelados, etc.
 */
export async function POST(request: NextRequest) {
  try {
    // Validação OBRIGATÓRIA do token. Sem isso, qualquer um poderia forjar uma
    // confirmação de pagamento (PAYMENT_CONFIRMED) e liberar créditos de graça.
    // Fail-closed: se o token não estiver configurado no servidor, rejeitamos.
    const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!webhookToken) {
      console.error('ASAAS_WEBHOOK_TOKEN não configurado — webhook rejeitado.');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }
    const token = request.headers.get('asaas-access-token');
    if (!token || !safeTokenEqual(token, webhookToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const event = body.event;
    const payment = body.payment;

    if (!event || !payment) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Helper para garantir que a fatura exista no banco local (caso gerada por subscription)
    const ensurePaymentExists = async (asaasPayment: any) => {
      const { data: existing } = await supabase
        .from('payment')
        .select('id')
        .eq('asaas_payment_id', asaasPayment.id)
        .maybeSingle();

      if (!existing) {
        // Tentar achar o aluno pelo customer ou subscription
        let studentQuery = supabase.from('student').select('idstudent, idusers_fk');
        
        if (asaasPayment.subscription) {
          studentQuery = studentQuery.eq('asaas_subscription_id', asaasPayment.subscription);
        } else if (asaasPayment.customer) {
          studentQuery = studentQuery.eq('asaas_customer_id', asaasPayment.customer);
        } else {
          return null;
        }

        // maybeSingle: .single() lançava com 0 ou 2+ alunos e o pagamento
        // confirmado era descartado em silêncio.
        const { data: student } = await studentQuery.maybeSingle();

        if (!student) {
          console.error(`Webhook: aluno não encontrado para o pagamento Asaas ${asaasPayment.id} (customer ${asaasPayment.customer || '-'}, subscription ${asaasPayment.subscription || '-'}). Pagamento não registrado.`);
        }

        if (student) {
          // normalizePaymentMethod: billingType cru ("CREDIT_CARD") viola o
          // CHECK de payment.method e o insert falharia — aí a baixa em
          // PAYMENT_CONFIRMED nunca aconteceria.
          const { data: newPayment, error: insertErr } = await supabase.from('payment').insert([{
            idstudent_fk: student.idstudent,
            idusers_fk: student.idusers_fk,
            amount: asaasPayment.value,
            duedate: asaasPayment.dueDate,
            status: 'pendente',
            method: normalizePaymentMethod(asaasPayment.billingType),
            asaas_payment_id: asaasPayment.id,
            asaas_invoice_url: asaasPayment.invoiceUrl || null,
            fine: 0,
            interest: 0,
          }]).select('idstudent_fk').single();
          if (insertErr) {
            console.error('Webhook: erro ao criar pagamento local:', insertErr.message);
          }
          return newPayment;
        }
      }
      return existing; // Pode ser nulo se não achou nada
    };

    switch (event) {
      case 'PAYMENT_CREATED': {
        await ensurePaymentExists(payment);
        break;
      }

      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED': {
        await ensurePaymentExists(payment);

        const { data: localPayment } = await supabase
          .from('payment')
          .select('id')
          .eq('asaas_payment_id', payment.id)
          .maybeSingle();

        if (!localPayment) {
          console.error(`Webhook: pagamento confirmado ${payment.id} sem fatura local — baixa NÃO aplicada. Verifique o vínculo do aluno no Asaas.`);
        }

        if (localPayment) {
          // Baixa automática: mesmo caminho da baixa manual do professor.
          // Idempotente — o Asaas dispara RECEIVED e CONFIRMED para a
          // mesma cobrança, e o segundo evento vira no-op.
          const { PaymentService } = await import('@/services/payment.service');
          const result = await PaymentService.settlePayment(localPayment.id, {
            method: payment.billingType?.toLowerCase(),
            paymentdate: payment.paymentDate || undefined,
          });
          if (!result.success) {
            console.error('Webhook: erro na baixa automática:', result.error);
          }
        }
        break;
      }

      case 'PAYMENT_OVERDUE': {
        await ensurePaymentExists(payment);

        // Estados terminais não podem ser revertidos por um evento atrasado do
        // Asaas. Sem esta guarda, um pagamento já baixado voltava para 'vencido'
        // — e, pior, um lançamento EXCLUÍDO pelo professor ressuscitava como
        // dívida, rebloqueando o aluno.
        // (O cancelamento da cobrança no Asaas nem sempre é possível: ele recusa
        // fora de PENDING/OVERDUE.)
        const { data: overdueRows, error } = await supabase
          .from('payment')
          .update({ status: 'vencido' })
          .eq('asaas_payment_id', payment.id)
          .not('status', 'in', '(pago,cancelado,renegociado)')
          .select('idstudent_fk');

        if (error) {
          console.error('Webhook: erro ao marcar como vencido:', error.message);
        }

        // Nenhuma linha afetada = já estava pago (ou não existe): não há
        // inadimplência a punir. Antes as consequências rodavam mesmo assim.
        const paymentRecord = overdueRows?.[0];

        if (paymentRecord?.idstudent_fk) {
          // RN06: bloqueio, recusa de solicitações e aviso (as aulas já
          // marcadas permanecem) — lógica compartilhada com o cron de cobrança.
          const { PaymentService } = await import('@/services/payment.service');
          await PaymentService.applyOverdueConsequences(paymentRecord.idstudent_fk);
        }
        break;
      }

      case 'PAYMENT_DELETED': {
        // Mesmos estados terminais do OVERDUE: quando a baixa manual (ou a
        // exclusão do lançamento) cancela a cobrança no Asaas, o eco deste
        // evento não pode sobrescrever o status que já ficou definido aqui.
        await supabase
          .from('payment')
          .update({ status: 'cancelado' })
          .eq('asaas_payment_id', payment.id)
          .not('status', 'in', '(pago,cancelado,renegociado)');
        break;
      }

      case 'PAYMENT_REFUNDED':
      case 'PAYMENT_CHARGEBACK_REQUESTED': {
        // Estorno/chargeback cancela mesmo que já estivesse pago — e devolve
        // os créditos liberados na compra, senão o aluno fica com o dinheiro
        // E com as aulas.
        const { data: refunded } = await supabase
          .from('payment')
          .select('id, status, credits_qty, idstudent_fk, idusers_fk, amount')
          .eq('asaas_payment_id', payment.id)
          .maybeSingle();

        if (!refunded) {
          console.warn(`Webhook ${event}: pagamento ${payment.id} não encontrado no banco local.`);
          break;
        }

        const wasPaid = refunded.status === 'pago';
        await supabase
          .from('payment')
          .update({ status: 'cancelado' })
          .eq('id', refunded.id);

        const creditsToRevert = wasPaid ? Number(refunded.credits_qty) || 0 : 0;
        if (creditsToRevert > 0) {
          // Remove até N créditos comprados (origin nulo) ainda não usados.
          const { data: revertable } = await supabase
            .from('credit')
            .select('id')
            .eq('idstudent_fk', refunded.idstudent_fk)
            .eq('used', false)
            .is('origin_lesson_fk', null)
            .order('created_at', { ascending: false })
            .limit(creditsToRevert);

          const revertIds = (revertable || []).map(c => c.id);
          if (revertIds.length > 0) {
            const { error: delErr } = await supabase.from('credit').delete().in('id', revertIds);
            if (delErr) {
              console.error(`Webhook ${event}: erro ao remover créditos:`, delErr.message);
            } else {
              const { data: st } = await supabase
                .from('student')
                .select('totallessons')
                .eq('idstudent', refunded.idstudent_fk)
                .maybeSingle();
              const newTotal = Math.max(0, (Number(st?.totallessons) || 0) - revertIds.length);
              await supabase.from('student').update({ totallessons: newTotal }).eq('idstudent', refunded.idstudent_fk);
            }
          }

          const spent = creditsToRevert - revertIds.length;
          const estornoMsg = `Um pagamento de R$ ${Number(refunded.amount).toFixed(2).replace('.', ',')} foi ${event === 'PAYMENT_REFUNDED' ? 'estornado' : 'contestado (chargeback)'} no Asaas. ${revertIds.length} crédito(s) foram removidos do aluno.${spent > 0 ? ` Atenção: ${spent} crédito(s) já haviam sido usados em aulas — avalie a cobrança manual.` : ''}`;
          const { error: estornoNotifErr } = await supabase.from('notification').insert([{
            idusers_fk: refunded.idusers_fk,
            idstudent_fk: refunded.idstudent_fk,
            recipient: 'teacher',
            type: 'sistema',
            title: 'Pagamento estornado',
            message: estornoMsg,
            read: false,
          }]);
          if (estornoNotifErr) {
            console.error(`Webhook ${event}: erro ao notificar estorno:`, estornoNotifErr.message);
          }
          await emailTeacher(refunded.idusers_fk, {
            title: 'Pagamento estornado',
            message: estornoMsg,
            buttonLabel: 'Ver financeiro',
            buttonPath: '/financeiro',
          });
        }
        break;
      }

      default: {
        // Não engolir eventos desconhecidos em silêncio — fica no log para
        // diagnóstico (ex.: PAYMENT_UPDATED, PAYMENT_RESTORED).
        console.log(`Webhook Asaas: evento ${event} recebido e ignorado.`);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Webhook error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
