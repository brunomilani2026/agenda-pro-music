import { safeUpdateTag } from '@/lib/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { Payment } from '@/types/database.types';
import { LessonService } from '@/services/lesson.service';
import { AsaasClient, methodToBillingType, packageTypeToCycle } from '@/lib/asaas';
import { gerarPixEstatico, pixConfigurado, txidDoPagamento } from '@/lib/pix';
import { alunosInativos } from '@/lib/aluno-inativo';
import { emailStudent, emailTeacher } from '@/lib/notify-email';
import { afterResponse } from '@/lib/after-response';
import { getLocalISODate, addMonthsKeepDay, projectNextMensalidadeDue, normalizePaymentMethod, nowInSaoPaulo } from '@/lib/utils';

/**
 * Até quantos dias de atraso o lembrete diário continua saindo. Depois disso o
 * aluno já está bloqueado e a cobrança vira decisão do professor — insistir por
 * e-mail só rende marcação de spam, que prejudica a entrega de todo o domínio.
 */
const OVERDUE_REMINDER_MAX_DAYS = 30;

/**
 * Data em que o lembrete diário entrou no ar. Faturas vencidas ANTES disso não
 * recebem cobrança automática.
 *
 * Sem este corte, o primeiro cron depois do deploy alcançaria todo mundo que já
 * estava em atraso — cinco alunos, alguns com mais de duas semanas — e passaria
 * a mandar e-mail diário a eles sem aviso. Quem já devia quando a régua mudou é
 * assunto do professor, não de uma cobrança retroativa disparada por um deploy.
 *
 * Pode ser removida quando não houver mais faturas anteriores a ela em aberto.
 */
const OVERDUE_REMINDER_START_DATE = '2026-08-22';

/**
 * Dias inteiros entre duas datas ISO (YYYY-MM-DD). Usa Date.UTC para não
 * escorregar em horário de verão nem no fuso do servidor — só a data importa.
 */
