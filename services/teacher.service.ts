import { cache } from 'react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { Teacher } from '@/types/database.types';

// A carga inicial do professor lê a MESMA linha de `teacher` duas vezes por
// request (perfil da sessão e instrumentos da agenda), cada uma com seu client e
// seu round-trip. React.cache deduplica dentro do request. Só leitura: ninguém
// que chame getTeacherByUser grava e relê a linha no mesmo request.
const fetchTeacherByUser = cache(async (idusers_fk: string): Promise<Teacher | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('teacher').select('*').eq('idusers_fk', idusers_fk).single();
  if (error) { console.error('Error fetching teacher by user ID:', error.message); return null; }
  return data as Teacher;
});

export class TeacherService {
  static async getTeacherById(idteacher: string): Promise<Teacher | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('teacher').select('*, users(*)').eq('idteacher', idteacher).single();
    if (error) { console.error('Error fetching teacher:', error.message); return null; }
    return data as Teacher;
  }

  static getTeacherByUser(idusers_fk: string): Promise<Teacher | null> {
    return fetchTeacherByUser(idusers_fk);
  }

  static async createTeacher(teacherData: Omit<Teacher, 'idteacher'>): Promise<{ teacher: Teacher | null, error: string | null }> {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('teacher')
      .insert([{
        cpf: teacherData.cpf,
        info: teacherData.info,
        idusers_fk: teacherData.idusers_fk,
        avatar_url: teacherData.avatar_url
      }])
      .select()
      .single();

    if (error) { 
      console.error('Error creating teacher:', error.message); 
      return { teacher: null, error: error.message }; 
    }
    return { teacher: data as Teacher, error: null };
  }

  static async getAllTeachers(): Promise<{
    idusers_fk: string,
    name: string,
    avatar_url?: string,
    avg_price?: number,
    instruments: string[],
    pricings: { instrument: string; price: number; is_primary: boolean }[],
  }[]> {
    // Listagem pública do marketplace: usa o admin client (service_role) porque
    // o RLS do cliente user-scoped filtra as linhas de `teacher`/`teacher_pricing`
    // de OUTROS professores para vazio quando quem consulta é um aluno — o embed
    // voltava sem avatar_url nem preço (a foto/preço sumiam do card). Aqui só
    // retornamos colunas públicas (nome, foto, preço médio, instrumentos).
    const supabase = createAdminClient();
    // Only return approved teachers with their profile data and pricing
    const { data, error } = await supabase
      .from('users')
      .select(`
        idusers, 
        fname,
        teacher (
          avatar_url,
          teacher_pricing (
            instrument,
            price,
            is_primary
          )
        )
      `)
      .eq('usertype', 'professor')
      .eq('accountstatus', 'approved');

    if (error) {
      console.error('Error fetching all teachers:', error.message);
      return [];
    }

    return (data || []).map(u => {
      const teacher = (u as any).teacher?.[0];
      const raw = teacher?.teacher_pricing || [];
      const pricings = raw.map((p: any) => ({
        instrument: p.instrument,
        price: Number(p.price),
        is_primary: !!p.is_primary,
      }));
      const avgPrice = pricings.length > 0
        ? pricings.reduce((sum: number, p: any) => sum + p.price, 0) / pricings.length
        : 0;

      return {
        idusers_fk: u.idusers,
        name: u.fname,
        avatar_url: teacher?.avatar_url,
        avg_price: avgPrice,
        instruments: pricings.map((p: any) => p.instrument),
        pricings,
      };
    });
  }

  /** Instrumentos que o professor ensina (com preço), usado no gerenciador de Configurações. */
  static async getPricingByTeacher(idteacher: string): Promise<{ id: string; instrument: string; price: number; is_primary: boolean }[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('teacher_pricing')
      .select('id, instrument, price, is_primary')
      .eq('idteacher_fk', idteacher)
      .order('is_primary', { ascending: false })
      .order('instrument');
    if (error) { console.error('Error fetching teacher pricing:', error.message); return []; }
    return (data || []).map((p: any) => ({ id: p.id, instrument: p.instrument, price: Number(p.price), is_primary: !!p.is_primary }));
  }

  /**
   * Define qual instrumento é o principal do professor. Como há um índice único
   * parcial (um principal por professor), zeramos os demais ANTES de marcar o novo.
   */
  static async setPrimaryInstrument(idteacher: string, instrument: string): Promise<boolean> {
    const supabase = await createClient();
    const { error: clearErr } = await supabase
      .from('teacher_pricing')
      .update({ is_primary: false })
      .eq('idteacher_fk', idteacher)
      .eq('is_primary', true);
    if (clearErr) { console.error('Error clearing primary instrument:', clearErr.message); return false; }

    const { error } = await supabase
      .from('teacher_pricing')
      .update({ is_primary: true })
      .eq('idteacher_fk', idteacher)
      .eq('instrument', instrument);
    if (error) { console.error('Error setting primary instrument:', error.message); return false; }
    return true;
  }

  /** Remove um instrumento da lista do professor. */
  static async deletePricing(idteacher: string, instrument: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('teacher_pricing')
      .delete()
      .eq('idteacher_fk', idteacher)
      .eq('instrument', instrument);
    if (error) { console.error('Error deleting teacher pricing:', error.message); return false; }
    return true;
  }

  static async updateTeacherPricing(idteacher: string, instrument: string, price: number): Promise<boolean> {
    const supabase = await createClient();
    
    const { data: existing } = await supabase
      .from('teacher_pricing')
      .select('id')
      .eq('idteacher_fk', idteacher)
      .eq('instrument', instrument)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('teacher_pricing')
        .update({ price })
        .eq('id', existing.id);
      return !error;
    } else {
      const { error } = await supabase
        .from('teacher_pricing')
        .insert([{ idteacher_fk: idteacher, instrument, price }]);
      return !error;
    }
  }
}
