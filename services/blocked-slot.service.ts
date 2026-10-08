import { createClient } from '@/lib/supabase/server';

export interface DayOff {
  id: string;
  idusers_fk: string;
  day_of_week: number;
  reason?: string;
}

export class DayOffService {
  static async getByUser(idusers_fk: string): Promise<DayOff[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from('teacher_day_off')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .order('day_of_week', { ascending: true });
    return (data as DayOff[]) ?? [];
  }

  static async upsert(idusers_fk: string, day_of_week: number, reason?: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('teacher_day_off')
      .upsert([{ idusers_fk, day_of_week, reason }], { onConflict: 'idusers_fk,day_of_week' });
    if (error) console.error('DayOffService.upsert error:', error.message);
    return !error;
  }

  static async remove(idusers_fk: string, day_of_week: number): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('teacher_day_off')
      .delete()
      .eq('idusers_fk', idusers_fk)
      .eq('day_of_week', day_of_week);
    return !error;
  }
}

export interface BlockedSlot {
  id: string;
  idusers_fk: string;
  date: string;
  starttime: string;
  endtime: string;
  reason?: string;
  created_at: string;
}

export class BlockedSlotService {
  static async getByUserAndDate(idusers_fk: string, date: string): Promise<BlockedSlot[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from('blocked_slot')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .eq('date', date)
      .order('starttime', { ascending: true });
    return (data as BlockedSlot[]) ?? [];
  }

  static async getByUserAndDates(idusers_fk: string, dates: string[]): Promise<BlockedSlot[]> {
    if (!dates.length) return [];
    const supabase = await createClient();
    const { data } = await supabase
      .from('blocked_slot')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .in('date', dates)
      .order('date', { ascending: true })
      .order('starttime', { ascending: true });
    return (data as BlockedSlot[]) ?? [];
  }

  static async create(data: { idusers_fk: string; date: string; starttime: string; endtime: string; reason?: string }): Promise<BlockedSlot | null> {
    const supabase = await createClient();
    const { data: result, error } = await supabase
      .from('blocked_slot')
      .insert([data])
      .select()
      .single();
    if (error) { console.error('Error creating blocked slot:', error.message); return null; }
    return result as BlockedSlot;
  }

  // Insere vários bloqueios numa única query — evita N round-trips ao repetir
  // um bloqueio por várias semanas (ex.: 24 semanas = 24 inserts sequenciais).
  static async createMany(
    rows: { idusers_fk: string; date: string; starttime: string; endtime: string; reason?: string }[]
  ): Promise<BlockedSlot[]> {
    if (!rows.length) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('blocked_slot')
      .insert(rows)
      .select();
    if (error) { console.error('Error creating blocked slots:', error.message); return []; }
    return (data as BlockedSlot[]) ?? [];
  }

  static async delete(id: string, idusers_fk: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('blocked_slot')
      .delete()
      .eq('id', id)
      .eq('idusers_fk', idusers_fk);
    if (error) { console.error('Error deleting blocked slot:', error.message); return false; }
    return true;
  }

  // Apaga toda uma série de bloqueios recorrentes (mesmo horário, mesmo motivo,
  // repetido semanalmente) de uma vez — espelha createMany do lado da exclusão.
  // Filtra o `reason` em memória (não em query) porque coluna aceita null/''
  // e precisamos tratar as duas formas como equivalentes.
  static async deleteSeries(
    idusers_fk: string,
    dates: string[],
    starttime: string,
    endtime: string,
    reason?: string
  ): Promise<string[]> {
    if (!dates.length) return [];
    const supabase = await createClient();
    const { data: candidates, error: selErr } = await supabase
      .from('blocked_slot')
      .select('id, reason')
      .eq('idusers_fk', idusers_fk)
      .in('date', dates)
      .eq('starttime', starttime)
      .eq('endtime', endtime);
    if (selErr) { console.error('Error finding blocked slot series:', selErr.message); return []; }

    const targetReason = reason || '';
    const ids = (candidates ?? [])
      .filter(c => (c.reason || '') === targetReason)
      .map(c => c.id);
    if (!ids.length) return [];

    const { error: delErr } = await supabase.from('blocked_slot').delete().in('id', ids);
    if (delErr) { console.error('Error deleting blocked slot series:', delErr.message); return []; }
    return ids;
  }
}
