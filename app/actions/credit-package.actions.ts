'use server';

import { getSessionUser } from '@/lib/session';
import { CreditPackageService } from '@/services/credit-package.service';

export async function fetchTeacherCreditPackages() {
  const dbUser = await getSessionUser();
  if (!dbUser || dbUser.usertype !== 'professor') return [];
  const packages = await CreditPackageService.getAllByTeacher(dbUser.idusers);
  return packages.map(p => ({
    id: p.id,
    name: p.name,
    credits: p.credits,
    price: Number(p.price),
    validity_days: p.validity_days,
    popular: p.popular,
    active: p.active,
    sort_order: p.sort_order,
  }));
}

export async function createTeacherCreditPackage(input: {
  name: string;
  credits: number;
  price: number;
  validity_days: number;
  popular?: boolean;
  sort_order?: number;
}) {
  const dbUser = await getSessionUser();
  if (!dbUser || dbUser.usertype !== 'professor') {
    return { success: false, error: 'Não autorizado.' };
  }

  const name = (input.name || '').trim();
  const credits = Math.floor(Number(input.credits));
  const price = Number(input.price);
  const validityDays = Math.floor(Number(input.validity_days));

  if (!name) return { success: false, error: 'Informe o nome do combo.' };
  if (!Number.isFinite(credits) || credits < 1) {
    return { success: false, error: 'A quantidade de créditos deve ser ao menos 1.' };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { success: false, error: 'Informe um preço válido.' };
  }
  if (!Number.isFinite(validityDays) || validityDays < 1) {
    return { success: false, error: 'A validade deve ser de pelo menos 1 dia.' };
  }

  const created = await CreditPackageService.create({
    idusers_fk: dbUser.idusers,
    name,
    credits,
    price,
    validity_days: validityDays,
    popular: !!input.popular,
    active: true,
    sort_order: Number.isFinite(input.sort_order ?? NaN) ? Number(input.sort_order) : 0,
  });

  if (!created) return { success: false, error: 'Erro ao criar combo.' };
  return { success: true, id: created.id };
}

export async function updateTeacherCreditPackage(id: string, patch: {
  name?: string;
  credits?: number;
  price?: number;
  validity_days?: number;
  popular?: boolean;
  active?: boolean;
  sort_order?: number;
}) {
  const dbUser = await getSessionUser();
  if (!dbUser || dbUser.usertype !== 'professor') {
    return { success: false, error: 'Não autorizado.' };
  }

  const existing = await CreditPackageService.getById(id);
  if (!existing || existing.idusers_fk !== dbUser.idusers) {
    return { success: false, error: 'Combo não encontrado.' };
  }

  const cleaned: Record<string, any> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { success: false, error: 'Informe o nome do combo.' };
    cleaned.name = name;
  }
  if (patch.credits !== undefined) {
    const credits = Math.floor(Number(patch.credits));
    if (!Number.isFinite(credits) || credits < 1) {
      return { success: false, error: 'A quantidade de créditos deve ser ao menos 1.' };
    }
    cleaned.credits = credits;
  }
  if (patch.price !== undefined) {
    const price = Number(patch.price);
    if (!Number.isFinite(price) || price < 0) {
      return { success: false, error: 'Informe um preço válido.' };
    }
    cleaned.price = price;
  }
  if (patch.validity_days !== undefined) {
    const validityDays = Math.floor(Number(patch.validity_days));
    if (!Number.isFinite(validityDays) || validityDays < 1) {
      return { success: false, error: 'A validade deve ser de pelo menos 1 dia.' };
    }
    cleaned.validity_days = validityDays;
  }
  if (patch.popular !== undefined) cleaned.popular = !!patch.popular;
  if (patch.active !== undefined) cleaned.active = !!patch.active;
  if (patch.sort_order !== undefined && Number.isFinite(Number(patch.sort_order))) {
    cleaned.sort_order = Number(patch.sort_order);
  }

  const updated = await CreditPackageService.update(id, cleaned);
  if (!updated) return { success: false, error: 'Erro ao atualizar combo.' };
  return { success: true };
}

export async function deleteTeacherCreditPackage(id: string) {
  const dbUser = await getSessionUser();
  if (!dbUser || dbUser.usertype !== 'professor') {
    return { success: false, error: 'Não autorizado.' };
  }

  const existing = await CreditPackageService.getById(id);
  if (!existing || existing.idusers_fk !== dbUser.idusers) {
    return { success: false, error: 'Combo não encontrado.' };
  }

  const ok = await CreditPackageService.delete(id);
  if (!ok) return { success: false, error: 'Erro ao excluir combo.' };
  return { success: true };
}
