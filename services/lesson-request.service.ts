import { createClient } from '@/lib/supabase/server';
import { LessonRequest } from '@/types/database.types';

export class LessonRequestService {
  static async getRequestsByTeacher(idusers_fk: string): Promise<LessonRequest[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson_request')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching lesson requests:', error.message);
      return [];
    }
    return data || [];
  }

  static async getRequestsByStudent(idstudent_fk: string): Promise<LessonRequest[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson_request')
      .select('*')
      .eq('idstudent_fk', idstudent_fk)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching student requests:', error.message);
      return [];
    }
    return data || [];
  }

  static async getPendingRequests(idusers_fk: string): Promise<LessonRequest[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson_request')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending requests:', error.message);
      return [];
    }
    return data || [];
  }

  /**
   * Indica se já existe uma solicitação ativa (pendente ou aprovada) vinculada
   * a uma aula de origem. Usado para impedir múltiplas remarcações/reposições
   * sobre a mesma aula.
   *
   * Ignora o tipo 'cancelamento': é ele que gera a aula cancelada + o crédito de
   * reposição, então a própria solicitação de cancelamento não deve bloquear a
   * reposição dessa aula (mesma regra do blockedOriginIds na área do aluno).
   */
  static async hasActiveRequestForLesson(originLessonFk: string): Promise<boolean> {
    const supabase = await createClient();
    const { data } = await supabase
      .from('lesson_request')
      .select('id')
      .eq('original_lesson_fk', originLessonFk)
      .in('status', ['pendente', 'aprovada'])
      .neq('type', 'cancelamento')
      .limit(1);
    return (data?.length || 0) > 0;
  }

  // Desvincula solicitações históricas da aula original antes de apagá-la —
  // lesson_request.original_lesson_fk é só informativo depois que a
  // solicitação já foi processada, mas o FK sem ON DELETE bloqueia o delete
  // da lesson se não for limpo antes (erro 23503).
  /** Mesma coisa em lote, para a exclusão de uma série de aulas. */
  static async clearOriginalLessonRefs(originLessonFks: string[]): Promise<void> {
    if (!originLessonFks.length) return;
    const supabase = await createClient();
    const { error } = await supabase
      .from('lesson_request')
      .update({ original_lesson_fk: null })
      .in('original_lesson_fk', originLessonFks);
    if (error) console.error('Error clearing original_lesson_fk in batch:', error.message);
  }

  static async clearOriginalLessonRef(originLessonFk: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('lesson_request')
      .update({ original_lesson_fk: null })
      .eq('original_lesson_fk', originLessonFk);
    if (error) console.error('Error clearing original_lesson_fk:', error.message);
  }

  static async createRequest(requestData: Omit<LessonRequest, 'id' | 'created_at'>): Promise<LessonRequest | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson_request')
      .insert([requestData])
      .select()
      .single();

    if (error) {
      console.error('Error creating lesson request:', error.message);
      return null;
    }
    return data;
  }

  static async updateRequestStatus(id: string, status: 'aprovada' | 'recusada'): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('lesson_request')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error updating request status:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Reivindica atomicamente uma solicitação PENDENTE, já gravando o status
   * final. Retorna false se outra execução chegou antes — trava contra
   * duplo-clique/duas abas, que antes gerava aula e cobrança duplicadas.
   */
  static async claimRequest(id: string, status: 'aprovada' | 'recusada'): Promise<boolean> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('lesson_request')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pendente')
      .select('id');

    if (error) {
      console.error('Error claiming request:', error.message);
      return false;
    }
    return (data?.length || 0) > 0;
  }

  /** Devolve a solicitação a 'pendente' quando o processamento falhou após o claim. */
  static async releaseRequest(id: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('lesson_request')
      .update({ status: 'pendente', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.error('Error releasing request:', error.message);
  }
}
