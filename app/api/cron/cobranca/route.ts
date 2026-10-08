import { NextRequest, NextResponse } from 'next/server';
import { getLocalISODate, nowInSaoPaulo } from '@/lib/utils';
import { createAdminClient } from '@/lib/supabase/server';
import { PaymentService } from '@/services/payment.service';
import { autoMarkPastLessonsAsRealizada } from '@/services/lesson-autocomplete.service';

// Sem cache: precisa ler o estado atual das faturas a cada execução.
export const dynamic = 'force-dynamic';

/**
 * Cron diário de cobrança (RN06 para faturas locais).
 *
 * O webhook do Asaas só cobre cobranças criadas lá. Faturas locais (dinheiro,
 * mensalidade manual, grade de faturas, ambientes sem ASAAS_API_KEY) nunca
 * venciam: ficavam "pendente" para sempre, o aluno não era bloqueado e o
 * professor não as via como "Atrasado". Este cron fecha esse ciclo:
 *
 * 1. Marca 'vencido' toda fatura 'pendente' com duedate < hoje;
 * 2. Aplica as consequências de inadimplência aos alunos afetados
 *    (bloqueio para novos agendamentos, recusa de solicitações — as aulas já
 *    marcadas NÃO são canceladas) — mesma lógica do webhook, via
 *    PaymentService.applyOverdueConsequences;
 * 3. Marca como 'realizada' as aulas 'agendada' que já terminaram;
 * 4. Cobra diariamente quem está em atraso (sendOverdueReminders): o aviso do
 *    passo 2 sai uma vez só — por desenho, já que bloquear e cancelar aulas não
 *    pode repetir — e a dívida sumia da caixa de entrada do aluno no dia
 *    seguinte.
 *
 * Idempotente: rodar duas vezes no mesmo dia não repete efeitos (o update de
 * status é o filtro, applyOverdueConsequences ignora aluno já bloqueado e os
 * lembretes checam se já houve aviso hoje).
 */
export async function GET(request: NextRequest) {
  // Fail-closed: sem o segredo configurado, ninguém dispara o cron.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET não configurado — cron de cobrança rejeitado.');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    // Relógio de São Paulo, não do servidor (que roda em UTC): o cron às 08:30
    // BRT cai no mesmo dia UTC por sorte, mas depender disso é frágil.
    const today = getLocalISODate(nowInSaoPaulo());

    // 0. Ponte plano→fatura: planos recorrentes que chegaram ao vencimento
    // (student.expirationdate) sem nenhuma fatura gerada ganham a mensalidade
    // 'pendente' aqui — o passo 1 já a marca vencida e o passo 2 aplica as
    // consequências (bloqueio + notificação + e-mail) na mesma execução.
    const invoicesCreated = await PaymentService.generateMensalidadesFromExpiredPlans();

    // 1. Pendente com vencimento passado → vencido
    const { data: overdueRows, error: overdueErr } = await supabase
      .from('payment')
      .update({ status: 'vencido' })
      .eq('status', 'pendente')
      .lt('duedate', today)
      .select('id, idstudent_fk');

    if (overdueErr) {
      console.error('Cron cobrança: erro ao marcar vencidos:', overdueErr.message);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    // 2. Consequências por aluno (dedup — um aluno pode ter várias faturas)
    const studentIds = [...new Set((overdueRows || []).map(r => r.idstudent_fk).filter(Boolean))];
    for (const studentId of studentIds) {
      await PaymentService.applyOverdueConsequences(studentId);
    }

    // 3. (removido) Antes este passo cancelava as aulas 'aguardando_pagamento'
    // com data passada ("Expirada"). Isso apagava da agenda aulas que muitas
    // vezes aconteceram e foram pagas depois — a baixa nunca as devolvia. Agora
    // elas permanecem na agenda e o professor decide o que fazer com cada uma.

    // 3b. Aulas 'agendada' cujo horário já passou → 'realizada'.
    // Rede de segurança global: a mesma rotina roda quando o aluno abre a área
    // dele e quando o professor abre o app, mas a agenda de quem não entra no
    // sistema ficaria amarela para sempre — foi exatamente o que aconteceu com
    // as aulas dos alunos que nunca logaram.
    // Não gera cobrança (decisão de produto): a fatura continua saindo só na
    // marcação manual pelo modal da agenda.
    const autoRealizada = await autoMarkPastLessonsAsRealizada({ kind: 'global' });
    if (autoRealizada.error) {
      console.error('Cron cobrança: erro ao auto-marcar realizadas:', autoRealizada.error);
    }

    // 4. Lembretes de vencimento (RF07): fatura pendente vencendo em 5 dias
    // ou hoje → aviso in-app + e-mail ao aluno (idempotente por dia).
    const dueReminders = await PaymentService.sendDueReminders();

    // 5. Lembrete diário de fatura já vencida, enquanto seguir em aberto.
    // Roda DEPOIS do passo 4 de propósito: quem tem uma fatura vencida e outra
    // vencendo hoje recebe o aviso do vencimento do dia, e a checagem de "uma
    // cobrança por dia" impede o segundo e-mail.
    const overdueReminders = await PaymentService.sendOverdueReminders();

    return NextResponse.json({
      date: today,
      invoicesCreated,
      dueReminders,
      overdueReminders,
      markedOverdue: overdueRows?.length || 0,
      studentsBlocked: studentIds.length,
      lessonsCompleted: autoRealizada.count,
    });
  } catch (err: any) {
    console.error('Cron cobrança: erro inesperado:', err?.message || err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
