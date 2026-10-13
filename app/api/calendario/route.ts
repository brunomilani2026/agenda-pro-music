import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { mapDbLessonToUI } from '@/lib/lesson-mapper';
import { montarCalendario, type AulaIcs } from '@/lib/ics';

// Calendário de aulas para assinar no Google Agenda (somente leitura).
// Protegido por um código longo na própria URL (ICS_TOKEN). Para trocar o link, mude o código na Vercel.
// Mostra só primeiro nome + instrumento + horário; nunca telefone, e-mail, valores ou observações.

export const dynamic = 'force-dynamic';

const igual = (a: string, b: string): boolean => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function GET(req: Request) {
  const token = process.env.ICS_TOKEN?.trim();
  const professor = process.env.ICS_TEACHER_ID?.trim();
  // Falha fechada: sem configuração completa, a rota não existe.
  if (!token || token.length < 32 || !professor) return new Response('Não encontrado', { status: 404 });

  const recebido = new URL(req.url).searchParams.get('t') ?? '';
  if (!igual(recebido, token)) return new Response('Não encontrado', { status: 404 });

  try {
    const db = createAdminClient();
    const dia = 86400000;
    const de = new Date(Date.now() - 30 * dia).toISOString();
    const ate = new Date(Date.now() + 180 * dia).toISOString();

    const [{ data: aulas, error }, { data: inativos }] = await Promise.all([
      db.from('lesson').select('idlesson, date, datelesson, starttime, endtime, instrument, lessonstatus, student_fk, studentname')
        .eq('idusers_fk', professor).gte('datelesson', de).lte('datelesson', ate).limit(5000),
      // inativos e alunos de teste (is_test) não entram no calendário
      db.from('student').select('idstudent').eq('idusers_fk', professor).or('status.eq.inativo,is_test.eq.true'),
    ]);
    if (error) throw new Error(error.message);
    const fora = new Set((inativos ?? []).map((s: { idstudent: string }) => s.idstudent));

    const lista: AulaIcs[] = [];
    for (const l of aulas ?? []) {
      const ui = mapDbLessonToUI(l as any);
      if (ui.status !== 'agendada' && ui.status !== 'realizada' && ui.status !== 'aguardando_pagamento') continue;
      if ((l as any).student_fk && fora.has((l as any).student_fk)) continue;
      lista.push({ id: ui.id, aluno: ui.studentName, instrumento: ui.instrument, date: ui.date, startTime: ui.startTime, endTime: ui.endTime, status: ui.status });
    }

    return new Response(montarCalendario(lista), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=0, must-revalidate', 'X-Robots-Tag': 'noindex' },
    });
  } catch (err: any) {
    console.error('Calendário ICS: erro:', err?.message || err);
    return new Response('Erro ao gerar o calendário', { status: 500 });
  }
}
