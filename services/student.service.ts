import { createClient } from '@/lib/supabase/server';
import { Student } from '@/types/database.types';

export class StudentService {
  static async getStudentsByUser(idusers_fk: string): Promise<Student[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('student')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .order('name');
      
    if (error) {
      console.error('Error fetching students by user:', error.message);
      return [];
    }
    return data || [];
  }

  static async getStudentById(idstudent: string): Promise<Student | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('student')
      .select('*')
      .eq('idstudent', idstudent)
      .single();
      
    if (error) {
      console.error('Error fetching student by id:', error.message);
      return null;
    }
    return data;
  }

  static async getStudentCountByUser(idusers_fk: string): Promise<number> {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('student')
      .select('idstudent', { count: 'exact', head: true })
      .eq('idusers_fk', idusers_fk);
    if (error) { console.error('Error counting students:', error.message); return 0; }
    return count ?? 0;
  }

  static async getStudentByName(name: string, idusers_fk: string): Promise<Student | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('student')
      .select('idstudent, name, lessonprice, paymentmethod, instrument, asaas_customer_id, status, expirationdate, packagetype')
      .eq('idusers_fk', idusers_fk)
      .ilike('name', name)
      .maybeSingle();
    if (error) { console.error('Error fetching student by name:', error.message); return null; }
    return data as Student | null;
  }

  // Como getStudentByName, mas devolve todas as correspondências (limit 2 basta
  // para detectar homônimos) em vez de maybeSingle — que vira erro com >1 linha
  // e silenciava a notificação de cancelamento.
  static async findStudentsByName(name: string, idusers_fk: string): Promise<Student[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('student')
      .select('idstudent, name, lessonprice, paymentmethod, instrument, asaas_customer_id, status')
      .eq('idusers_fk', idusers_fk)
      .ilike('name', name.trim())
      .limit(2);
    if (error) { console.error('Error finding students by name:', error.message); return []; }
    return (data as Student[]) || [];
  }

  static async createStudent(
    studentData: Omit<Student, 'idstudent'>
  ): Promise<{ data: Student | null; error: string | null }> {
    const supabase = await createClient();
    // Remover undefined fields
    const payload = Object.fromEntries(Object.entries(studentData).filter(([_, v]) => v !== undefined));

    const { data, error } = await supabase
      .from('student')
      .insert([payload as any])
      .select()
      .single();

    if (error) {
      console.error('Error creating student:', error.message, error.details, error.hint);
      return { data: null, error: error.message };
    }
    return { data, error: null };
  }

  static async updateStudent(idstudent: string, updates: Partial<Omit<Student, 'idstudent'>>): Promise<Student | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('student')
      .update(updates)
      .eq('idstudent', idstudent)
      .select()
      .single();
      
    if (error) {
      console.error('Error updating student:', error.message);
      return null;
    }
    return data;
  }

  static async deleteStudent(idstudent: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('student')
      .delete()
      .eq('idstudent', idstudent);
      
    if (error) {
      console.error('Error deleting student:', error.message);
      return false;
    }
    return true;
  }
}
