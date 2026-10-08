import { createClient } from '@/lib/supabase/server';
import { Admin } from '@/types/database.types';

export class AdminService {
  static async getAdminById(idadmin: string): Promise<Admin | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('admin').select('*, users(*)').eq('idadmin', idadmin).single();
    if (error) { console.error('Error fetching admin:', error.message); return null; }
    return data as Admin;
  }

  static async getAdminByUser(idusers_fk: string): Promise<Admin | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('admin').select('*, users(*)').eq('idusers_fk', idusers_fk).single();
    if (error) { console.error('Error fetching admin by user:', error.message); return null; }
    return data as Admin;
  }

  static async createAdmin(adminData: Omit<Admin, 'idadmin'>): Promise<Admin | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('admin').insert([adminData]).select().single();
    if (error) { console.error('Error creating admin:', error.message); return null; }
    return data as Admin;
  }
}
