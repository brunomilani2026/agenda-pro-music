import { createAdminClient } from '@/lib/supabase/server';
import { EmailService } from '@/services/email.service';
import type { EmailResult } from '@/lib/email-failure';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.agendapromusic.com.br';

// Textos de sistema gravados em lesson.obs pelos fluxos de remarcação/crédito —
// não são recado do professor e não devem ir no e-mail do aluno.
const SYSTEM_OBS = [
  'remarcação aprovada',
  'remarcada pelo professor',
  'reposição de aula cancelada',
  'aula coberta por crédito',
];

/**
 * Bloco "Recado do professor" para anexar à mensagem de e-mails de aula
 * (lembretes, aula agendada). É aqui que o link do Meet colado pela professora
 * em "Notas / Recomendações" chega ao aluno. Retorna '' quando o campo está
 * vazio ou contém texto de sistema.
 */
export function lessonObsForEmail(obs: string | null | undefined): string {
  const text = (obs || '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  if (SYSTEM_OBS.some(m => lower.includes(m))) return '';
  return `\n\nRecado do professor: ${text}`;
}

/**
 * Sala padrão da escola: o mesmo endereço para todos os alunos. Fica embutida
 * aqui de propósito — enquanto `teacher.meet_link` estiver vazio no perfil, o
 * aluno recebia e-mail de aula sem link nenhum, que foi o que aconteceu no
 * lembrete de 06/08/2026. O campo do perfil continua tendo prioridade: quem
 * preencher a própria sala em Configurações sobrescreve este padrão.
 * `DEFAULT_MEET_LINK` no ambiente troca o endereço sem novo deploy.
 */
const DEFAULT_MEET_LINK = process.env.DEFAULT_MEET_LINK || 'https://meet.google.com/gmq-rmcp-xsp';

/** Link do perfil quando existe; senão, a sala padrão da escola. */
function resolveMeetLink(value: string | null | undefined): string | null {
  return normalizeMeetLink(value) || normalizeMeetLink(DEFAULT_MEET_LINK);
}

/**
 * Sala virtual do professor (`teacher.meet_link`). É a mesma para todas as
 * aulas dele — por isso vive no perfil, e não em cada `lesson`, onde o link
 * colado à mão nas notas sumia toda vez que uma remarcação sobrescrevia `obs`.
 * Sem nada no perfil, cai na sala padrão acima.
 *
 * Admin client: os crons rodam sem sessão e o RLS esconderia a linha do professor.
 */
export async function getTeacherMeetLink(idusers_fk: string): Promise<string | null> {
  if (!idusers_fk) return null;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('teacher')
      .select('meet_link')
      .eq('idusers_fk', idusers_fk)
      .maybeSingle();
    return resolveMeetLink(data?.meet_link);
  } catch (err) {
    console.error('Falha ao buscar o link da sala do professor:', err);
    return resolveMeetLink(null);
  }
}

/**
 * Versão em lote de `getTeacherMeetLink` para os crons, que processam aulas de
 * vários professores de uma vez: uma query só, em vez de uma por aula.
 */
export async function getTeacherMeetLinks(idusersList: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(idusersList.filter(Boolean))];
  const byTeacher = new Map<string, string>();
  if (!ids.length) return byTeacher;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('teacher')
      .select('idusers_fk, meet_link')
      .in('idusers_fk', ids);
    for (const row of data ?? []) {
      const link = resolveMeetLink(row.meet_link);
      if (link) byTeacher.set(row.idusers_fk, link);
    }
  } catch (err) {
    console.error('Falha ao buscar os links das salas dos professores:', err);
  }
  return byTeacher;
}

/** Só aceita http(s): o valor vira `href` de botão em e-mail e na tela do aluno. */
export function normalizeMeetLink(value: string | null | undefined): string | null {
  const link = (value || '').trim();
  if (!/^https?:\/\/\S+$/i.test(link)) return null;
  return link;
}

/**
 * Linha "Link da aula" no corpo do e-mail. O CTA abaixo já leva à sala, mas o
 * endereço à vista é o que o aluno consegue copiar, mandar para o celular ou
 * abrir quando o cliente de e-mail come o botão. Vazio quando não há sala.
 */
export function lessonMeetLineForEmail(meetLink: string | null | undefined): string {
  const link = resolveMeetLink(meetLink);
  return link ? `\n\nLink da aula: ${link}` : '';
}

