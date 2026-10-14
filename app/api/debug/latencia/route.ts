import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';

// Diagnóstico de desempenho: mede, DE DENTRO do servidor, o tempo de cada ida ao Supabase.
// Protegido pelo mesmo segredo das rotinas. Não grava nada e não devolve dados do banco.
export const dynamic = 'force-dynamic';

async function medir(url: string, headers: Record<string, string>) {
  const t0 = performance.now();
  const r = await fetch(url, { headers, cache: 'no-store' });
  await r.arrayBuffer();
  return Math.round(performance.now() - t0);
}

export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const chave = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const h = { apikey: chave, Authorization: `Bearer ${chave}` };
  const host = new URL(base).host;

  const t0 = performance.now();
  const enderecos = await lookup(host, { all: true }).catch(() => []);
  const dns_ms = Math.round(performance.now() - t0);

  const saude: number[] = [];
  const consulta: number[] = [];
  for (let i = 0; i < 5; i++) {
    saude.push(await medir(`${base}/auth/v1/health`, { apikey: chave }));
    consulta.push(await medir(`${base}/rest/v1/teacher?select=idteacher&limit=1`, h));
  }
  const paralelo0 = performance.now();
  await Promise.all([
    medir(`${base}/rest/v1/student?select=idstudent&limit=100`, h),
    medir(`${base}/rest/v1/lesson?select=idlesson&limit=1000`, h),
    medir(`${base}/rest/v1/payment?select=id&limit=1000`, h),
  ]);
  const tres_em_paralelo_ms = Math.round(performance.now() - paralelo0);

  return NextResponse.json({
    regiao_da_funcao: process.env.VERCEL_REGION ?? null,
    dns_ms, enderecos: enderecos.map(e => e.address),
    auth_health_ms: saude, consulta_banco_ms: consulta, tres_consultas_em_paralelo_ms: tres_em_paralelo_ms,
  });
}
