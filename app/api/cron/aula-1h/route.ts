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

/** "HH:MM" → minutos desde meia-noite. */
function toMinutes(t: string): number {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return h * 60 + m;
}

/**
 * Lembrete "sua aula é daqui a pouco" (RF07 — notificação 1 hora antes).
 *
 * Avisa (in-app + e-mail) os alunos com aula 'agendada' começando entre agora
 * e ~75 minutos, no fuso America/Sao_Paulo.
 *
 * ATENÇÃO — agendamento: o plano Hobby da Vercel limita crons a 1 execução
 * diária (e no máx. 2 jobs, já usados por cobrança e lembretes). Por isso este
 * endpoint NÃO está no vercel.json: quem o chama é um job no cron-job.org, a
 * cada 10 minutos, com o mesmo header:
 *   Authorization: Bearer <CRON_SECRET>
 * Se esse job for removido ou pausado, o lembrete some sem nenhum erro visível
 * — foi exatamente o que aconteceu entre 18/07/2026 e 05/08/2026.
 *
 * Idempotente sem coluna nova: a mensagem inclui data e hora da aula; antes de
 * enviar, verifica se a MESMA notificação já foi criada hoje para o aluno.
 */
export async function GET(request: NextRequest) {
  // Fail-closed: sem o segredo configurado, ninguém dispara o cron.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET não configurado — cron aula-1h rejeitado.');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // "Agora" no fuso de São Paulo (não no UTC do servidor).
    const nowBrazil = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const today = getLocalISODate(nowBrazil);
    const nowMin = nowBrazil.getHours() * 60 + nowBrazil.getMinutes();

    const { data: rawLessons, error } = await supabase
      .from('lesson')
      .select('idlesson, studentname, student_fk, teachername, instrument, date, starttime, idusers_fk, obs')
      .eq('lessonstatus', 'agendada')
      .eq('date', today);

    if (error) {
      console.error('Cron aula-1h: erro ao buscar aulas:', error.message);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    // Janela: começa em mais de 0 e até 65 minutos. Com o job de 10 em 10 min,
    // toda aula cai em alguma execução com 55–65 min de antecedência — que é o
    // "daqui a 60 minutos" prometido ao aluno. A janela (65) é muito maior que
    // a cadência (10), então nenhuma aula escapa entre duas execuções.
    const lessons = (rawLessons || []).filter(l => {
      const start = toMinutes(l.starttime || '');
      return start > nowMin && start - nowMin <= 65;
    });

    if (!lessons.length) {
      return NextResponse.json({ date: today, window: '65min', reminded: 0, emailed: 0 });
    }

    // ── Resolve os alunos em LOTE ────────────────────────────────────────────
    // Antes era 1 query por aula, sequencial. Aulas antigas não têm student_fk,
    // então essas caem na busca por nome — numa query só, por professor.
    const needsNameLookup = lessons.filter(l => !l.student_fk && l.studentname);
    const studentIdByLessonKey = new Map<string, string>();

    if (needsNameLookup.length) {
      const { data: candidates } = await supabase
        .from('student')
        .select('idstudent, name, idusers_fk')
        .in('idusers_fk', [...new Set(needsNameLookup.map(l => l.idusers_fk))]);

      // Case-insensitive, igual ao ilike original.
      const byKey = new Map<string, string>();
      for (const s of candidates ?? []) {
        byKey.set(`${s.idusers_fk}::${(s.name ?? '').trim().toLowerCase()}`, s.idstudent);
      }
      for (const l of needsNameLookup) {
        const found = byKey.get(`${l.idusers_fk}::${(l.studentname ?? '').trim().toLowerCase()}`);
        if (found) studentIdByLessonKey.set(l.idlesson, found);
      }
    }

    const targets = lessons
      .map(lesson => ({
        lesson,
        studentId: lesson.student_fk || studentIdByLessonKey.get(lesson.idlesson) || null,
      }))
      .filter((t): t is { lesson: typeof lessons[number]; studentId: string } => !!t.studentId)
      .map(t => ({
        ...t,
        msg: `Sua aula de ${t.lesson.instrument || 'música'}${t.lesson.teachername ? ` com ${t.lesson.teachername}` : ''} começa daqui a pouco: hoje, ${fmtDate(t.lesson.date)} às ${t.lesson.starttime}.`,
      }));

    if (!targets.length) {
      return NextResponse.json({ date: today, window: '65min', reminded: 0, emailed: 0 });
    }

    // ── Idempotência em LOTE ─────────────────────────────────────────────────
    // Uma query traz os lembretes já enviados hoje a estes alunos; a comparação
    // por mensagem passa a ser em memória, não 1 query por aula.
    const { data: sentToday } = await supabase
      .from('notification')
      .select('idstudent_fk, message')
      .in('idstudent_fk', [...new Set(targets.map(t => t.studentId))])
      .eq('type', 'lembrete')
      .gte('created_at', `${today}T00:00:00`);

    const alreadySent = new Set((sentToday ?? []).map(n => `${n.idstudent_fk}::${n.message}`));
    const pending = targets.filter(t => !alreadySent.has(`${t.studentId}::${t.msg}`));

    if (!pending.length) {
      return NextResponse.json({ date: today, window: '65min', reminded: 0, emailed: 0 });
    }

    // ── Insert em lote ───────────────────────────────────────────────────────
    const { error: notifErr } = await supabase.from('notification').insert(
      pending.map(t => ({
        idstudent_fk: t.studentId,
        idusers_fk: t.lesson.idusers_fk,
        recipient: 'student',
        type: 'lembrete',
        title: 'Sua aula é daqui a pouco',
        message: t.msg,
        read: false,
      }))
    );
    if (notifErr) {
      console.error('Cron aula-1h: erro ao criar notificações:', notifErr.message);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    // Salas virtuais dos professores envolvidos — uma query só para o lote.
    const meetLinks = await getTeacherMeetLinks(pending.map(t => t.lesson.idusers_fk));

    // ── E-mails em paralelo ──────────────────────────────────────────────────
    // Eram sequenciais: N × latência do EmailJS, a causa mais provável de
    // estourar o timeout da função conforme a base cresce.
    const results = await Promise.allSettled(
      // O recado do professor e o link da sala vão só no e-mail: a mensagem
      // gravada na notificação precisa ficar estável para a idempotência acima.
      pending.map(t => {
        const meetLink = meetLinks.get(t.lesson.idusers_fk);
        return emailStudent(t.studentId, {
          title: 'Sua aula é daqui a pouco',
          message: t.msg + lessonMeetLineForEmail(meetLink) + lessonObsForEmail(t.lesson.obs),
          ...lessonEmailCta(meetLink),
        });
      })
    );
    const emailed = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;

    return NextResponse.json({ date: today, window: '65min', reminded: pending.length, emailed });
  } catch (err: any) {
    console.error('Cron aula-1h: erro inesperado:', err?.message || err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
