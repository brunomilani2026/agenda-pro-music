import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/server';

// Envio de avisos no celular (Web Push) para o aluno dono da notificação.
// Chamado por /api/push/enviar, que o banco aciona a cada linha nova em `notification`.

type Notificacao = {
  recipient?: string | null;
  idstudent_fk?: string | null;
  type?: string | null;
  title?: string | null;
  message?: string | null;
};

const clean = (v: string | undefined) => v?.replace(/^﻿/, '').trim() || undefined;

let configurado = false;
function configurar(): boolean {
  if (configurado) return true;
  const pub = clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const priv = clean(process.env.VAPID_PRIVATE_KEY);
  const subject = clean(process.env.VAPID_SUBJECT) || 'mailto:notificacoes@agendapromusic.com.br';
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configurado = true;
  return true;
}

/** Para onde o toque no aviso leva o aluno. */
export function destinoDoAviso(n: Notificacao): string {
  const t = `${n.type ?? ''} ${n.title ?? ''}`.toLowerCase();
  if (/pagament|fatura|cobran|mensalidade|vencimento|atraso|cr[eé]dito/.test(t)) return '/aluno/financeiro';
  if (/tarefa/.test(t)) return '/aluno/tarefas';
  if (/aula|remarc|reposi|cancel|lembrete/.test(t)) return '/aluno/aulas';
  return '/aluno/notificacoes';
}

export async function enviarPush(n: Notificacao): Promise<{ enviados: number; removidos: number }> {
  if (n.recipient !== 'student' || !n.idstudent_fk || !configurar()) return { enviados: 0, removidos: 0 };

  const supabase = createAdminClient();
  const { data: subs } = await supabase.from('push_subscription').select('id, endpoint, p256dh, auth').eq('idstudent_fk', n.idstudent_fk);
  if (!subs?.length) return { enviados: 0, removidos: 0 };

  const payload = JSON.stringify({
    title: (n.title || 'Agenda Pro Music').slice(0, 80),
    body: (n.message || '').slice(0, 180),
    url: destinoDoAviso(n),
  });

  let enviados = 0;
  const mortos: string[] = [];
  await Promise.all(subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 });
      enviados++;
    } catch (e: any) {
      // 404/410: o aparelho desinstalou o app ou revogou a permissão — a assinatura não serve mais.
      if (e?.statusCode === 404 || e?.statusCode === 410) mortos.push(s.id);
      else console.error('Push: falha ao enviar:', e?.statusCode, e?.body?.slice?.(0, 120));
    }
  }));
  if (mortos.length) await supabase.from('push_subscription').delete().in('id', mortos);
  return { enviados, removidos: mortos.length };
}