function daysBetweenIso(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export class PaymentService {
  static async getPaymentsByTeacher(idusers_fk: string): Promise<Payment[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payment')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .order('duedate', { ascending: false });

    if (error) {
      console.error('Error fetching payments:', error.message);
      return [];
    }
    return data || [];
  }

  /**
   * Desliga a cobrança da aula antes de a aula ser apagada. `payment.lesson_fk`
   * referencia lesson(idlesson) sem ON DELETE: sem isto, excluir uma aula que
   * já gerou cobrança falha com violação de FK (23503) e o professor só vê
   * "erro ao excluir". A cobrança em si é preservada — apagá-la sumiria com
   * dinheiro registrado no financeiro.
   */
  static async clearLessonRefs(lessonIds: string[]): Promise<void> {
    if (!lessonIds.length) return;
    const supabase = await createClient();
    const { error } = await supabase
      .from('payment')
      .update({ lesson_fk: null })
      .in('lesson_fk', lessonIds);
    if (error) console.error('Error clearing payment.lesson_fk:', error.message);
  }

  static async getPaymentsByStudent(idstudent_fk: string): Promise<Payment[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payment')
      .select('*')
      .eq('idstudent_fk', idstudent_fk)
      .order('duedate', { ascending: false });

    if (error) {
      console.error('Error fetching student payments:', error.message);
      return [];
    }
    return data || [];
  }

  static async createPayment(paymentData: Omit<Payment, 'id' | 'created_at'>, db?: any): Promise<Payment | null> {
    const supabase = db ?? await createClient();
    const { data, error } = await supabase
      .from('payment')
      .insert([paymentData])
      .select()
      .single();

    if (error) {
      console.error('Error creating payment:', error.message);
      return null;
    }

    await PaymentService.attachStaticPix(supabase, data);
    return data;
  }

  /**
   * Pix estático: toda cobrança nasce com QR Code e "copia e cola" próprios
   * (sem Asaas). Muta `payment` e grava no banco. Falha aqui nunca derruba a
   * criação do pagamento. Sem PIX_CHAVE configurada, não faz nada.
   */
  static async attachStaticPix(supabase: any, payment: any): Promise<void> {
    if (!payment || payment.asaas_pix_payload || !pixConfigurado() || !(Number(payment.amount) > 0)) return;
    try {
      const pix = await gerarPixEstatico({ valor: Number(payment.amount), txid: txidDoPagamento(payment.id) });
      const { error: pixErr } = await supabase
        .from('payment')
        .update({ asaas_pix_payload: pix.payload, asaas_pix_qrcode: pix.qrcodeBase64 })
        .eq('id', payment.id);
      if (pixErr) throw new Error(pixErr.message);
      payment.asaas_pix_payload = pix.payload;
      payment.asaas_pix_qrcode = pix.qrcodeBase64;
    } catch (e: any) {
      console.error('Pix estático não gerado para o pagamento', payment.id, e?.message);
    }
  }

  static async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payment')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating payment:', error.message);
      return null;
    }
    return data;
  }

  static async getOverduePayments(idusers_fk: string): Promise<Payment[]> {
    const supabase = await createClient();
    const today = getLocalISODate();
    const { data, error } = await supabase
      .from('payment')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .eq('status', 'pendente')
      .lt('duedate', today);

    if (error) {
      console.error('Error fetching overdue payments:', error.message);
      return [];
    }
    return data || [];
  }

  /**
   * Libera o aluno se não sobrou nenhum débito vencido.
   *
   * Era código inline no fim de settlePayment e, em versão reduzida (sem os
   * avisos), na renegociação. Virou método porque o cancelamento de lançamento
   * precisa exatamente do mesmo comportamento: nada mais no sistema desfaz um
   * `student.status = 'bloqueado'` — nem a tela de Alunos, que preserva o
   * bloqueio de propósito.
   *
   * `studentMessage` é parametrizado porque o texto certo depende do que
   * aconteceu (pagamento confirmado, cobrança cancelada, prazo renegociado).
   */
  static async unblockIfNoDebt(
    idstudent_fk: string,
    opts: {
      idusers_fk: string;
      studentMessage?: string;
      studentTitle?: string;
      /** Status do aluno ANTES da operação — decide se o professor é avisado. */
      previousStatus?: string | null;
      studentName?: string | null;
      /** Ignora este pagamento na conta da dívida (ex.: a fatura recém-criada). */
      excludePaymentId?: string;
      /** A renegociação manda a própria mensagem logo depois — não duplicar. */
      notifyStudent?: boolean;
      db?: any;
    }
  ): Promise<{ unblocked: boolean }> {
    const supabase = opts.db ?? createAdminClient();
    const today = getLocalISODate(new Date());

    let query = supabase
      .from('payment')
      .select('id')
      .eq('idstudent_fk', idstudent_fk)
      .in('status', ['pendente', 'vencido'])
      .lt('duedate', today);
    if (opts.excludePaymentId) query = query.neq('id', opts.excludePaymentId);

    const { data: otherDebts } = await query.limit(1);

    if (otherDebts && otherDebts.length > 0) return { unblocked: false };

    await supabase
      .from('student')
      .update({ status: 'ativo' })
      .eq('idstudent', idstudent_fk);

    const studentTitle = opts.studentTitle;
    const studentMessage = opts.studentMessage;
    if (opts.notifyStudent !== false && studentTitle && studentMessage) {
      // Os dois FKs sempre preenchidos (regra da tabela notification).
      const { error: notifErr } = await supabase.from('notification').insert([{
        idusers_fk: opts.idusers_fk,
        idstudent_fk,
        recipient: 'student',
        type: 'sistema',
        title: studentTitle,
        message: studentMessage,
        read: false,
      }]);
      if (notifErr) console.error('unblockIfNoDebt: erro ao notificar aluno:', notifErr.message);

      // E-mail depois da resposta (ver lib/after-response.ts): o clique do
      // professor / o 200 do webhook não esperam o EmailJS.
      await afterResponse(() => emailStudent(idstudent_fk, {
        title: studentTitle,
        message: studentMessage,
        buttonLabel: 'Acessar painel',
        buttonPath: '/aluno/dashboard',
      }));
    }

    // Aluno estava bloqueado: avisa o professor. Aulas canceladas por
    // inadimplência ANTES de o cancelamento automático ser removido não voltam
    // sozinhas — por isso a mensagem manda conferir a agenda.
    if (opts.previousStatus === 'bloqueado') {
      const regularizouMsg = `${opts.studentName || 'O aluno'} foi desbloqueado e pode voltar a agendar aulas. Se alguma aula dele foi cancelada por inadimplência em data anterior, ela não volta automaticamente — confira a agenda.`;
      const { error: regNotifErr } = await supabase.from('notification').insert([{
        idusers_fk: opts.idusers_fk,
        idstudent_fk,
        recipient: 'teacher',
        type: 'sistema',
        title: 'Aluno regularizado',
        message: regularizouMsg,
        read: false,
      }]);
      if (regNotifErr) console.error('unblockIfNoDebt: erro ao notificar regularização:', regNotifErr.message);

      await afterResponse(() => emailTeacher(opts.idusers_fk, {
        title: 'Aluno regularizado',
        message: regularizouMsg,
        buttonLabel: 'Abrir agenda',
        buttonPath: '/agenda',
      }));
    }

    return { unblocked: true };
  }

  static async getStudentDebt(idstudent_fk: string): Promise<boolean> {
    const supabase = await createClient();
    const today = getLocalISODate();
    const { data, error } = await supabase
      .from('payment')
      .select('id')
      .eq('idstudent_fk', idstudent_fk)
      .in('status', ['pendente', 'vencido'])
      .lt('duedate', today)
      .limit(1);

    if (error) return false;
    return (data?.length || 0) > 0;
  }

  /**
   * Baixa de um pagamento — caminho ÚNICO usado pelo webhook do Asaas
   * (baixa automática) e pela baixa manual do professor (ex.: Pix feito
   * direto na conta, fora da plataforma). Os dois caminhos ganham os
   * mesmos efeitos: gerar a próxima mensalidade, confirmar aula vinculada,
   * avançar o vencimento do plano, liberar créditos, desbloquear o aluno
   * e notificar/enviar e-mail.
   *
   * Idempotente: pagamento já 'pago' vira no-op (o Asaas dispara
   * PAYMENT_RECEIVED e PAYMENT_CONFIRMED para a mesma cobrança).
   */
  static async settlePayment(paymentId: string, opts: {
    method?: string;
    paymentdate?: string;
    notes?: string;
    /** Baixa manual: restringe ao professor dono do pagamento. */
    scopeTeacherId?: string;
    /** Baixa manual: cancela a cobrança aberta no Asaas (evita pagamento duplo). */
    cancelAsaasCharge?: boolean;
  } = {}): Promise<{ success: boolean; error?: string; warning?: string }> {
    // O webhook roda sem sessão; a autorização do caminho manual vem do
    // filtro explícito por scopeTeacherId.
    const supabase = createAdminClient();

    let query = supabase.from('payment').select('*').eq('id', paymentId);
    if (opts.scopeTeacherId) query = query.eq('idusers_fk', opts.scopeTeacherId);
    const { data: pmt, error: fetchErr } = await query.single();

    if (fetchErr || !pmt) {
      return { success: false, error: 'Pagamento não encontrado.' };
    }
    if (pmt.status === 'pago') {
      // No-op, mas não silencioso: a tela dizia "recebido" sem nada ter mudado,
      // e o professor ficava sem saber por que o valor não entrava no caixa.
      return { success: true, warning: 'Este lançamento já constava como pago — nada foi alterado.' };
    }
    if (pmt.status === 'renegociado' || pmt.status === 'cancelado') {
      return { success: false, error: `Este pagamento está ${pmt.status} e não pode receber baixa.` };
    }

    let warning: string | undefined;
    if (opts.cancelAsaasCharge && pmt.asaas_payment_id && process.env.ASAAS_API_KEY) {
      try {
        await AsaasClient.deletePayment(pmt.asaas_payment_id);
      } catch (e: any) {
        console.error('settlePayment: erro ao cancelar cobrança no Asaas:', e.message);
        warning = 'Baixa registrada, mas a cobrança aberta no Asaas não pôde ser cancelada. Cancele-a manualmente para evitar pagamento duplicado.';
        const asaasMsg = `A baixa manual foi registrada, mas a cobrança correspondente no Asaas não pôde ser cancelada (${e.message}). Cancele-a manualmente para evitar pagamento duplicado.`;
        await supabase.from('notification').insert([{
          idusers_fk: pmt.idusers_fk,
          idstudent_fk: pmt.idstudent_fk,
          recipient: 'teacher',
          type: 'sistema',
          title: 'Cobrança Asaas não cancelada',
          message: asaasMsg,
          read: false,
        }]);

        // Risco financeiro (cobrança duplicada): o professor precisa saber fora
        // do app, não só no sino de notificações.
        await emailTeacher(pmt.idusers_fk, {
          title: 'Cobrança Asaas não cancelada',
          message: asaasMsg,
          buttonLabel: 'Ver financeiro',
          buttonPath: '/financeiro',
        });
      }
    }

    // Normaliza o método para os valores aceitos pelo CHECK do banco
    // (o Asaas manda billingType como CREDIT_CARD, por exemplo).
    const method = normalizePaymentMethod(opts.method || pmt.method);

    const updates: Record<string, any> = {
      status: 'pago',
      paymentdate: opts.paymentdate || getLocalISODate(new Date()),
      method,
    };
    if (opts.notes) updates.notes = pmt.notes ? `${pmt.notes} | ${opts.notes}` : opts.notes;

    // .neq('status','pago') fecha a corrida entre webhook e baixa manual:
    // se outro caminho baixou depois do nosso select, viramos no-op.
    const { data: updatedRows, error: updateErr } = await supabase
      .from('payment')
      .update(updates)
      .eq('id', pmt.id)
      .neq('status', 'pago')
      .select('id');

    if (updateErr) {
      return { success: false, error: 'Erro ao registrar a baixa: ' + updateErr.message };
    }
    if (!updatedRows || updatedRows.length === 0) {
      // Outro caminho baixou entre o nosso select e o update. Também precisa
      // avisar: sem isso a UI confirmava uma baixa que não aconteceu aqui.
      const raceMsg = 'Este lançamento já constava como pago — nada foi alterado.';
      return { success: true, warning: warning ? `${warning} ${raceMsg}` : raceMsg };
    }

    // ── Efeitos da confirmação (antes duplicados no webhook) ──────────

    // Mensalidade paga → já gera antecipadamente a fatura do próximo período.
    await this.generateNextMensalidade({
      idstudent_fk: pmt.idstudent_fk,
      idusers_fk: pmt.idusers_fk,
      amount: pmt.amount,
      duedate: pmt.duedate,
      method,
      credits_qty: pmt.credits_qty,
      lesson_fk: pmt.lesson_fk,
    }, supabase);

    // Se há aula vinculada aguardando pagamento → confirmar como agendada
    if (pmt.lesson_fk) {
      const { data: linkedLesson } = await supabase
        .from('lesson')
        .select('lessonstatus, instrument, date, starttime')
        .eq('idlesson', pmt.lesson_fk)
        .single();

      if (linkedLesson?.lessonstatus === 'aguardando_pagamento') {
        await supabase
          .from('lesson')
          .update({ lessonstatus: 'agendada' })
          .eq('idlesson', pmt.lesson_fk);

        const aulaMsg = `Pagamento confirmado! Sua aula de ${linkedLesson.instrument} em ${linkedLesson.date} às ${linkedLesson.starttime} está agendada.`;
        // Os dois FKs sempre preenchidos (regra da tabela notification).
        const { error: aulaNotifErr } = await supabase.from('notification').insert([{
          idusers_fk: pmt.idusers_fk,
          idstudent_fk: pmt.idstudent_fk,
          recipient: 'student',
          type: 'confirmacao',
          title: 'Aula agendada!',
          message: aulaMsg,
          read: false,
        }]);
        if (aulaNotifErr) {
          console.error('settlePayment: erro ao notificar aula agendada:', aulaNotifErr.message);
        }

        await afterResponse(() => emailStudent(pmt.idstudent_fk, {
          title: 'Aula agendada!',
          message: aulaMsg,
          buttonLabel: 'Ver minhas aulas',
          buttonPath: '/aluno/dashboard',
        }));
      }
    }

    const creditsToRelease = Number(pmt.credits_qty) || 0;
    // Fallback de 180 dias para compras antigas anteriores à migração.
    const validityDays = Number(pmt.credits_validity_days) || 180;

    // ── Avançar vencimento do plano recorrente ──────────────────
    // Buscamos o pacote do aluno para decidir o passo de extensão.
    // Para mensal/trimestral/semestral, avançamos em CICLOS INTEIROS a partir
    // do vencimento salvo, preservando o dia do mês.
    const { data: studentPlan } = await supabase
      .from('student')
      .select('packagetype, expirationdate, totallessons, idusers_fk, status, name')
      .eq('idstudent', pmt.idstudent_fk)
      .single();

    const pkg = (studentPlan?.packagetype || '').toLowerCase();
    const monthsToAdd = pkg === 'mensal' ? 1 : pkg === 'trimestral' ? 3 : pkg === 'semestral' ? 6 : 0;

    // Só mensalidade avança o ciclo. Compra de créditos e cobrança de aula
    // avulsa são pagamentos extras: empurravam o vencimento do plano de graça
    // (um pacote quitado dava um mês grátis ao aluno mensal). Mesma condição
    // que generateNextMensalidade já aplica lá em cima.
    const isMensalidade = creditsToRelease === 0 && !pmt.lesson_fk;

    if (monthsToAdd > 0 && isMensalidade) {
      // Relógio de São Paulo, não do servidor (que roda em UTC): depois das
      // 21:00 BRT um `new Date()` já virou o dia, e o vencimento do plano de
      // quem pagava à noite andava um dia a mais a cada ciclo.
      const todayIso = getLocalISODate(nowInSaoPaulo());
      const current = studentPlan?.expirationdate || '';

      // O ciclo avança SEMPRE a partir do vencimento anterior, nunca da data do
      // pagamento. Antes, quem pagasse atrasado tinha a base trocada por hoje e
      // o dia do ciclo escorregava: plano vencido em 17/07 e pago em 28/07 ia
      // para 28/08, enquanto a fatura seguinte nascia em 17/08
      // (projectNextMensalidadeDue usa addMonthsKeepDay sobre a última fatura).
      // A ficha do aluno e o Financeiro passavam a mostrar dias diferentes.
      //
      // addMonthsKeepDay também protege o fim do mês: 31/01 + 1 mês vira 28/02,
      // e não 03/03 como o setMonth() cru fazia.
      let nextIso = addMonthsKeepDay(current || todayIso, monthsToAdd);

      // Quem sumiu por vários ciclos volta para o ciclo corrente: sem isto, um
      // plano vencido há seis meses continuaria no passado mesmo depois de pago.
      // O dia do mês é preservado em todas as voltas.
      for (let i = 0; i < 60 && nextIso <= todayIso; i++) {
        nextIso = addMonthsKeepDay(nextIso, monthsToAdd);
      }

      await supabase
        .from('student')
        .update({ expirationdate: nextIso })
        .eq('idstudent', pmt.idstudent_fk);

      // Aulas que estavam "pré-agendadas" (aguardando_pagamento) porque caíam
      // além do vencimento anterior e agora ficaram dentro do novo período
      // pago voltam a ser 'agendada' automaticamente.
      await LessonService.releasePendingLessons(pmt.idstudent_fk, nextIso);
    }

    // ── Liberar créditos (totallessons) ─────────────────────────
    if (creditsToRelease > 0) {
      // 1. Incrementar totallessons na tabela student
      const currentTotal = Number(studentPlan?.totallessons) || 0;
      const teacherId = studentPlan?.idusers_fk || pmt.idusers_fk;

      await supabase
        .from('student')
        .update({ totallessons: currentTotal + creditsToRelease })
        .eq('idstudent', pmt.idstudent_fk);

      // 2. Inserir N registros na tabela credit (um por aula).
      // Validade vem do combo (espelhada no payment no momento da compra).
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + validityDays);
      const expiresAtStr = getLocalISODate(expiresAt);

      const creditRows = Array.from({ length: creditsToRelease }, () => ({
        idstudent_fk: pmt.idstudent_fk,
        idusers_fk: teacherId,
        expires_at: expiresAtStr,
        used: false,
      }));

      const { error: creditErr } = await supabase.from('credit').insert(creditRows);
      if (creditErr) {
        console.error('settlePayment: erro ao criar créditos:', creditErr.message);
      }
    }

    // ── Sem mais débitos vencidos → liberar o aluno ──────────────
    const pagoMsg = creditsToRelease > 0
      ? `Seu pagamento foi confirmado. ${creditsToRelease} crédito${creditsToRelease > 1 ? 's' : ''} liberado${creditsToRelease > 1 ? 's' : ''} — você já pode agendar suas aulas!`
      : 'Seu pagamento foi confirmado. Sua agenda está liberada para novas aulas.';

    await this.unblockIfNoDebt(pmt.idstudent_fk, {
      idusers_fk: pmt.idusers_fk,
      studentTitle: 'Pagamento confirmado!',
      studentMessage: pagoMsg,
      previousStatus: studentPlan?.status,
      studentName: studentPlan?.name,
      db: supabase,
    });

    // Caminho do dinheiro: o aluno espera ver a fatura paga, a aula
    // confirmada e os créditos na hora — não dá para esperar o TTL do cache.
    safeUpdateTag('aluno-payments');
    safeUpdateTag('aluno-lessons');
    safeUpdateTag('aluno-credits');

    return { success: true, warning };
  }

  /**
   * Consequências da inadimplência (RN06): bloqueia o aluno, cancela as aulas
   * futuras (agendadas E aguardando pagamento — ambas ocupavam o slot), recusa
   * solicitações pendentes e avisa o aluno. Compartilhada entre o webhook
   * PAYMENT_OVERDUE e o cron diário de cobrança (que cobre faturas locais sem
   * Asaas). Roda com admin client — não há sessão nesses contextos.
   * Idempotente: aluno já bloqueado é no-op (evita notificação repetida).
   */
  static async applyOverdueConsequences(studentId: string): Promise<void> {
    const supabase = createAdminClient();

    const { data: studentData } = await supabase
      .from('student')
      .select('name, idusers_fk, status')
      .eq('idstudent', studentId)
      .maybeSingle();
    // Inativo fica fora do bloqueio automático (e dos avisos dele).
    if (!studentData || studentData.status === 'bloqueado' || studentData.status === 'inativo') return;

    const { error: blockErr } = await supabase
      .from('student')
      .update({ status: 'bloqueado' })
      .eq('idstudent', studentId);
    if (blockErr) {
      console.error('applyOverdueConsequences: erro ao bloquear aluno:', blockErr.message);
      return;
    }

    // As aulas do aluno NÃO são mais canceladas aqui: o cancelamento automático
    // fazia as aulas sumirem da agenda (inclusive de quem pagava com 1 dia de
    // atraso, já que a quitação nunca as devolvia). O aluno fica bloqueado para
    // agendar novas aulas, mas o que já está marcado continua na agenda.

    // Recusar solicitações pendentes
    await supabase
      .from('lesson_request')
      .update({ status: 'recusada', reason: 'Cancelada por inadimplência' })
      .eq('idstudent_fk', studentId)
      .eq('status', 'pendente');

    const atrasoMsg = 'Sua fatura venceu. Regularize o pagamento para continuar agendando novas aulas. Acesse "Minhas Aulas" para renegociar.';
    const atrasoProfMsg = `${studentData.name} está com a mensalidade em atraso. O aluno foi bloqueado para novos agendamentos; as aulas dele continuam na agenda — acompanhe em Financeiro para renegociar ou dar baixa.`;
    const { error: notifErr } = await supabase.from('notification').insert([
      {
        idusers_fk: studentData.idusers_fk,
        idstudent_fk: studentId,
        recipient: 'student',
        type: 'cobranca',
        title: 'Pagamento em atraso',
        message: atrasoMsg,
        read: false,
      },
      // O professor não era avisado: o aluno sumia da agenda (aulas canceladas)
      // sem nenhum sinal na área dele do porquê.
      {
        idusers_fk: studentData.idusers_fk,
        idstudent_fk: studentId,
        recipient: 'teacher',
        type: 'cobranca',
        title: 'Aluno em atraso',
        message: atrasoProfMsg,
        read: false,
      },
    ]);
    if (notifErr) {
      console.error('applyOverdueConsequences: erro ao notificar:', notifErr.message);
    }

    await emailStudent(studentId, {
      title: 'Pagamento em atraso',
      message: atrasoMsg,
      buttonLabel: 'Renegociar agora',
      buttonPath: '/aluno/dashboard',
    });

    await emailTeacher(studentData.idusers_fk, {
      title: 'Aluno em atraso',
      message: atrasoProfMsg,
      buttonLabel: 'Abrir financeiro',
      buttonPath: '/financeiro',
    });

    safeUpdateTag('aluno-lessons');
    safeUpdateTag('aluno-payments');
  }

  /**
   * Ponte plano→fatura (RN06): cria a mensalidade do período para alunos
   * recorrentes cujo vencimento do plano (student.expirationdate) chegou sem
   * nenhuma fatura gerada (professor não rodou a grade nem lançou recebimento).
   * Sem isso o plano expirava só "no visual" (badge EXPIRADO em Meus Alunos),
   * mas nenhuma superfície financeira via a dívida: aluno sem fatura, dashboard
   * sem inadimplência, Financeiro sem Atrasado e nenhum e-mail de cobrança.
   *
   * Chamada pelo cron diário de cobrança ANTES do passo pendente→vencido: a
   * fatura criada com vencimento passado já vira 'vencido' e dispara as
   * consequências (bloqueio, notificação e e-mail de atraso) na mesma execução.
   *
   * Salvaguardas (mesmas de generateNextMensalidade):
   *  - só pacote recorrente; pula assinatura Asaas; exige lessonprice > 0;
   *  - pula quem já tem fatura em aberto (pendente/vencido) — já está cobrado;
   *  - dedup por mês do vencimento (não duplica mensalidade do mesmo mês).
   */
  static async generateMensalidadesFromExpiredPlans(): Promise<number> {
    const supabase = createAdminClient();
    const today = getLocalISODate(new Date());

    // Antecedência de 7 dias: a fatura nasce 'pendente' ANTES do vencimento,
    // então o professor a vê em "A Receber", o aluno a vê na lista com botão
    // de pagar e recebe o aviso por e-mail com tempo de pagar em dia — em vez
    // de a cobrança só existir depois de vencida.
    const horizonDate = new Date();
    horizonDate.setDate(horizonDate.getDate() + 7);
    const horizon = getLocalISODate(horizonDate);

    const { data: students, error } = await supabase
      .from('student')
      .select('idstudent, idusers_fk, packagetype, lessonprice, paymentmethod, asaas_subscription_id, expirationdate')
      .eq('status', 'ativo')
      .not('expirationdate', 'is', null)
      .lte('expirationdate', horizon);
    if (error) {
      console.error('generateMensalidadesFromExpiredPlans: erro ao buscar alunos:', error.message);
      return 0;
    }

    let created = 0;
    for (const student of students || []) {
      const pkg = (student.packagetype || 'avulsa').toLowerCase();
      const monthsToAdd = pkg === 'mensal' ? 1 : pkg === 'trimestral' ? 3 : pkg === 'semestral' ? 6 : 0;
      if (monthsToAdd === 0) continue;
      // Assinatura Asaas ativa → o próprio Asaas emite e vence as faturas.
      if (student.asaas_subscription_id) continue;

      const amount = Number(student.lessonprice) || 0;
      if (amount <= 0) continue;

      const { data: rows } = await supabase
        .from('payment')
        .select('duedate, status, credits_qty, lesson_fk')
        .eq('idstudent_fk', student.idstudent)
        .neq('status', 'cancelado');
      const history = rows || [];

      // Fatura em aberto (deste ou de outro período) → o aluno já está cobrado.
      if (history.some(p => p.status === 'pendente' || p.status === 'vencido')) continue;

      // Meses com mensalidade PAGA (compra de créditos e aula avulsa não
      // contam): período quitado por fora — ex.: lançamento manual antigo que
      // não avançou o vencimento do plano — não pode ser cobrado de novo.
      const paidMonths = new Set(
        history
          .filter(p => p.status === 'pago' && !(Number(p.credits_qty) || 0) && !p.lesson_fk)
          .map(p => (p.duedate || '').slice(0, 7))
      );

      // Alvo: primeiro ciclo do plano ainda não quitado. Ciclos já pagos
      // avançam; ciclos antigos SEM pagamento não empilham — cobra só o
      // período corrente.
      let duedate = student.expirationdate as string;
      for (let i = 0; i < 60; i++) {
        const next = addMonthsKeepDay(duedate, monthsToAdd);
        if (paidMonths.has(duedate.slice(0, 7))) { duedate = next; continue; }
        if (next <= today) { duedate = next; continue; }
        break;
      }

      // Realinha a ficha ao ciclo apurado: some o falso "EXPIRADO" de quem
      // pagou por um caminho que não avançou o vencimento do plano.
      if (duedate !== student.expirationdate) {
        await supabase
          .from('student')
          .update({ expirationdate: duedate })
          .eq('idstudent', student.idstudent);
      }

      // Ciclo corrente além da janela de antecedência → plano em dia, a
      // fatura nasce quando o vencimento se aproximar.
      if (duedate > horizon) continue;

      // Última guarda de duplicidade no mês-alvo (ex.: mensalidade renegociada).
      const monthPrefix = duedate.slice(0, 7);
      const hasMensalidadeInMonth = history.some(p =>
        (p.duedate || '').slice(0, 7) === monthPrefix && !(Number(p.credits_qty) || 0) && !p.lesson_fk
      );
      if (hasMensalidadeInMonth) continue;

      const [ry, rm] = duedate.split('-').map(Number);
      const monthLabel = new Date(ry, rm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

      const payment = await this.createPayment({
        idstudent_fk: student.idstudent,
        idusers_fk: student.idusers_fk,
        amount,
        duedate,
        status: 'pendente',
        method: normalizePaymentMethod(student.paymentmethod),
        notes: `Mensalidade ${monthLabel} — gerada automaticamente (vencimento do plano)`,
        fine: 0,
        interest: 0,
      } as any, supabase);
      if (!payment) continue;
      created++;

      // Fatura ainda no prazo (vence hoje ou nos próximos dias): avisa que
      // está disponível para pagamento. Se o vencimento já passou, quem avisa
      // é o fluxo de atraso (applyOverdueConsequences) na sequência do cron —
      // evita duas notificações/e-mails na mesma execução.
      if (duedate >= today) {
        const valorBr = amount.toFixed(2).replace('.', ',');
        const dueBr = duedate.split('-').reverse().join('/');
        const faturaMsg = `Sua mensalidade de ${monthLabel} (R$ ${valorBr}) já está disponível para pagamento. Vencimento: ${dueBr}.`;
        const { error: notifErr } = await supabase.from('notification').insert([
          {
            idstudent_fk: student.idstudent,
            idusers_fk: student.idusers_fk,
            recipient: 'student',
            type: 'cobranca',
            title: 'Nova fatura disponível',
            message: faturaMsg,
            read: false,
          },
          // O professor também precisa ver na área dele que a cobrança nasceu
          // sem ação manual (no atraso quem avisa é applyOverdueConsequences).
          {
            idstudent_fk: student.idstudent,
            idusers_fk: student.idusers_fk,
            recipient: 'teacher',
            type: 'cobranca',
            title: 'Fatura gerada automaticamente',
            message: `A mensalidade de ${monthLabel} do aluno foi gerada pelo sistema (R$ ${valorBr}, vencimento ${dueBr}). Acompanhe em Financeiro.`,
            read: false,
          },
        ]);
        if (notifErr) {
          console.error('generateMensalidadesFromExpiredPlans: erro ao notificar aluno:', notifErr.message);
        }
        await emailStudent(student.idstudent, {
          title: 'Nova fatura disponível',
          message: faturaMsg,
          buttonLabel: 'Ver faturas',
          buttonPath: '/aluno/financeiro',
        });
      }
    }

    if (created > 0) safeUpdateTag('aluno-payments');
    return created;
  }

  /**
   * Lembretes de vencimento (RF07): avisa o aluno quando a fatura pendente
   * vence em 5 dias e no próprio dia do vencimento — in-app + e-mail.
   * Chamado pelo cron diário de cobrança.
   *
   * Idempotente sem coluna nova: antes de avisar, verifica se a notificação
   * com o mesmo título já foi criada hoje para o aluno (cobre re-execuções do
   * cron no mesmo dia). Fatura criada HOJE não recebe o lembrete de "vence
   * hoje" — ela acabou de gerar o aviso "Nova fatura disponível".
   */
  static async sendDueReminders(): Promise<{ in5days: number; dueToday: number }> {
    const supabase = createAdminClient();
    const today = getLocalISODate(new Date());
    const plus5Date = new Date();
    plus5Date.setDate(plus5Date.getDate() + 5);
    const plus5 = getLocalISODate(plus5Date);

    const { data: rows, error } = await supabase
      .from('payment')
      .select('id, idstudent_fk, idusers_fk, amount, duedate, created_at')
      .eq('status', 'pendente')
      .in('duedate', [today, plus5]);
    if (error) {
      console.error('sendDueReminders: erro ao buscar faturas:', error.message);
      return { in5days: 0, dueToday: 0 };
    }

    // Aluno inativo não recebe lembrete de cobrança.
    const inativos = await alunosInativos((rows || []).map(r => r.idstudent_fk));

    let in5days = 0;
    let dueToday = 0;
    for (const p of rows || []) {
      if (p.idstudent_fk && inativos.has(p.idstudent_fk)) continue;
      if (!p.idstudent_fk) continue;
      const isToday = p.duedate === today;
      if (isToday && (p.created_at || '').slice(0, 10) === today) continue;

      const title = isToday ? 'Sua fatura vence hoje' : 'Sua fatura vence em 5 dias';
      const { data: dup } = await supabase
        .from('notification')
        .select('id')
        .eq('idstudent_fk', p.idstudent_fk)
        .eq('title', title)
        .gte('created_at', `${today}T00:00:00`)
        .limit(1);
      if (dup && dup.length > 0) continue;

      const valorBr = Number(p.amount).toFixed(2).replace('.', ',');
      const dueBr = p.duedate.split('-').reverse().join('/');
      const msg = isToday
        ? `Sua fatura de R$ ${valorBr} vence HOJE (${dueBr}). Pague para evitar o bloqueio e o cancelamento das próximas aulas.`
        : `Sua fatura de R$ ${valorBr} vence em 5 dias (${dueBr}). Pague em dia para manter suas aulas sem interrupção.`;

      const { error: notifErr } = await supabase.from('notification').insert([{
        idstudent_fk: p.idstudent_fk,
        idusers_fk: p.idusers_fk,
        recipient: 'student',
        type: 'cobranca',
        title,
        message: msg,
        read: false,
      }]);
      if (notifErr) {
        console.error('sendDueReminders: erro ao notificar:', notifErr.message);
        continue;
      }
      await emailStudent(p.idstudent_fk, {
        title,
        message: msg,
        buttonLabel: 'Pagar agora',
        buttonPath: '/aluno/financeiro',
      });
      if (isToday) dueToday++; else in5days++;
    }

    return { in5days, dueToday };
  }

  /**
   * Lembrete DIÁRIO de fatura em atraso, enquanto ela seguir em aberto.
   *
   * O aluno recebia um único aviso ("Pagamento em atraso", de
   * applyOverdueConsequences) e depois silêncio — a dívida sumia da caixa de
   * entrada dele no dia seguinte. Isto cobre o intervalo entre o vencimento e a
   * regularização, que é justamente quando a cobrança precisa aparecer.
   *
   * Só o ALUNO recebe. O professor continua com o aviso único do dia do
   * bloqueio; ele acompanha o resto pelo Financeiro.
   *
   * Para em OVERDUE_REMINDER_MAX_DAYS: passado esse ponto o aluno já está
   * bloqueado e a decisão é comercial (renegociar ou encerrar). E-mail
   * automático perpétuo faz o destinatário marcar como spam, o que derruba a
   * entrega de TODOS os e-mails do domínio — inclusive os de aula.
   *
   * Idempotência sem coluna nova: no máximo um aviso de cobrança por aluno por
   * dia. A checagem é por `type = 'cobranca'` (e não pelo título), então também
   * evita o e-mail duplo no primeiro dia, quando applyOverdueConsequences já
   * avisou, e o aluno com duas faturas vencidas recebe uma cobrança só.
   */
  static async sendOverdueReminders(): Promise<number> {
    const supabase = createAdminClient();
    const now = nowInSaoPaulo();
    const today = getLocalISODate(now);

    const janela = getLocalISODate(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - OVERDUE_REMINDER_MAX_DAYS)
    );
    // O mais recente entre a janela móvel de 30 dias e a data de ativação.
    const floor = janela > OVERDUE_REMINDER_START_DATE ? janela : OVERDUE_REMINDER_START_DATE;

    const { data: rows, error } = await supabase
      .from('payment')
      .select('id, idstudent_fk, idusers_fk, amount, duedate')
      .eq('status', 'vencido')
      .gte('duedate', floor)
      .lt('duedate', today)
      .order('duedate', { ascending: true });
    if (error) {
      console.error('sendOverdueReminders: erro ao buscar faturas:', error.message);
      return 0;
    }

    // Aluno inativo não recebe aviso de atraso.
    const inativos = await alunosInativos((rows || []).map(r => r.idstudent_fk));

    let sent = 0;
    const avisados = new Set<string>();

    for (const p of rows || []) {
      if (p.idstudent_fk && inativos.has(p.idstudent_fk)) continue;
      if (!p.idstudent_fk || avisados.has(p.idstudent_fk)) continue;

      const dias = daysBetweenIso(p.duedate, today);
      if (dias < 1) continue;

      const { data: dup } = await supabase
        .from('notification')
        .select('id')
        .eq('idstudent_fk', p.idstudent_fk)
        .eq('type', 'cobranca')
        .gte('created_at', `${today}T00:00:00`)
        .limit(1);
      if (dup && dup.length > 0) {
        avisados.add(p.idstudent_fk);
        continue;
      }

      const valorBr = Number(p.amount).toFixed(2).replace('.', ',');
      const dueBr = p.duedate.split('-').reverse().join('/');
      const plural = dias === 1 ? 'dia' : 'dias';
      const title = `Fatura em atraso há ${dias} ${plural}`;
      const msg = `Sua fatura de R$ ${valorBr}, vencida em ${dueBr}, está em atraso há ${dias} ${plural}. Regularize para desbloquear sua conta e voltar a marcar aulas. Se precisar de prazo, use a opção Renegociar.`;

      const { error: notifErr } = await supabase.from('notification').insert([{
        idstudent_fk: p.idstudent_fk,
        idusers_fk: p.idusers_fk,
        recipient: 'student',
        type: 'cobranca',
        title,
        message: msg,
        read: false,
      }]);
      if (notifErr) {
        console.error('sendOverdueReminders: erro ao notificar:', notifErr.message);
        continue;
      }

      await emailStudent(p.idstudent_fk, {
        title,
        message: msg,
        buttonLabel: 'Regularizar agora',
        buttonPath: '/aluno/financeiro',
      });

      avisados.add(p.idstudent_fk);
      sent++;
    }

    return sent;
  }

  /**
   * Exclui um lançamento: marca 'cancelado' e desfaz os efeitos de cobrança.
   *
   * Usado quando a cobrança não deveria existir (ex.: o aluno comprou o pacote
   * errado no portal). Não é DELETE de verdade de propósito: `renegotiated_from`
   * aponta para linhas de payment, e o histórico da cobrança precisa continuar
   * casável com os eventos que o Asaas ainda pode mandar.
   *
   * Só pendente/vencido. Um lançamento já recebido mexeu em créditos, vencimento
   * do plano e na geração da próxima mensalidade — desfazer isso é estorno, que
   * não está no escopo desta função.
   */
  static async cancelPayment(
    paymentId: string,
    opts: { scopeTeacherId: string; reason?: string }
  ): Promise<{ success: boolean; error?: string; warning?: string }> {
    // Admin + filtro explícito por idusers_fk, mesmo padrão de settlePayment:
    // a autorização vem do escopo, não do RLS.
    const supabase = createAdminClient();

    const { data: pmt, error: fetchErr } = await supabase
      .from('payment')
      .select('*')
      .eq('id', paymentId)
      .eq('idusers_fk', opts.scopeTeacherId)
      .single();

    if (fetchErr || !pmt) {
      return { success: false, error: 'Lançamento não encontrado.' };
    }
    if (pmt.status === 'cancelado') {
      return { success: true }; // idempotente
    }
    if (pmt.status === 'pago') {
      return {
        success: false,
        error: 'Este lançamento já foi recebido e não pode ser excluído. Se o valor não entrou, altere a situação antes.',
      };
    }
    if (pmt.status === 'renegociado') {
      return {
        success: false,
        error: 'Este lançamento foi renegociado — exclua a fatura nova que nasceu dele.',
      };
    }

    // ── Claim atômico: fecha o duplo clique, igual à renegociação ──
    const notes = opts.reason
      ? (pmt.notes ? `${pmt.notes} | Excluído: ${opts.reason}` : `Excluído: ${opts.reason}`)
      : pmt.notes;

    const { data: claimed, error: claimErr } = await supabase
      .from('payment')
      .update({ status: 'cancelado', notes })
      .eq('id', paymentId)
      .in('status', ['vencido', 'pendente'])
      .select('id');
    if (claimErr || !claimed || claimed.length === 0) {
      return { success: false, error: 'Este lançamento já foi alterado (talvez em outra aba).' };
    }

    let warning: string | undefined;

    // ── Matar a cobrança no Asaas ────────────────────────────────
    // Obrigatório: sem isso o PAYMENT_OVERDUE devolve a linha para 'vencido' e
    // rebloqueia o aluno. E o aluno ainda conseguiria pagar uma cobrança que o
    // professor já excluiu.
    if (pmt.asaas_payment_id && process.env.ASAAS_API_KEY) {
      try {
        await AsaasClient.deletePayment(pmt.asaas_payment_id);
      } catch (e: any) {
        const asaasMsg = `O lançamento foi excluído, mas a cobrança no Asaas não pôde ser cancelada (${e.message}). Cancele-a manualmente para o aluno não pagar por engano.`;
        warning = asaasMsg;
        await supabase.from('notification').insert([{
          idusers_fk: pmt.idusers_fk,
          idstudent_fk: pmt.idstudent_fk,
          recipient: 'teacher',
          type: 'sistema',
          title: 'Cobrança Asaas não cancelada',
          message: asaasMsg,
          read: false,
        }]);
        await emailTeacher(pmt.idusers_fk, {
          title: 'Cobrança Asaas não cancelada',
          message: asaasMsg,
          buttonLabel: 'Ver financeiro',
          buttonPath: '/financeiro',
        });
      }
    }

    // ── Aula que dependia deste pagamento ────────────────────────
    // Sem isto ela fica 'aguardando_pagamento' para sempre, segurando o horário.
    let lessonCancelled = false;
    if (pmt.lesson_fk) {
      const { data: linkedLesson } = await supabase
        .from('lesson')
        .select('lessonstatus')
        .eq('idlesson', pmt.lesson_fk)
        .maybeSingle();

      if (linkedLesson?.lessonstatus === 'aguardando_pagamento') {
        await supabase
          .from('lesson')
          .update({ lessonstatus: 'cancelada', obs: 'Cancelada: cobrança excluída pelo professor' })
          .eq('idlesson', pmt.lesson_fk);
        lessonCancelled = true;
      }
    }

    // ── Avisar o aluno e liberar o bloqueio, se era essa a dívida ──
    const { data: student } = await supabase
      .from('student')
      .select('status, name')
      .eq('idstudent', pmt.idstudent_fk)
      .maybeSingle();

    const valor = `R$ ${Number(pmt.amount).toFixed(2).replace('.', ',')}`;
    const canceladoMsg = `A cobrança de ${valor} com vencimento em ${(pmt.duedate || '').split('-').reverse().join('/')} foi cancelada pelo professor. Você não precisa pagá-la.`;
    await supabase.from('notification').insert([{
      idstudent_fk: pmt.idstudent_fk,
      idusers_fk: pmt.idusers_fk,
      recipient: 'student',
      type: 'cobranca',
      title: 'Cobrança cancelada',
      message: canceladoMsg,
      read: false,
    }]);
    await afterResponse(() => emailStudent(pmt.idstudent_fk, {
      title: 'Cobrança cancelada',
      message: canceladoMsg,
      buttonLabel: 'Ver meus pagamentos',
      buttonPath: '/aluno/financeiro',
    }));

    // notifyStudent: false — o aviso de cancelamento acima já foi enviado.
    await this.unblockIfNoDebt(pmt.idstudent_fk, {
      idusers_fk: pmt.idusers_fk,
      previousStatus: student?.status,
      studentName: student?.name,
      notifyStudent: false,
      db: supabase,
    });

    // A tela do aluno lê pagamentos e aulas por unstable_cache — sem invalidar,
    // ele continuaria vendo a cobrança excluída como se devesse.
    safeUpdateTag('aluno-payments');
    if (lessonCancelled) safeUpdateTag('aluno-lessons');

    return { success: true, warning };
  }

  static async renegotiatePayment(
    overduePaymentId: string,
    newDueDate: string,
    notes: string,
    teacherUserId: string
  ): Promise<{ success: boolean; error?: string; invoiceUrl?: string }> {
    const supabase = await createClient();

    const { data: original, error: fetchErr } = await supabase
      .from('payment')
      .select('*')
      .eq('id', overduePaymentId)
      .eq('idusers_fk', teacherUserId)
      .single();

    if (fetchErr || !original) {
      return { success: false, error: 'Pagamento não encontrado.' };
    }
    if (!['vencido', 'pendente'].includes(original.status)) {
      return { success: false, error: 'Apenas pagamentos pendentes ou vencidos podem ser renegociados.' };
    }

    // ── Claim atômico: marca 'renegociado' só se ainda vencido/pendente. ──
    // Fecha a corrida do duplo clique (duas execuções liam 'vencido' e criavam
    // duas faturas novas + duas cobranças Asaas). Falhas adiante revertem.
    const { data: claimed, error: claimErr } = await supabase
      .from('payment')
      .update({ status: 'renegociado' })
      .eq('id', overduePaymentId)
      .in('status', ['vencido', 'pendente'])
      .select('id');
    if (claimErr || !claimed || claimed.length === 0) {
      return { success: false, error: 'Esta fatura já foi renegociada (talvez em outra aba).' };
    }
    const revertClaim = async () => {
      await supabase.from('payment').update({ status: original.status }).eq('id', overduePaymentId);
    };

    // Preserva as notas originais (ex.: "Compra de Pacote: X" — o dashboard do
    // aluno usa esse texto para identificar o plano da fatura).
    const renegNote = notes || `Renegociação do vencimento ${original.duedate}`;
    const newPaymentData: any = {
      idstudent_fk: original.idstudent_fk,
      idusers_fk: original.idusers_fk,
      amount: original.amount,
      duedate: newDueDate,
      status: 'pendente',
      method: 'pix',
      credits_qty: original.credits_qty || 0,
      credits_validity_days: original.credits_validity_days || 180,
      renegotiated_from: overduePaymentId,
      notes: original.notes ? `${original.notes} | ${renegNote}` : renegNote,
      fine: 0,
      interest: 0,
    };

    if (process.env.ASAAS_API_KEY) {
      const { data: student } = await supabase
        .from('student')
        .select('asaas_customer_id, name, cpf, email, phone')
        .eq('idstudent', original.idstudent_fk)
        .single();

      let customerId = student?.asaas_customer_id;

      if (!customerId && student) {
        try {
          const asaasCust = await AsaasClient.createCustomer({
            name: student.name,
            cpfCnpj: student.cpf || '',
            email: student.email || '',
            phone: student.phone || '',
          });
          customerId = asaasCust.id;
          await supabase.from('student').update({ asaas_customer_id: customerId }).eq('idstudent', original.idstudent_fk);
        } catch (e: any) {
          await revertClaim();
          return { success: false, error: 'Erro ao criar cliente no Asaas: ' + e.message };
        }
      }

      if (customerId) {
        try {
          const asaasPayment = await AsaasClient.createPayment({
            customer: customerId,
            billingType: 'UNDEFINED',
            value: original.amount,
            dueDate: newDueDate,
            description: `Renegociação - PRO MUSIC`,
          });
          newPaymentData.asaas_payment_id = asaasPayment.id;
          newPaymentData.asaas_invoice_url = asaasPayment.invoiceUrl;

          try {
            const qrCode = await AsaasClient.getPixQrCode(asaasPayment.id);
            newPaymentData.asaas_pix_qrcode = qrCode.encodedImage;
            newPaymentData.asaas_pix_payload = qrCode.payload;
          } catch (qrErr) {
            console.log('Sem QR Code imediato para UNDEFINED');
          }
        } catch (err: any) {
          console.error('Asaas renegotiation error:', err.message);
          await revertClaim();
          return { success: false, error: 'Erro Asaas: ' + err.message };
        }
      } else {
        await revertClaim();
        return { success: false, error: 'Não foi possível identificar ou criar o cadastro no Asaas.' };
      }
    }

    const { data: newPayment, error: insertErr } = await supabase
      .from('payment')
      .insert([newPaymentData])
      .select()
      .single();

    if (insertErr || !newPayment) {
      // Desfaz a cobrança recém-criada no Asaas para não deixar link pagável
      // sem fatura local correspondente.
      if (newPaymentData.asaas_payment_id) {
        try { await AsaasClient.deletePayment(newPaymentData.asaas_payment_id); } catch (e: any) {
          console.error('Renegociação: falha ao desfazer cobrança Asaas nova:', e.message);
        }
      }
      await revertClaim();
      return { success: false, error: 'Erro ao criar pagamento renegociado.' };
    }

    // Pix estático da fatura renegociada (sem Asaas configurado).
    await PaymentService.attachStaticPix(supabase, newPayment);

    // ── Cancela a cobrança Asaas ANTIGA. Sem isso o link antigo continuava ──
    // pagável junto com o novo (cobrança dupla) — e, se o aluno pagasse o
    // antigo, o webhook recusava a baixa ("está renegociado") e o dinheiro
    // entrava no Asaas sem efeito nenhum no sistema.
    if (original.asaas_payment_id && process.env.ASAAS_API_KEY) {
      try {
        await AsaasClient.deletePayment(original.asaas_payment_id);
      } catch (e: any) {
        console.error('Renegociação: erro ao cancelar cobrança Asaas antiga:', e.message);
        const avisoMsg = `A renegociação foi criada, mas a cobrança antiga no Asaas não pôde ser cancelada (${e.message}). Cancele-a manualmente para evitar pagamento duplicado.`;
        await supabase.from('notification').insert([{
          idusers_fk: original.idusers_fk,
          idstudent_fk: original.idstudent_fk,
          recipient: 'teacher',
          type: 'sistema',
          title: 'Cobrança Asaas não cancelada',
          message: avisoMsg,
          read: false,
        }]);
        await emailTeacher(original.idusers_fk, {
          title: 'Cobrança Asaas não cancelada',
          message: avisoMsg,
          buttonLabel: 'Ver financeiro',
          buttonPath: '/financeiro',
        });
      }
    }

    // A fatura recém-criada não conta como dívida. `notifyStudent: false`: a
    // mensagem de renegociação vai logo abaixo, seria aviso em dobro.
    await this.unblockIfNoDebt(original.idstudent_fk, {
      idusers_fk: original.idusers_fk,
      excludePaymentId: newPayment.id,
      notifyStudent: false,
      db: supabase,
    });

    const dueDateFormatted = newDueDate.split('-').reverse().join('/');
    const invoiceInfo = newPaymentData.asaas_invoice_url
      ? ` Acesse: ${newPaymentData.asaas_invoice_url}`
      : '';
    const renegMsg = `Seu pagamento foi renegociado. Novo vencimento: ${dueDateFormatted}.${invoiceInfo}`;
    // `idusers_fk` é necessário para o WITH CHECK de `notif_insert` autorizar
    // pelo ramo `idusers_fk = auth.uid()` quando quem renegocia é o PROFESSOR
    // (renegotiatePayment também é chamada do financeiro dele) — sem a coluna
    // o INSERT era recusado em silêncio e o aluno não via a notificação. Na
    // sessão do aluno o insert já passa via `idstudent_fk IN my_student_ids()`.
    await supabase.from('notification').insert([{
      idstudent_fk: original.idstudent_fk,
      idusers_fk: original.idusers_fk,
      recipient: 'student',
      type: 'cobranca',
      title: 'Pagamento renegociado',
      message: renegMsg,
      read: false,
    }]);

    await afterResponse(() => emailStudent(original.idstudent_fk, {
      title: 'Pagamento renegociado',
      message: renegMsg,
      buttonLabel: 'Ver meus pagamentos',
      buttonPath: '/aluno/dashboard',
    }));

    return { success: true, invoiceUrl: newPaymentData.asaas_invoice_url };
  }

  /**
   * RF08/RF09: Gera cobranças automáticas no Asaas e no Banco
   */
  static async generateStudentCharges(studentId: string, idusers_fk: string, db?: any) {
    const supabase = db ?? await createClient();
    const { data: student } = await supabase.from('student').select('*').eq('idstudent', studentId).single();
    
    if (!student || student.packagetype === 'avulsa') return null;

    // Se já existem pagamentos pendentes/futuros, não gera duplicado
    const { data: existing } = await supabase
      .from('payment')
      .select('id')
      .eq('idstudent_fk', studentId)
      .eq('status', 'pendente')
      .limit(1);

    if (existing && existing.length > 0) return null;

    const amount = Number(student.lessonprice) || 0;
    if (amount <= 0) return null;

    // Calcular data de vencimento (vencimento original ou hoje + 5 dias)
    let dueDate = student.expirationdate || getLocalISODate(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));

    let asaasPaymentId = '';
    let asaasInvoiceUrl = '';
    let asaasSubscriptionId = '';

    if (process.env.ASAAS_API_KEY && student.asaas_customer_id) {
      try {
        const cycle = packageTypeToCycle(student.packagetype || 'avulsa');
        
        if (cycle) {
          // Criar assinatura recorrente
          const asaasSub = await AsaasClient.createSubscription({
            customer: student.asaas_customer_id,
            billingType: methodToBillingType(student.paymentmethod || 'pix'),
            value: amount,
            nextDueDate: dueDate,
            cycle: cycle,
            description: `Assinatura - ${student.packagetype} - PRO MUSIC`,
          });
          asaasSubscriptionId = asaasSub.id;
          
          // Salvar o subscription_id no banco de dados do aluno
          await supabase
            .from('student')
            .update({ asaas_subscription_id: asaasSub.id })
            .eq('idstudent', studentId);
            
          // Nota: O webhook vai capturar a primeira fatura gerada por essa assinatura.
          // Mas como segurança, podemos tentar buscar a fatura inicial gerada ou apenas aguardar o webhook.
          // O Asaas não retorna a fatura inicial no response de createSubscription.
          
        } else {
          // Cobrança única (avulsa)
          const asaasPayment = await AsaasClient.createPayment({
            customer: student.asaas_customer_id,
            billingType: methodToBillingType(student.paymentmethod || 'pix'),
            value: amount,
            dueDate: dueDate,
            description: `Cobrança Única - ${student.packagetype} - PRO MUSIC`,
          });
          asaasPaymentId = asaasPayment.id;
          asaasInvoiceUrl = asaasPayment.invoiceUrl;
        }
      } catch (err: any) {
        console.error('Asaas charge failed:', err.message);
      }
    }

    return this.createPayment({
      idstudent_fk: studentId,
      idusers_fk,
      amount,
      duedate: dueDate,
      status: 'pendente',
      method: (student.paymentmethod?.toLowerCase() as any) || 'pix',
      asaas_payment_id: asaasPaymentId || undefined,
      asaas_invoice_url: asaasInvoiceUrl || undefined,
      fine: 0,
      interest: 0,
    } as any);
  }

  /**
   * Gera antecipadamente a mensalidade do próximo período quando a fatura atual
   * é confirmada como paga. Mantém o aluno sempre vendo a próxima fatura.
   *
   * Salvaguardas para não duplicar nem cobrar errado:
   *  - Só roda para pacote recorrente (mensal/trimestral/semestral).
   *  - Pula quem tem assinatura Asaas ativa (o Asaas já emite a próxima fatura).
   *  - Ignora pagamentos que não são mensalidade (compra de créditos ou aula avulsa).
   *  - Não cria se já existir fatura não cancelada para o mesmo vencimento.
   */
  static async generateNextMensalidade(paidPayment: {
    idstudent_fk: string;
    idusers_fk?: string;
    amount?: number;
    duedate?: string;
    method?: string;
    credits_qty?: number | null;
    lesson_fk?: string | null;
  }, db?: any): Promise<Payment | null> {
    // Não é mensalidade: compra de créditos ou cobrança de aula avulsa.
    if ((Number(paidPayment.credits_qty) || 0) > 0 || paidPayment.lesson_fk) return null;

    const supabase = db ?? await createClient();
    const { data: student } = await supabase
      .from('student')
      .select('idstudent, idusers_fk, packagetype, lessonprice, paymentmethod, asaas_subscription_id')
      .eq('idstudent', paidPayment.idstudent_fk)
      .single();
    if (!student) return null;

    const pkg = (student.packagetype || 'avulsa').toLowerCase();
    const monthsToAdd = pkg === 'mensal' ? 1 : pkg === 'trimestral' ? 3 : pkg === 'semestral' ? 6 : 0;
    if (monthsToAdd === 0) return null; // avulsa ou sem pacote recorrente

    // Assinatura Asaas ativa → o próprio Asaas emite a próxima fatura. Evita duplicar.
    if (student.asaas_subscription_id) return null;

    const amount = Number(student.lessonprice) || Number(paidPayment.amount) || 0;
    if (amount <= 0) return null;

    // Próximo vencimento: avança o período mantendo o mesmo dia do vencimento atual.
    const baseDue = paidPayment.duedate || getLocalISODate(new Date());
    const duedate = addMonthsKeepDay(baseDue, monthsToAdd);
    const [ry, rm] = duedate.split('-').map(Number);
    const monthLabel = new Date(ry, rm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    // Dedup por MÊS do vencimento (não pela data exata): "faturas em grade"
    // vencem no último dia do mês e a auto-geração mantém o dia anterior —
    // comparar a data exata deixava passar duas mensalidades do mesmo mês.
    const monthPrefix = duedate.slice(0, 7); // "YYYY-MM"
    const { data: existing } = await supabase
      .from('payment')
      .select('id')
      .eq('idstudent_fk', student.idstudent)
      .gte('duedate', `${monthPrefix}-01`)
      .lte('duedate', `${monthPrefix}-31`)
      .neq('status', 'cancelado')
      .limit(1);
    if (existing && existing.length > 0) return null;

    const idusers_fk = paidPayment.idusers_fk || student.idusers_fk;
    const method = (paidPayment.method || student.paymentmethod || 'pix') as any;

    const created = await this.createPayment({
      idstudent_fk: student.idstudent,
      idusers_fk,
      amount,
      duedate,
      status: 'pendente',
      method,
      notes: `Mensalidade ${monthLabel} — gerada automaticamente`,
      fine: 0,
      interest: 0,
    } as any, db);

    if (created) {
      const faturaMsg = `Sua mensalidade de ${monthLabel} (R$ ${amount.toFixed(2).replace('.', ',')}) já está disponível para pagamento. Vencimento: ${duedate.split('-').reverse().join('/')}.`;

      await supabase.from('notification').insert([{
        idstudent_fk: student.idstudent,
        idusers_fk,
        recipient: 'student',
        type: 'cobranca',
        title: 'Nova fatura disponível',
        message: faturaMsg,
        read: false,
      }]);

      await afterResponse(() => emailStudent(student.idstudent, {
        title: 'Nova fatura disponível',
        message: faturaMsg,
        buttonLabel: 'Ver faturas',
        buttonPath: '/aluno/financeiro',
      }));
    }

    return created;
  }

  /**
   * Permite ao próprio aluno ANTECIPAR a mensalidade do próximo período.
   *
   * Diferente de generateNextMensalidade (disparada na confirmação de um pagamento),
   * esta é acionada sob demanda pelo aluno que quer pagar adiantado — por isso já
   * cria a cobrança no Asaas e devolve o link na hora.
   *
   * Mesmas salvaguardas: só plano recorrente, pula assinatura Asaas ativa, não cria
   * se já houver fatura em aberto ou fatura para o mesmo vencimento.
   */
  static async generateAdvanceMensalidade(idstudent_fk: string): Promise<{
    success: boolean;
    error?: string;
    invoiceUrl?: string;
    duedate?: string;
    amount?: number;
  }> {
    const supabase = await createClient();
    const { data: student } = await supabase
      .from('student')
      .select('idstudent, idusers_fk, name, cpf, email, phone, packagetype, lessonprice, paymentmethod, asaas_customer_id, asaas_subscription_id, expirationdate')
      .eq('idstudent', idstudent_fk)
      .single();
    if (!student) return { success: false, error: 'Aluno não encontrado.' };

    const pkg = (student.packagetype || 'avulsa').toLowerCase();
    const monthsToAdd = pkg === 'mensal' ? 1 : pkg === 'trimestral' ? 3 : pkg === 'semestral' ? 6 : 0;
    if (monthsToAdd === 0) return { success: false, error: 'Seu plano não possui mensalidade recorrente.' };

    // Assinatura Asaas ativa → o próprio Asaas emite a próxima fatura. Evita duplicar.
    if (student.asaas_subscription_id) {
      return { success: false, error: 'Sua próxima fatura é emitida automaticamente pela assinatura. Aguarde a emissão.' };
    }

    const amount = Number(student.lessonprice) || 0;
    if (amount <= 0) return { success: false, error: 'Valor de mensalidade não definido. Fale com seu professor.' };

    // Se já existe fatura em aberto (pendente/vencida), o aluno deve pagá-la primeiro.
    const { data: openInvoices } = await supabase
      .from('payment')
      .select('id')
      .eq('idstudent_fk', idstudent_fk)
      .in('status', ['pendente', 'vencido'])
      .limit(1);
    if (openInvoices && openInvoices.length > 0) {
      return { success: false, error: 'Você já possui uma fatura em aberto. Pague-a antes de antecipar a próxima.' };
    }

    // Base: vencimento da fatura mais recente não cancelada (ou hoje).
    const { data: lastPayment } = await supabase
      .from('payment')
      .select('duedate')
      .eq('idstudent_fk', idstudent_fk)
      .neq('status', 'cancelado')
      .order('duedate', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Sem histórico, a primeira mensalidade vence na data do plano (expirationdate
    // da ficha do aluno); com histórico, avança um período mantendo o dia.
    const duedate = projectNextMensalidadeDue(lastPayment?.duedate, student.expirationdate, monthsToAdd);
    const [ry, rm] = duedate.split('-').map(Number);
    const monthLabel = new Date(ry, rm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    // Dedup por MÊS do vencimento (mesma regra de generateNextMensalidade).
    const monthPrefix = duedate.slice(0, 7);
    const { data: existing } = await supabase
      .from('payment')
      .select('id')
      .eq('idstudent_fk', idstudent_fk)
      .gte('duedate', `${monthPrefix}-01`)
      .lte('duedate', `${monthPrefix}-31`)
      .neq('status', 'cancelado')
      .limit(1);
    if (existing && existing.length > 0) return { success: false, error: 'A próxima fatura já foi gerada.' };

    const paymentData: any = {
      idstudent_fk: student.idstudent,
      idusers_fk: student.idusers_fk,
      amount,
      duedate,
      status: 'pendente',
      method: (student.paymentmethod?.toLowerCase() as any) || 'pix',
      notes: `Mensalidade ${monthLabel} — antecipada pelo aluno`,
      fine: 0,
      interest: 0,
    };

    // Gera a cobrança no Asaas (se configurado), criando o cliente se necessário.
    if (process.env.ASAAS_API_KEY) {
      let customerId = student.asaas_customer_id;
      if (!customerId) {
        if (!student.cpf) {
          return { success: false, error: 'CPF não cadastrado. Atualize seu perfil antes de gerar a fatura.' };
        }
        try {
          const cust = await AsaasClient.createCustomer({
            name: student.name,
            cpfCnpj: student.cpf,
            email: student.email || undefined,
            phone: student.phone || undefined,
          });
          customerId = cust.id;
          await supabase.from('student').update({ asaas_customer_id: customerId }).eq('idstudent', student.idstudent);
        } catch (e: any) {
          return { success: false, error: 'Erro ao criar cadastro no Asaas: ' + e.message };
        }
      }

      try {
        const asaasPayment = await AsaasClient.createPayment({
          customer: customerId,
          billingType: 'UNDEFINED',
          value: amount,
          dueDate: duedate,
          description: `Mensalidade ${monthLabel} - PRO MUSIC`,
        });
        paymentData.asaas_payment_id = asaasPayment.id;
        paymentData.asaas_invoice_url = asaasPayment.invoiceUrl;
        try {
          const qr = await AsaasClient.getPixQrCode(asaasPayment.id);
          paymentData.asaas_pix_qrcode = qr.encodedImage;
          paymentData.asaas_pix_payload = qr.payload;
        } catch {
          // QR Code pode não estar disponível imediatamente para UNDEFINED.
        }
      } catch (e: any) {
        return { success: false, error: 'Erro ao gerar cobrança no Asaas: ' + e.message };
      }
    }

    const created = await this.createPayment(paymentData);
    if (!created) return { success: false, error: 'Erro ao criar a fatura.' };

    const antecipMsg = `${student.name} antecipou a mensalidade de ${monthLabel} (R$ ${amount.toFixed(2).replace('.', ',')}). Vencimento: ${duedate.split('-').reverse().join('/')}.`;

    // `idstudent_fk` é obrigatório: aqui o client é a sessão do ALUNO, e o
    // WITH CHECK de `notif_insert` só autoriza pelo ramo
    // `idstudent_fk IN (my_student_ids())`. Sem ele o INSERT era recusado
    // silenciosamente e o professor nunca via a antecipação.
    const { error: notifErr } = await supabase.from('notification').insert([{
      idusers_fk: student.idusers_fk,
      idstudent_fk: student.idstudent,
      recipient: 'teacher',
      type: 'cobranca',
      title: 'Mensalidade antecipada',
      message: antecipMsg,
      read: false,
    }]);
    if (notifErr) console.error('Erro ao notificar professor da antecipação:', notifErr.message);

    await afterResponse(() => emailTeacher(student.idusers_fk, {
      title: 'Mensalidade antecipada',
      message: antecipMsg,
      buttonLabel: 'Ver financeiro',
      buttonPath: '/financeiro',
    }));

    return { success: true, invoiceUrl: paymentData.asaas_invoice_url || '', duedate, amount };
  }
}
