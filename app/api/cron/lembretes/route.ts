import { NextRequest, NextResponse } from 'next/server';
import { getLocalISODate } from '@/lib/utils';
import { createAdminClient } from '@/lib/supabase/server';
import { emailStudent, lessonObsForEmail, lessonMeetLineForEmail, lessonEmailCta, getTeacherMeetLinks } from '@/lib/notify-email';

// Sem cache: precisa ler o estado atual das aulas a cada execução.
export const dynamic = 'force-dynamic';

function fmtDate(isoDate: string) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Lembrete de aula (RF — notificação tipo 'lembrete').
 *
 * Roda uma vez por dia via Vercel Cron (ver vercel.json). Busca as aulas
 * 'agendada' do dia seguinte (fuso America/Sao_Paulo) que ainda não foram
 * lembradas, cria uma notificação in-app e espelha por e-mail ao aluno.
 *
 * Idempotente: marca `lesson.reminder_sent = true` após enviar, então uma
 * segunda execução no mesmo dia não reenvia. Usa o admin client porque roda
 * sem sessão (o RLS esconderia as linhas).
 */
export async function GET(request: NextRequest) {
  // Fail-closed: sem o segredo configurado, ninguém dispara o cron.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET não configurado — cron de lembretes rejeitado.');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // "Hoje" e "amanhã" no fuso de São Paulo (não no UTC do servidor).
    const nowBrazil = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const today = getLocalISODate(nowBrazil);
    const nowTime = `${String(nowBrazil.getHours()).padStart(2, '0')}:${String(nowBrazil.getMinutes()).padStart(2, '0')}`;
    nowBrazil.setDate(nowBrazil.getDate() + 1);
    const tomorrow = getLocalISODate(nowBrazil);

    // Inclui as aulas de HOJE ainda não lembradas (criadas depois da execução
    // de ontem — antes, uma aula agendada à tarde para o dia seguinte nunca
    // recebia lembrete).
    const { data: rawLessons, error } = await supabase
      .from('lesson')
      .select('idlesson, studentname, teachername, instrument, date, starttime, idusers_fk, obs')
      .eq('lessonstatus', 'agendada')
      .in('date', [today, tomorrow])
      .eq('reminder_sent', false);

    if (error) {
      console.error('Cron lembretes: erro ao buscar aulas:', error.message);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const lessons = (rawLessons || []).filter(
      l => l.date === tomorrow || (l.date === today && (l.starttime || '') > nowTime)
    );

    if (lessons.length === 0) {
      return NextResponse.json({ date: tomorrow, reminded: 0, emailed: 0 });
    }

    let reminded = 0;
    let emailed = 0;
    const sentLessonIds: string[] = [];

    // Salas virtuais dos professores envolvidos — uma query só, fora do loop.
    const meetLinks = await getTeacherMeetLinks(lessons.map(l => l.idusers_fk));

    for (const lesson of lessons) {
      // A aula guarda studentname, não idstudent_fk: resolve o aluno para
      // pegar o id (notificação/e-mail). Sem conta de aluno → só marca lido.
      const { data: student } = await supabase
        .from('student')
        .select('idstudent, status')
        .eq('idusers_fk', lesson.idusers_fk)
        .ilike('name', lesson.studentname)
        .limit(1)
        .maybeSingle();

      // Marca como lembrada de qualquer forma: evita reprocessar aulas sem
      // aluno vinculado a cada execução do cron.
      sentLessonIds.push(lesson.idlesson);
      if (!student) continue;
      // Aluno inativo não recebe lembrete de aula.
      if (student.status === 'inativo') continue;

      const whenLabel = lesson.date === today ? 'hoje' : 'amanhã';
      const msg = `Sua aula de ${lesson.instrument || 'música'}${lesson.teachername ? ` com ${lesson.teachername}` : ''} é ${whenLabel}, ${fmtDate(lesson.date)} às ${lesson.starttime}.`;

      const { error: notifErr } = await supabase.from('notification').insert([{
        idstudent_fk: student.idstudent,
        idusers_fk: lesson.idusers_fk,
        recipient: 'student',
        type: 'lembrete',
        title: 'Lembrete de aula',
        message: msg,
        read: false,
      }]);
      if (notifErr) {
        console.error('Cron lembretes: erro ao criar notificação:', notifErr.message);
        continue;
      }
      reminded++;

      const meetLink = meetLinks.get(lesson.idusers_fk);
      const emailResult = await emailStudent(student.idstudent, {
        title: `Lembrete: sua aula é ${whenLabel}`,
        message: msg + lessonMeetLineForEmail(meetLink) + lessonObsForEmail(lesson.obs),
        ...lessonEmailCta(meetLink),
      });
      if (emailResult.ok) emailed++;
    }

    if (sentLessonIds.length > 0) {
      const { error: updErr } = await supabase
        .from('lesson')
        .update({ reminder_sent: true })
        .in('idlesson', sentLessonIds);
      if (updErr) console.error('Cron lembretes: erro ao marcar reminder_sent:', updErr.message);
    }

    return NextResponse.json({ date: tomorrow, reminded, emailed });
  } catch (err: any) {
    console.error('Cron lembretes: erro inesperado:', err?.message || err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
