'use server';

import { randomUUID } from 'node:crypto';
import { contextoProfessor, UUID, type Falha } from '@/lib/professor-ctx';
import { tabelaAusente } from '@/lib/diario-aluno';
import {
  caminhoMaterial, limparMaterial, tipoDoLink, urlSegura, validarArquivo, MAX_BYTES,
  type Material,
} from '@/lib/materiais';

const ERRO = 'Não foi possível concluir. Tente de novo.';
const SEM_TABELA = 'A biblioteca de materiais ainda não foi ativada no banco.';
const BUCKET = 'materials';
const COLUNAS = 'id, kind, title, description, category, instrument, level, content_tag, url, storage_path, file_name, mime_type, size_bytes, created_at';

export type MaterialLinha = Material & { alunos: number; aulas: number };

export async function listarMateriais(): Promise<{ ok: true; disponivel: boolean; materiais: MaterialLinha[] } | Falha> {
  try {
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { supabase, dbUser } = ctx;
    const [m, s, l] = await Promise.all([
      supabase.from('material').select(COLUNAS).eq('idusers_fk', dbUser.idusers).order('created_at', { ascending: false }),
      supabase.from('material_share').select('material_fk').eq('idusers_fk', dbUser.idusers),
      supabase.from('lesson_material').select('material_fk').eq('idusers_fk', dbUser.idusers),
    ]);
    if (tabelaAusente(m.error)) return { ok: true, disponivel: false, materiais: [] };
    if (m.error || s.error || l.error) { console.error('Materiais: erro ao listar:', (m.error || s.error || l.error)?.message); return { ok: false, error: 'Não foi possível carregar os materiais.' }; }
    const cont = (rows: { material_fk: string }[] | null) => { const mp = new Map<string, number>(); for (const r of rows ?? []) mp.set(r.material_fk, (mp.get(r.material_fk) ?? 0) + 1); return mp; };
    const cs = cont(s.data), cl = cont(l.data);
    return { ok: true, disponivel: true, materiais: (m.data ?? []).map(x => ({ ...(x as Material), alunos: cs.get(x.id) ?? 0, aulas: cl.get(x.id) ?? 0 })) };
  } catch (e: any) { console.error('Materiais: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

/** 1/3 do envio: valida e devolve um endereço de envio temporário. O arquivo vai direto do navegador para o storage privado. */
export async function prepararUpload(arq: { nome: unknown; mime: unknown; tamanho: unknown }): Promise<{ ok: true; path: string; token: string } | Falha> {
  try {
    const v = validarArquivo(arq);
    if (!v.ok) return v;
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const path = caminhoMaterial(ctx.dbUser.idusers, randomUUID(), v.valor.nome);
    const { data, error } = await ctx.supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) { console.error('Materiais: erro ao preparar envio:', error?.message); return { ok: false, error: 'Não foi possível preparar o envio.' }; }
    return { ok: true, path, token: data.token };
  } catch (e: any) { console.error('Materiais: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

/** 3/3 do envio: confere que o arquivo chegou ao storage e cadastra o material. Tamanho e tipo vêm do storage, não do navegador. */
export async function concluirUpload(path: unknown, bruto: Record<string, unknown>): Promise<{ ok: true; id: string } | Falha> {
  try {
    const dados = limparMaterial(bruto);
    if (!dados.ok) return dados;
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { supabase, dbUser } = ctx;
    if (typeof path !== 'string' || !path.startsWith(`${dbUser.idusers}/`) || path.includes('..')) return { ok: false, error: 'Arquivo inválido.' };

    const nome = path.slice(dbUser.idusers.length + 1);
    const { data: lista, error: errList } = await supabase.storage.from(BUCKET).list(dbUser.idusers, { search: nome, limit: 5 });
    const obj = (lista ?? []).find(o => o.name === nome);
    if (errList || !obj) return { ok: false, error: 'O arquivo não chegou ao armazenamento. Tente enviar de novo.' };
    const tamanho = Number((obj.metadata as any)?.size ?? 0);
    const mime = String((obj.metadata as any)?.mimetype ?? '');
    if (tamanho > MAX_BYTES) { await supabase.storage.from(BUCKET).remove([path]); return { ok: false, error: 'Arquivo grande demais.' }; }

    const { data, error } = await supabase.from('material').insert({
      ...dados.valor, idusers_fk: dbUser.idusers, kind: 'arquivo', storage_path: path,
      file_name: String(bruto.file_name ?? nome).slice(0, 200), mime_type: mime || null, size_bytes: tamanho || null,
    }).select('id').single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      if (tabelaAusente(error)) return { ok: false, error: SEM_TABELA };
      console.error('Materiais: erro ao cadastrar:', error.message);
      return { ok: false, error: 'Não foi possível cadastrar o material.' };
    }
    return { ok: true, id: data.id };
  } catch (e: any) { console.error('Materiais: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

export async function criarLink(bruto: Record<string, unknown>): Promise<{ ok: true; id: string } | Falha> {
  try {
    const dados = limparMaterial(bruto); if (!dados.ok) return dados;
    const u = urlSegura(bruto.url); if (!u.ok) return u;
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { data, error } = await ctx.supabase.from('material')
      .insert({ ...dados.valor, idusers_fk: ctx.dbUser.idusers, kind: tipoDoLink(u.valor), url: u.valor }).select('id').single();
    if (error) {
      if (tabelaAusente(error)) return { ok: false, error: SEM_TABELA };
      console.error('Materiais: erro ao criar link:', error.message);
      return { ok: false, error: 'Não foi possível cadastrar o link.' };
    }
    return { ok: true, id: data.id };
  } catch (e: any) { console.error('Materiais: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

export async function editarMaterial(id: string, bruto: Record<string, unknown>): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(id)) return { ok: false, error: 'Material não encontrado.' };
    const dados = limparMaterial(bruto); if (!dados.ok) return dados;
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { supabase, dbUser } = ctx;
    const campos: Record<string, unknown> = { ...dados.valor };
    if (bruto.url !== undefined) {
      const { data: atual } = await supabase.from('material').select('kind').eq('id', id).eq('idusers_fk', dbUser.idusers).maybeSingle();
      if (atual && atual.kind !== 'arquivo') {
        const u = urlSegura(bruto.url); if (!u.ok) return u;
        campos.url = u.valor; campos.kind = tipoDoLink(u.valor);
      }
    }
    const { data, error } = await supabase.from('material').update(campos).eq('id', id).eq('idusers_fk', dbUser.idusers).select('id');
    if (error) { console.error('Materiais: erro ao editar:', error.message); return { ok: false, error: ERRO }; }
    return data?.length ? { ok: true } : { ok: false, error: 'Material não encontrado.' };
  } catch (e: any) { console.error('Materiais: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

/** Apaga o material, os compartilhamentos e o arquivo do storage. */
export async function apagarMaterial(id: string): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(id)) return { ok: false, error: 'Material não encontrado.' };
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { supabase, dbUser } = ctx;
    const { data: m } = await supabase.from('material').select('storage_path').eq('id', id).eq('idusers_fk', dbUser.idusers).maybeSingle();
    if (!m) return { ok: false, error: 'Material não encontrado.' };
    const { error } = await supabase.from('material').delete().eq('id', id).eq('idusers_fk', dbUser.idusers);
    if (error) { console.error('Materiais: erro ao apagar:', error.message); return { ok: false, error: ERRO }; }
    if (m.storage_path) {
      const r = await supabase.storage.from(BUCKET).remove([m.storage_path]);
      if (r.error) console.error('Materiais: arquivo órfão no storage:', m.storage_path, r.error.message);
    }
    return { ok: true };
  } catch (e: any) { console.error('Materiais: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

export async function fetchCompartilhamento(id: string): Promise<{ ok: true; alunos: string[] } | Falha> {
  try {
    if (!UUID.test(id)) return { ok: false, error: 'Material não encontrado.' };
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { data, error } = await ctx.supabase.from('material_share').select('idstudent_fk').eq('material_fk', id).eq('idusers_fk', ctx.dbUser.idusers);
    if (error) return { ok: false, error: ERRO };
    return { ok: true, alunos: (data ?? []).map(r => r.idstudent_fk as string) };
  } catch (e: any) { console.error('Materiais: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

/** Define exatamente QUEM tem acesso ao material (acrescenta e retira). Sem duplicar o arquivo. */
export async function definirCompartilhamento(id: string, studentIds: string[]): Promise<{ ok: true; total: number } | Falha> {
  try {
    if (!UUID.test(id)) return { ok: false, error: 'Material não encontrado.' };
    const pedidos = [...new Set(studentIds)].filter(x => UUID.test(x));
    if (pedidos.length > 500) return { ok: false, error: 'Alunos demais de uma vez.' };
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { supabase, dbUser } = ctx;
    const { data: mat } = await supabase.from('material').select('id').eq('id', id).eq('idusers_fk', dbUser.idusers).maybeSingle();
    if (!mat) return { ok: false, error: 'Material não encontrado.' };

    const { data: meus } = pedidos.length
      ? await supabase.from('student').select('idstudent').eq('idusers_fk', dbUser.idusers).in('idstudent', pedidos)
      : { data: [] as { idstudent: string }[] };
    const alvo = new Set((meus ?? []).map(s => s.idstudent as string));

    const { data: atuais, error: errAt } = await supabase.from('material_share').select('idstudent_fk').eq('material_fk', id).eq('idusers_fk', dbUser.idusers);
    if (errAt) return { ok: false, error: ERRO };
    const tem = new Set((atuais ?? []).map(r => r.idstudent_fk as string));

    const adicionar = [...alvo].filter(a => !tem.has(a));
    const remover = [...tem].filter(a => !alvo.has(a));
    if (adicionar.length) {
      const { error } = await supabase.from('material_share').insert(adicionar.map(a => ({ material_fk: id, idstudent_fk: a, idusers_fk: dbUser.idusers })));
      if (error) { console.error('Materiais: erro ao compartilhar:', error.message); return { ok: false, error: 'Não foi possível compartilhar.' }; }
    }
    if (remover.length) {
      const { error } = await supabase.from('material_share').delete().eq('material_fk', id).eq('idusers_fk', dbUser.idusers).in('idstudent_fk', remover);
      if (error) { console.error('Materiais: erro ao retirar acesso:', error.message); return { ok: false, error: 'Não foi possível retirar o acesso.' }; }
    }
    return { ok: true, total: alvo.size };
  } catch (e: any) { console.error('Materiais: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}

/** Endereço para abrir o material: link direto, ou endereço temporário (2 min) para arquivo. */
export async function enderecoDoMaterial(id: string): Promise<{ ok: true; url: string } | Falha> {
  try {
    if (!UUID.test(id)) return { ok: false, error: 'Material não encontrado.' };
    const ctx = await contextoProfessor();
    if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { data: m } = await ctx.supabase.from('material').select('kind, url, storage_path').eq('id', id).maybeSingle();
    if (!m) return { ok: false, error: 'Material não encontrado.' };
    if (m.kind !== 'arquivo') return m.url ? { ok: true, url: m.url } : { ok: false, error: 'Material sem endereço.' };
    const { data, error } = await ctx.supabase.storage.from(BUCKET).createSignedUrl(m.storage_path as string, 120);
    if (error || !data) { console.error('Materiais: erro ao abrir:', error?.message); return { ok: false, error: 'Não foi possível abrir o arquivo.' }; }
    return { ok: true, url: data.signedUrl };
  } catch (e: any) { console.error('Materiais: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}
