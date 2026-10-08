import { createClient } from '@/lib/supabase/server';
import { CreditPackage } from '@/types/database.types';

const DEFAULT_PACKAGES: Omit<CreditPackage, 'id' | 'idusers_fk' | 'created_at' | 'updated_at' | 'active'>[] = [
  { name: 'Aula Avulsa', credits: 1, price: 100, validity_days: 60, popular: false, sort_order: 1 },
  { name: 'Pacote Mensal', credits: 4, price: 350, validity_days: 60, popular: true, sort_order: 2 },
  { name: 'Pacote Trimestral', credits: 12, price: 950, validity_days: 180, popular: false, sort_order: 3 },
];

export class CreditPackageService {
  static async getActiveByTeacher(idusers_fk: string): Promise<CreditPackage[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('credit_package')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .eq('active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching credit packages:', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      return await this.seedDefaultsForTeacher(idusers_fk);
    }
    return data;
  }

  static async getAllByTeacher(idusers_fk: string): Promise<CreditPackage[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('credit_package')
      .select('*')
      .eq('idusers_fk', idusers_fk)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching all credit packages:', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      return await this.seedDefaultsForTeacher(idusers_fk);
    }
    return data;
  }

  static async getById(id: string): Promise<CreditPackage | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('credit_package')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      console.error('Error fetching credit package:', error.message);
      return null;
    }
    return data;
  }

  static async seedDefaultsForTeacher(idusers_fk: string): Promise<CreditPackage[]> {
    const supabase = await createClient();
    const rows = DEFAULT_PACKAGES.map(p => ({ ...p, idusers_fk, active: true }));
    const { data, error } = await supabase
      .from('credit_package')
      .insert(rows)
      .select();
    if (error) {
      console.error('Error seeding default credit packages:', error.message);
      return [];
    }
    return data || [];
  }

  static async create(
    input: Omit<CreditPackage, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<CreditPackage | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('credit_package')
      .insert([input])
      .select()
      .single();
    if (error) {
      console.error('Error creating credit package:', error.message);
      return null;
    }
    return data;
  }

  static async update(
    id: string,
    patch: Partial<Omit<CreditPackage, 'id' | 'idusers_fk' | 'created_at'>>,
  ): Promise<CreditPackage | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('credit_package')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Error updating credit package:', error.message);
      return null;
    }
    return data;
  }

  static async delete(id: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
      .from('credit_package')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Error deleting credit package:', error.message);
      return false;
    }
    return true;
  }
}
