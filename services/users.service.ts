import { createClient } from '@/lib/supabase/server';
import { User } from '@/types/database.types';

export class UserService {
  static async getUserById(idusers: string): Promise<User | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('users').select('*').eq('idusers', idusers).single();
    if (error) { console.error('Error fetching user:', error.message); return null; }
    return data as User;
  }

  static async getUserByEmail(email: string): Promise<User | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error) { console.error('Error fetching user by email:', error.message); return null; }
    return data as User;
  }

  static async createUser(userData: Omit<User, 'idusers'>): Promise<{ user: User | null, error: string | null }> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('users').insert([userData]).select().single();
    if (error) { 
      console.error('Error creating user:', error.message); 
      return { user: null, error: error.message }; 
    }
    return { user: data as User, error: null };
  }

  static async updateUser(idusers: string, updates: Partial<User>): Promise<User | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('users').update(updates).eq('idusers', idusers).select().single();
    if (error) { console.error('Error updating user:', error.message); return null; }
    return data as User;
  }

  static async deleteUser(idusers: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase.from('users').delete().eq('idusers', idusers);
    if (error) { console.error('Error deleting user:', error.message); return false; }
    return true;
  }
}
