'use server';

import { alunoDoProfessor, type Falha } from '@/lib/professor-ctx';
import { tabelaAusente } from '@/lib/diario-aluno';
import { classificarEmail, type TipoEmail } from '@/lib/email-tipos';
import { parearLeitura, type AvisoLeitura } from '@/lib/email-lida';

const ERRO = 'Não foi possível carregar os e-mails. Tente de novo.';

export type EmailAluno = {
  id: string;
  origem: 'email' | 'portal';        // email = registro do envio; portal = aviso antigo do portal (e-mail provável, sem garantia)
  tipo: TipoEmail;
  title: string;
  message: string | null;
  button_label: string | null;
  button_url: string | null;
  status: 'enviado' | 'falhou' | 'aviso';
  fail_reason: string | null;
  fail_detail: string | null;
  to_email: string | null;
  created_at: string;
  /** Aviso do app que saiu junto: null = sem aviso correspondente. NÃO diz se o e-mail foi aberto. */
  lida: boolean | null;
  lida_em: string | null;
};

/**
 * E-mails do aluno (somente leitura): o registro de envios e, para o que veio ANTES do registro existir, os avisos do portal
 * (cada aviso do portal costuma ter um e-mail espelho, mas isso não é garantia de entrega).
 * Usa a sessão do professor: as regras de acesso do banco só deixam ver alunos dele.
 */
export async function fetchEmailsAluno(idstudent: string): Promise<
  { ok: true; disponivel: boolean; emailAluno: string | null; itens: EmailAluno[] } | Falha
> {
  try {
    const ctx = await alunoDoProfessor(idstudent);
    if (!ctx) return { ok: false, error: 'Aluno não encontrado.' };
    const { supabase, dbUser } = ctx;

    const [{ data: ficha }, log] = await Promise.all([
      supabase.from('student').select('email').eq('idstudent', idstudent).eq('idusers_fk', dbUser.idusers).maybeSingle(),
      supabase.from('email_log')
        .select('id, tipo, title, message, button_label, button_url, status, fail_reason, fail_detail, to_email, created_at')
        .eq('idstudent_fk', idstudent).order('created_at', { ascending: false }).limit(150),
    ]);
    const emailAluno = (ficha?.email as string | null) ?? null;
    if (tabelaAusente(log.error)) return { ok: true, disponivel: false, emailAluno, itens: [] };
    if (log.error) { console.error('E-mails do aluno: erro ao listar:', log.error.message); return { ok: false, error: ERRO }; }

    // Avisos do app deste aluno, com a leitura. Se a coluna read_at ainda não existe (SQL da etapa 13 não rodou),
    // busca sem ela: continua mostrando lida/não lida, só sem a hora.
    let avisosApp: any[] = [];
    {
      const cols = 'id, title, message, created_at, read, read_at';
      let r = await supabase.from('notification').select(cols).eq('idstudent_fk', idstudent).eq('recipient', 'student').order('created_at', { ascending: false }).limit(300);
      if (r.error) r = await supabase.from('notification').select('id, title, message, created_at, read').eq('idstudent_fk', idstudent).eq('recipient', 'student').order('created_at', { ascending: false }).limit(300) as typeof r;
      if (r.error) console.error('E-mails do aluno: erro ao buscar avisos:', r.error.message);
      else avisosApp = r.data ?? [];
    }
    const leituras = parearLeitura(
      (log.data ?? []).map(r => ({ id: r.id as string, title: r.title as string, created_at: r.created_at as string })),
      avisosApp.map(n => ({ id: n.id, title: n.title, created_at: n.created_at, read: !!n.read, read_at: n.read_at ?? null }) as AvisoLeitura),
    );

    const registrados: EmailAluno[] = (log.data ?? []).map(r => ({
      id: r.id as string, origem: 'email', tipo: classificarEmail(r.title as string, r.tipo as string),
      title: r.title as string, message: r.message as string | null, button_label: r.button_label as string | null, button_url: r.button_url as string | null,
      status: r.status === 'falhou' ? 'falhou' : 'enviado', fail_reason: r.fail_reason as string | null, fail_detail: r.fail_detail as string | null,
      to_email: r.to_email as string | null, created_at: r.created_at as string,
      lida: leituras.get(r.id as string)?.lida ?? null, lida_em: leituras.get(r.id as string)?.lida_em ?? null,
    }));

    // Avisos do portal só dos períodos SEM registro de e-mail (antes do primeiro registro).
    const primeiro = registrados.length ? registrados[registrados.length - 1].created_at : new Date().toISOString();
    const antigos: EmailAluno[] = avisosApp.filter(n => n.created_at < primeiro).slice(0, 100).map(n => ({
      id: n.id as string, origem: 'portal', tipo: classificarEmail(n.title as string), title: n.title as string, message: n.message as string | null,
      button_label: null, button_url: null, status: 'aviso', fail_reason: null, fail_detail: null, to_email: null, created_at: n.created_at as string,
      lida: !!n.read, lida_em: n.read ? (n.read_at ?? null) : null,
    }));

    return { ok: true, disponivel: true, emailAluno, itens: [...registrados, ...antigos] };
  } catch (e: any) { console.error('E-mails do aluno: erro inesperado:', e?.message || e); return { ok: false, error: ERRO }; }
}
