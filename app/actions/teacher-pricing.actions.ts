'use server';

import { getSessionUser } from '@/lib/session';
import { TeacherService } from '@/services/teacher.service';
import { InstrumentService } from '@/services/instrument.service';

/** Resolve o idteacher (PK da tabela teacher) a partir do usuário logado. */
async function resolveTeacher() {
  const dbUser = await getSessionUser();
  if (!dbUser || dbUser.usertype !== 'professor') return null;
  const teacher = await TeacherService.getTeacherByUser(dbUser.idusers);
  return teacher?.idteacher ?? null;
}

/**
 * Retorna os instrumentos que o professor logado ensina (com preço) + o catálogo
 * disponível para adicionar novos. Alimenta o gerenciador em Configurações.
 */
export async function fetchTeacherInstruments(): Promise<{
  pricings: { id: string; instrument: string; price: number; is_primary: boolean }[];
  catalog: { id: string; name: string }[];
}> {
  const idteacher = await resolveTeacher();
  if (!idteacher) return { pricings: [], catalog: [] };

  const [pricings, catalog] = await Promise.all([
    TeacherService.getPricingByTeacher(idteacher),
    InstrumentService.getInstrumentCatalog(),
  ]);

  return {
    pricings,
    catalog: (catalog || []).map((c: any) => ({ id: String(c.id), name: c.name })),
  };
}

/**
 * Adiciona ou atualiza o preço de um instrumento do professor (upsert por instrumento).
 */
export async function saveTeacherInstrument(input: {
  instrument: string;
  price: number;
}): Promise<{ success: boolean; error?: string }> {
  const idteacher = await resolveTeacher();
  if (!idteacher) return { success: false, error: 'Não autorizado.' };

  const instrument = (input.instrument || '').trim();
  const price = Number(input.price);

  if (!instrument) return { success: false, error: 'Selecione um instrumento.' };
  if (!Number.isFinite(price) || price < 0) {
    return { success: false, error: 'Informe um preço válido.' };
  }

  const ok = await TeacherService.updateTeacherPricing(idteacher, instrument, price);
  return ok ? { success: true } : { success: false, error: 'Erro ao salvar instrumento.' };
}

/**
 * Remove um instrumento da lista do professor.
 */
export async function deleteTeacherInstrument(
  instrument: string
): Promise<{ success: boolean; error?: string }> {
  const idteacher = await resolveTeacher();
  if (!idteacher) return { success: false, error: 'Não autorizado.' };

  const ok = await TeacherService.deletePricing(idteacher, (instrument || '').trim());
  return ok ? { success: true } : { success: false, error: 'Erro ao remover instrumento.' };
}

/**
 * Marca um instrumento como o principal do professor (destaque no marketplace).
 */
export async function setPrimaryTeacherInstrument(
  instrument: string
): Promise<{ success: boolean; error?: string }> {
  const idteacher = await resolveTeacher();
  if (!idteacher) return { success: false, error: 'Não autorizado.' };

  const ok = await TeacherService.setPrimaryInstrument(idteacher, (instrument || '').trim());
  return ok ? { success: true } : { success: false, error: 'Erro ao definir instrumento principal.' };
}
