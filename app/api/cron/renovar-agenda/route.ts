import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getLocalISODate } from '@/lib/utils';
import { JANELA_HISTORICO_DIAS, planejarRenovacao } from '@/lib/renovacao-agenda';

export const dynamic = 'force-dynamic';

/**
 * Renovação automática da agenda: mantém criadas as aulas das próximas semanas dos alunos de horário fixo.
 * Regras em lib/renovacao-agenda.ts. Não envia notificação, e-mail nem crédito.
 * `?simular=1` só devolve o que seria criado, sem gravar nada.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const simular = request.nextUrl.searchParams.get('simular') === '1';

  try {
    const db = createAdminClient();
    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hoje = getLocalISODate(agora);
    const desde = new Date(agora.getTime() - JANELA_HISTORICO_DIAS * 86400000 - 86400000);

    const { data: professores, error } = await db.from('users').select('idusers').eq('usertype', 'professor').eq('accountstatus', 'approved');
    if (error) throw new Error(error.message);

    const resultado: Record<string, unknown>[] = [];
    for (const prof of professores ?? []) {
      const dono = prof.idusers as string;
      try {
        const aulas: any[] = [];
        for (let de = 0; ; de += 1000) {
          const { data, error: e } = await db.from('lesson')
            .select('idlesson, date, datelesson, starttime, endtime, instrument, lessonstatus, obs, student_fk, studentname, teachername')
            .eq('idusers_fk', dono).gte('datelesson', desde.toISOString()).range(de, de + 999);
          if (e) throw new Error(e.message);
          aulas.push(...(data ?? []));
          if ((data ?? []).length < 1000) break;
        }
        const [{ data: alunos }, { data: bloqueios }, { data: folgas }] = await Promise.all([
          db.from('student').select('idstudent, name, status, packagetype, expirationdate, idusers_fk').eq('idusers_fk', dono),
          db.from('blocked_slot').select('date, starttime, endtime').eq('idusers_fk', dono).gte('date', hoje),
          db.from('teacher_day_off').select('day_of_week').eq('idusers_fk', dono),
        ]);

        const plano = planejarRenovacao({ alunos: alunos ?? [], aulas, bloqueios: bloqueios ?? [], folgas: folgas ?? [], hojeIso: hoje });
        let gravadas = 0;
        if (!simular) {
          for (let i = 0; i < plano.criar.length; i += 200) {
            const lote = plano.criar.slice(i, i + 200);
            const { data, error: e } = await db.from('lesson').insert(lote).select('idlesson');
            if (e) throw new Error(e.message);
            gravadas += data?.length ?? 0;
          }
        }
        resultado.push({ professor: dono, simulacao: simular, aCriar: plano.criar.length, gravadas, resumo: plano.resumo, puladas: plano.puladas });
      } catch (e: any) {
        console.error('Renovação da agenda: falha para um professor:', e?.message || e);
        resultado.push({ professor: dono, erro: true });
      }
    }
    return NextResponse.json({ ok: true, resultado });
  } catch (err: any) {
    console.error('Renovação da agenda: erro:', err?.message || err);
    return NextResponse.json({ error: 'Falha' }, { status: 500 });
  }
}