/**
 * CTA dos e-mails de aula: manda direto para a sala virtual quando o professor
 * configurou uma, senão cai no botão padrão "Ver minhas aulas".
 */
export function lessonEmailCta(meetLink: string | null | undefined):
  | { buttonLabel: string; buttonUrl: string }
  | { buttonLabel: string; buttonPath: string } {
  const link = resolveMeetLink(meetLink);
  return link
    ? { buttonLabel: 'Entrar na aula', buttonUrl: link }
    : { buttonLabel: 'Ver minhas aulas', buttonPath: '/aluno/aulas' };
}

/**
 * Espelha por e-mail uma notificação destinada ao aluno, usando o template
 * genérico do EmailJS (`EmailService.sendNotification`).
 *
 * Busca o e-mail/nome do aluno a partir do `idstudent_fk` e dispara. Nunca
 * lança: o e-mail é complementar à notificação in-app e não deve quebrar o
 * fluxo (webhook, server action, etc.). Retorna `{ ok: true }` apenas quando o
 * EmailJS aceitou o envio — quem precisa avisar o usuário (ex.: aviso manual)
 * repassa o motivo da falha; quem não precisa pode ignorar o retorno.
 *
 * `buttonPath` é relativo (ex.: `/aluno/dashboard`); o domínio é adicionado aqui.
 * `buttonUrl` é absoluto e tem precedência — usado por destinos fora do app,
 * como a sala do Meet no CTA dos e-mails de aula (ver `lessonEmailCta`).
 */
export async function emailStudent(
  idstudent_fk: string,
  content: {
    title: string;
    message: string;
    buttonLabel?: string;
    buttonPath?: string;
    buttonUrl?: string;
  },
): Promise<EmailResult> {
  try {
    if (!idstudent_fk) return { ok: false, reason: 'lookup' };

    // Admin client: o webhook do Asaas roda sem sessão e o RLS esconderia o
    // aluno, silenciando o e-mail. O lookup é interno e o destino é o próprio dono.
    const supabase = createAdminClient();
    const { data: student } = await supabase
      .from('student')
      .select('name, email')
      .eq('idstudent', idstudent_fk)
      .single();

    if (!student) return { ok: false, reason: 'lookup' };
    if (!student.email) return { ok: false, reason: 'sem-email' };

    return await EmailService.sendNotification({
      toEmail: student.email,
      toName: student.name || '',
      title: content.title,
      message: content.message,
      buttonLabel: content.buttonLabel,
      buttonUrl: content.buttonUrl || (content.buttonPath ? `${APP_URL}${content.buttonPath}` : undefined),
    });
  } catch (err) {
    console.error('Falha ao enviar e-mail de notificação ao aluno:', err);
    return { ok: false, reason: 'lookup' };
  }
}

/**
 * Espelho de `emailStudent` para o professor: busca e-mail/nome em `users` a
 * partir do `idusers_fk` e dispara o template genérico.
 *
 * Existe porque só `NotificationService.create()` aceita `{ emailTeacher: true }`;
 * os pontos que gravam a notificação com `.insert()` direto (webhook, baixa de
 * pagamento, ações do aluno) não tinham como avisar o professor por e-mail.
 *
 * Admin client: o remetente costuma ser o aluno, cuja sessão não enxerga a linha
 * do professor no RLS. Nunca lança — o e-mail é complementar à notificação.
 */
export async function emailTeacher(
  idusers_fk: string,
  content: {
    title: string;
    message: string;
    buttonLabel?: string;
    buttonPath?: string;
  },
): Promise<EmailResult> {
  try {
    if (!idusers_fk) return { ok: false, reason: 'lookup' };

    const supabase = createAdminClient();
    const { data: teacher } = await supabase
      .from('users')
      .select('fname, email')
      .eq('idusers', idusers_fk)
      .single();

    if (!teacher) return { ok: false, reason: 'lookup' };
    if (!teacher.email) return { ok: false, reason: 'sem-email' };

    return await EmailService.sendNotification({
      toEmail: teacher.email,
      toName: teacher.fname || 'Professor',
      title: content.title,
      message: content.message,
      buttonLabel: content.buttonLabel,
      buttonUrl: content.buttonPath ? `${APP_URL}${content.buttonPath}` : undefined,
    });
  } catch (err) {
    console.error('Falha ao enviar e-mail de notificação ao professor:', err);
    return { ok: false, reason: 'lookup' };
  }
}
