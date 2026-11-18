import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { enviarPush } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Chamado pelo banco (gatilho em `notification`) a cada notificação nova. Protegido por segredo compartilhado.
export async function POST(request: NextRequest) {
  const segredo = (process.env.PUSH_WEBHOOK_SECRET || '').trim();
  if (!segredo) return NextResponse.json({ error: 'Push não configurado' }, { status: 503 });

  const recebido = request.headers.get('x-push-secret') || '';
  const a = Buffer.from(recebido), b = Buffer.from(segredo);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { record } = await request.json();
    if (!record || typeof record !== 'object') return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
    const r = await enviarPush(record);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    console.error('Push: erro inesperado:', e?.message || e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
