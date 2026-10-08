import { createClient } from '@/lib/supabase/server';
import { Instrument, InstrumentCatalog } from '@/types/database.types';

export class InstrumentService {
  static async getInstruments(): Promise<Instrument[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('instrument').select('*');
    if (error) { console.error('Error fetching instruments:', error.message); return []; }
    return data as Instrument[];
  }

  static async getInstrumentById(idinstrument: string): Promise<Instrument | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('instrument').select('*').eq('idinstrument', idinstrument).single();
    if (error) { console.error('Error fetching instrument:', error.message); return null; }
    return data as Instrument;
  }

  static async createInstrument(instrumentData: Omit<Instrument, 'idinstrument'>): Promise<Instrument | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('instrument').insert([instrumentData]).select().single();
    if (error) { console.error('Error creating instrument:', error.message); return null; }
    return data as Instrument;
  }

  static async getInstrumentCatalog(): Promise<InstrumentCatalog[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('instrument_catalog').select('*').order('name');
    if (error) { console.error('Error fetching instrument catalog:', error.message); return []; }
    return data as InstrumentCatalog[];
  }

  static async addInstrumentToCatalog(name: string): Promise<InstrumentCatalog | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from('instrument_catalog').insert([{ name }]).select().single();
    if (error) { console.error('Error adding instrument to catalog:', error.message); return null; }
    return data as InstrumentCatalog;
  }

  static async deleteInstrumentFromCatalog(id: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase.from('instrument_catalog').delete().eq('id', id);
    if (error) { console.error('Error deleting instrument from catalog:', error.message); return false; }
    return true;
  }
}
