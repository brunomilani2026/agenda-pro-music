import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getLocalISODate } from '@/lib/utils';
import { mapDbLessonToUI } from '@/lib/lesson-mapper';
import { carregarAlertas } from '@/lib/painel-dados';
import { montarResumo, type AulaDoDia } from '@/lib/resumo-diario';
import { emailTeacher } from '@/lib/notify-email';

export const dynamic = 'force-dynamic';

/**
 * Resumo diário por e-mail ao professor: aulas de hoje + alertas do painel "Atenção".
 * Roda uma vez por dia (ver vercel.json). Só lê dados; o único efeito é o e-mail.
 * Alunos inativos ficam fora (a regra do painel já os exclui; aqui também filtramos as aulas).
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createAdminClient();
    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hoje = getLocalISODate(agora);
    const hojeBr = hoje.split('-').reverse().join('/');

    const { data: professores, error } = await db.from('users').select('idusers').eq('usertype', 'professor').eq('accountstatus', 'approved');
    if (error) throw new Error(error.message);

    let enviados = 0;
    for (const prof of professores ?? []) {
      const dono = prof.idusers as string;
      try {
        const [alertas, { data: aulasBrutas }, { data: inativos }] = await Promise.all([
          carregarAlertas(db, dono),
          db.from('lesson').select('idlesson, date, datelesson, starttime, endtime, instrument, lessonstatus, student_fk, studentname')
            .eq('idusers_fk', dono).gte('datelesson', `${hoje}T00:00:00-03:00`).lte('datelesson', `${hoje}T23:59:59-03:00`),
          db.from('student').select('idstudent').eq('idusers_fk', dono).eq('status', 'inativo'),
        ]);
        const fora = new Set((inativos ?? []).map((s: { idstudent: string }) => s.idstudent));
        const aulas: AulaDoDia[] = [];
        for (const l of aulasBrutas ?? []) {
          const ui = mapDbLessonToUI(l as any);
          if (ui.status !== 'agendada' && ui.status !== 'aguardando_pagamento' && ui.status !== 'realizada') continue;
          if ((l as any).student_fk && fora.has((l as any).student_fk)) continue;
          aulas.push({ startTime: ui.startTime, endTime: ui.endTime, aluno: ui.studentName, instrumento: ui.instrument, status: ui.status });
        }
        const resumo = montarResumo({ hojeBr, aulas, alertas });
        if (!resumo) continue;
        const r = await emailTeacher(dono, { title: resumo.title, message: resumo.message, buttonLabel: 'Abrir o painel', buttonPath: '/dashboard' });
        if (r.ok) enviados++; else console.warn('Resumo diário: e-mail não enviado:', r.reason);
      } catch (e: any) {
        console.error('Resumo diário: falha para um professor:', e?.message || e);
      }
    }
    return NextResponse.json({ ok: true, enviados });
  } catch (err: any) {
    console.error('Resumo diário: erro:', err?.message || err);
    return NextResponse.json({ error: 'Falha' }, { status: 500 });
  }
}
