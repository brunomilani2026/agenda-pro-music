'use server';

// Tarefas do aluno (etapa 5): ele LÊ as próprias tarefas e faz entregas. Não conclui tarefa
// nem escreve retorno. Tudo pela SESSÃO DO ALUNO: as regras do banco (RLS) e do storage decidem.

import { randomUUID } from 'node:crypto';
import { getSessionStudent } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { tabelaAusente } from '@/lib/diario-aluno';
import { getLocalISODate, nowInSaoPaulo } from '@/lib/utils';
import {
  caminhoEntrega, limparEntregaLink, statusDaTarefa, validarArquivoEntrega,
  type Entrega, type StatusTarefa, type Tarefa,
} from '@/lib/tarefas';

const ERRO = 'Não foi possível concluir. Tente de novo.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Falha = { ok: false; error: string };

export type EntregaDoAluno = Entrega;
export type TarefaDoAluno = Tarefa & { entregas: EntregaDoAluno[]; materiais: { id: string; title: string }[]; estado: StatusTarefa };

async function alunoLogado() {
  const student = await getSessionStudent();
  if (!student || !student.idusers_fk) return null;
  return { student, supabase: await createClient() };
}

export async function fetchMinhasTarefas(): Promise<{ ok: true; disponivel: boolean; tarefas: TarefaDoAluno[] } | Falha> {
  try {
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { student, supabase } = ctx;
    const [t, e] = await Promise.all([
      supabase.from('task').select('id, idstudent_fk, title, description, due_date, status, completed_at, created_at').eq('idstudent_fk', student.idstudent).order('created_at', { ascending: false }),
      supabase.from('task_submission').select('id, task_fk, kind, note, url, file_name, mime_type, size_bytes, feedback, feedback_at, created_at').eq('idstudent_fk', student.idstudent),
    ]);
    if (tabelaAusente(t.error) || tabelaAusente(e.error)) return { ok: true, disponivel: false, tarefas: [] };
    if (t.error || e.error) { console.error('Portal tarefas: erro ao buscar:', (t.error || e.error)?.message); return { ok: false, error: 'Não foi possível carregar suas tarefas.' }; }
    const tarefas = (t.data ?? []) as Tarefa[];
    const ids = tarefas.map(x => x.id);

    const apoio = new Map<string, { id: string; title: string }[]>();
    if (ids.length) {
      const { data: links } = await supabase.from('task_material').select('task_fk, material_fk').in('task_fk', ids);
      const mids = [...new Set((links ?? []).map(l => l.material_fk as string))];
      if (mids.length) {
        const { data: mats } = await supabase.from('material').select('id, title').in('id', mids);
        const titulo = new Map((mats ?? []).map(m => [m.id as string, m.title as string]));
        for (const l of links ?? []) {
          const tt = titulo.get(l.material_fk as string);
          if (!tt) continue;
          const lista = apoio.get(l.task_fk as string) ?? [];
          lista.push({ id: l.material_fk as string, title: tt });
          apoio.set(l.task_fk as string, lista);
        }
      }
    }
    const hoje = getLocalISODate(nowInSaoPaulo());
    const entregas = (e.data ?? []) as Entrega[];
    return {
      ok: true, disponivel: true,
      tarefas: tarefas.map(x => {
        const es = entregas.filter(en => en.task_fk === x.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
        return { ...x, entregas: es, materiais: apoio.get(x.id) ?? [], estado: statusDaTarefa(x, es, hoje) };
      }),
    };
  } catch (err: any) { console.error('Portal tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

/** 1/3 da entrega por arquivo: valida e devolve um endereço de envio temporário (o arquivo vai direto ao storage privado). */
export async function prepararEntrega(taskId: string, arq: { nome: unknown; mime: unknown; tamanho: unknown }): Promise<{ ok: true; path: string; token: string } | Falha> {
  try {
    if (!UUID.test(taskId)) return { ok: false, error: 'Tarefa não encontrada.' };
    const v = validarArquivoEntrega(arq); if (!v.ok) return v;
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { student, supabase } = ctx;
    const { data: t } = await supabase.from('task').select('id, status').eq('id', taskId).eq('idstudent_fk', student.idstudent).maybeSingle();
    if (!t) return { ok: false, error: 'Tarefa não encontrada.' };
    if (t.status !== 'aberta') return { ok: false, error: 'Esta tarefa já foi concluída pelo professor.' };
    const path = caminhoEntrega(student.idusers_fk as string, student.idstudent, randomUUID(), v.valor.nome);
    const { data, error } = await supabase.storage.from('entregas').createSignedUploadUrl(path);
    if (error || !data) { console.error('Portal tarefas: erro ao preparar envio:', error?.message); return { ok: false, error: 'Não foi possível preparar o envio.' }; }
    return { ok: true, path, token: data.token };
  } catch (err: any) { console.error('Portal tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

/** 3/3 da entrega por arquivo: confere que o arquivo chegou e registra a entrega. Tamanho e tipo vêm do storage. */
export async function concluirEntrega(taskId: string, path: unknown, note: unknown, nomeOriginal: unknown): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(taskId)) return { ok: false, error: 'Tarefa não encontrada.' };
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { student, supabase } = ctx;
    const pasta = `${student.idusers_fk}/${student.idstudent}`;
    if (typeof path !== 'string' || !path.startsWith(`${pasta}/`) || path.includes('..')) return { ok: false, error: 'Arquivo inválido.' };
    if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 5000)) return { ok: false, error: 'A observação é longa demais.' };

    const nome = path.slice(pasta.length + 1);
    const { data: lista, error: errList } = await supabase.storage.from('entregas').list(pasta, { search: nome, limit: 5 });
    const obj = (lista ?? []).find(o => o.name === nome);
    if (errList || !obj) return { ok: false, error: 'O arquivo não chegou ao armazenamento. Tente enviar de novo.' };

    const { error } = await supabase.from('task_submission').insert({
      task_fk: taskId, idstudent_fk: student.idstudent, idusers_fk: student.idusers_fk, kind: 'arquivo',
      note: typeof note === 'string' && note.trim() ? note.trim() : null, storage_path: path,
      file_name: (typeof nomeOriginal === 'string' && nomeOriginal.trim() ? nomeOriginal : nome).slice(0, 200),
      mime_type: String((obj.metadata as any)?.mimetype ?? '') || null, size_bytes: Number((obj.metadata as any)?.size ?? 0) || null,
    });
    if (error) {
      await supabase.storage.from('entregas').remove([path]);
      console.error('Portal tarefas: erro ao registrar entrega:', error.message);
      return { ok: false, error: 'Não foi possível registrar a entrega. A tarefa pode já ter sido concluída.' };
    }
    return { ok: true };
  } catch (err: any) { console.error('Portal tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

export async function entregarLink(taskId: string, url: unknown, note: unknown): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(taskId)) return { ok: false, error: 'Tarefa não encontrada.' };
    const v = limparEntregaLink(url, note); if (!v.ok) return v;
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };
    const { student, supabase } = ctx;
    const { error } = await supabase.from('task_submission').insert({
      task_fk: taskId, idstudent_fk: student.idstudent, idusers_fk: student.idusers_fk, kind: 'link', url: v.valor.url, note: v.valor.note,
    });
    if (error) { console.error('Portal tarefas: erro ao entregar link:', error.message); return { ok: false, error: 'Não foi possível registrar a entrega. A tarefa pode já ter sido concluída.' }; }
    return { ok: true };
  } catch (err: any) { console.error('Portal tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

/** O aluno só apaga entrega que ainda não recebeu retorno (a regra do banco também confere). */
export async function apagarMinhaEntrega(id: string): Promise<{ ok: true } | Falha> {
  try {
    if (!UUID.test(id)) return { ok: false, error: 'Entrega não encontrada.' };
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { student, supabase } = ctx;
    const { data: s } = await supabase.from('task_submission').select('storage_path').eq('id', id).eq('idstudent_fk', student.idstudent).is('feedback_at', null).maybeSingle();
    if (!s) return { ok: false, error: 'Não é possível apagar: a entrega não existe ou já recebeu retorno.' };
    const { data, error } = await supabase.from('task_submission').delete().eq('id', id).eq('idstudent_fk', student.idstudent).is('feedback_at', null).select('id');
    if (error || !data?.length) return { ok: false, error: 'Não foi possível apagar a entrega.' };
    if (s.storage_path) await supabase.storage.from('entregas').remove([s.storage_path as string]);
    return { ok: true };
  } catch (err: any) { console.error('Portal tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}

export async function enderecoMinhaEntrega(id: string): Promise<{ ok: true; url: string } | Falha> {
  try {
    if (!UUID.test(id)) return { ok: false, error: 'Entrega não encontrada.' };
    const ctx = await alunoLogado();
    if (!ctx) return { ok: false, error: 'Sessão inválida.' };
    const { student, supabase } = ctx;
    const { data: s } = await supabase.from('task_submission').select('kind, url, storage_path').eq('id', id).eq('idstudent_fk', student.idstudent).maybeSingle();
    if (!s) return { ok: false, error: 'Entrega não encontrada.' };
    if (s.kind === 'link') return s.url ? { ok: true, url: s.url } : { ok: false, error: 'Entrega sem endereço.' };
    const { data, error } = await supabase.storage.from('entregas').createSignedUrl(s.storage_path as string, 120);
    if (error || !data) return { ok: false, error: 'Não foi possível abrir o arquivo.' };
    return { ok: true, url: data.signedUrl };
  } catch (err: any) { console.error('Portal tarefas: erro inesperado:', err?.message || err); return { ok: false, error: ERRO }; }
}
