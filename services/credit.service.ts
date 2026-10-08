import { createClient } from '@/lib/supabase/server';
import { Credit } from '@/types/database.types';
import { getLocalISODate } from '@/lib/utils';

export class CreditService {
  /**
   * Créditos ativos do aluno. `kind` separa os dois tipos:
   * - 'normal': comprado em pacote (origin_lesson_fk nulo) — abate aulas novas;
   * - 'reposicao': gerado por cancelamento (origin_lesson_fk preenchido) — só
   *   vale para repor a aula cancelada.
   * Sem `kind`, retorna todos (comportamento antigo).
   */
  static async getActiveCredits(idstudent_fk: string, kind?: 'normal' | 'reposicao'): Promise<Credit[]> {
    const supabase = await createClient();
    const today = getLocalISODate();
    let query = supabase
      .from('credit')
      .select('*')
      .eq('idstudent_fk', idstudent_fk)
      .eq('used', false)
      .gte('expires_at', today)
      .order('expires_at', { ascending: true });

    if (kind === 'normal') query = query.is('origin_lesson_fk', null);
    if (kind === 'reposicao') query = query.not('origin_lesson_fk', 'is', null);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching credits:', error.message);
      return [];
    }
    return data || [];
  }

  static async getAllCredits(idstudent_fk: string): Promise<Credit[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('credit')
      .select('*')
      .eq('idstudent_fk', idstudent_fk)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all credits:', error.message);
      return [];
    }
    return data || [];
  }

  static async createCredit(creditData: Omit<Credit, 'id' | 'created_at' | 'used' | 'used_at'>): Promise<Credit | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('credit')
      .insert([{ ...creditData, used: false }])
      .select()
      .single();

    if (error) {
      console.error('Error creating credit:', error.message);
      return null;
    }
    return data;
  }

  /**
   * Consome o crédito atomicamente: o `.eq('used', false)` garante que duas
   * execuções concorrentes não gastem o mesmo crédito — a segunda recebe
   * false e o chamador desfaz o que criou.
   */
  static async useCredit(id: string): Promise<boolean> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('credit')
      .update({ used: true, used_at: new Date().toISOString() })
      .eq('id', id)
      .eq('used', false)
      .select('id');

    if (error) {
      console.error('Error using credit:', error.message);
      return false;
    }
    return (data?.length || 0) > 0;
  }

  // RN03: o crédito de reposição é concedido apenas no primeiro cancelamento do
  // aluno (vitalício). Considera qualquer crédito com origin_lesson_fk (usado,
  // expirado ou ativo); créditos de pacote comprado têm origem nula e não contam,
  // e créditos revogados por engano são apagados, então também não contam.
  static async hasEverReceivedCancellationCredit(idstudent_fk: string): Promise<boolean> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('credit')
      .select('id')
      .eq('idstudent_fk', idstudent_fk)
      .not('origin_lesson_fk', 'is', null)
      .limit(1);

    if (error) {
      console.error('Error checking cancellation credit history:', error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  }

  /**
   * Já existe crédito originado desta aula? Conta usado e não usado — é a trava
   * de idempotência de releaseLessonForStudentReschedule: dois cliques (ou duas
   * abas) sobre a mesma aula não podem virar dois créditos de reposição.
   */
  static async hasCreditFromLesson(origin_lesson_fk: string): Promise<boolean> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('credit')
      .select('id')
      .eq('origin_lesson_fk', origin_lesson_fk)
      .limit(1);

    if (error) {
      console.error('Error checking credit by origin lesson:', error.message);
      // Em erro, dizemos que JÁ existe: deixar de conceder é reparável pelo
      // professor; conceder em duplicidade dá aula grátis a mais.
      return true;
    }
    return (data?.length ?? 0) > 0;
  }

  // Apaga (não marca como usado) o crédito não usado gerado por uma aula que
  // deixou de estar cancelada ou foi excluída. Apagar é essencial: um
  // cancelamento revertido por engano não pode consumir o benefício único.
  /**
   * Versão em lote de revokeUnusedCreditByOriginLesson, para a exclusão de uma
   * série inteira de aulas: uma query em vez de uma por aula. Crédito já usado
   * continua intocado — ele virou aula em outra data.
   */
  static async revokeUnusedCreditsByOriginLessons(origin_lesson_fks: string[]): Promise<void> {
    if (!origin_lesson_fks.length) return;
    const supabase = await createClient();
    const { error } = await supabase
      .from('credit')
      .delete()
      .in('origin_lesson_fk', origin_lesson_fks)
      .eq('used', false);

    if (error) {
      console.error('Error revoking credits in batch:', error.message);
    }
  }

  static async revokeUnusedCreditByOriginLesson(origin_lesson_fk: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('credit')
      .delete()
      .eq('origin_lesson_fk', origin_lesson_fk)
      .eq('used', false);

    if (error) {
      console.error('Error revoking credit:', error.message);
    }
  }
}
