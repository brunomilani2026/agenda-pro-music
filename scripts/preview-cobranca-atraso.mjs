/**
 * Preview de quem receberia o lembrete diario de atraso.
 *
 *   node scripts/preview-cobranca-atraso.mjs
 *
 * Somente leitura — NAO envia e-mail, NAO grava nada. Espelha o predicado de
 * PaymentService.sendOverdueReminders() para conferir o alcance antes de a
 * rotina rodar de verdade no cron.
 *
 * Saida sem acentos de proposito — codepage do console do Windows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const MAX_DAYS = 30;                 // = OVERDUE_REMINDER_MAX_DAYS
const START_DATE = '2026-08-22';     // = OVERDUE_REMINDER_START_DATE
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const pad = n => String(n).padStart(2, '0');
const daysBetween = (a, b) => {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
};

const main = async () => {
  console.log('### PREVIEW — nenhum e-mail sera enviado ###\n');

  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const today = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
  const piso = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - MAX_DAYS);
  const janela = `${piso.getFullYear()}-${pad(piso.getMonth() + 1)}-${pad(piso.getDate())}`;
  const floor = janela > START_DATE ? janela : START_DATE;

  console.log(`Hoje: ${today}   |   Janela: ${floor} ate ${today} (max ${MAX_DAYS} dias)`);
  if (floor === START_DATE) {
    console.log(`Corte de ativacao: faturas vencidas antes de ${START_DATE} nao sao cobradas.`);
  }
  console.log('');

  const { data: rows, error } = await supabase
    .from('payment')
    .select('id, idstudent_fk, amount, duedate, status')
    .eq('status', 'vencido')
    .gte('duedate', floor)
    .lt('duedate', today)
    .order('duedate', { ascending: true });
  if (error) throw new Error(`payment: ${error.message}`);

  if (!rows?.length) {
    console.log('Nenhuma fatura vencida na janela. Ninguem receberia e-mail hoje.');
    return;
  }

  const ids = [...new Set(rows.map(r => r.idstudent_fk).filter(Boolean))];
  const { data: students } = await supabase
    .from('student')
    .select('idstudent, name, email, status')
    .in('idstudent', ids);
  const byId = new Map((students ?? []).map(s => [s.idstudent, s]));

  // Mesma trava da rotina: no maximo um aviso de cobranca por aluno por dia.
  const { data: hoje } = await supabase
    .from('notification')
    .select('idstudent_fk')
    .eq('type', 'cobranca')
    .gte('created_at', `${today}T00:00:00`);
  const jaAvisados = new Set((hoje ?? []).map(n => n.idstudent_fk));

  const vistos = new Set();
  let enviaria = 0;

  for (const p of rows) {
    if (!p.idstudent_fk || vistos.has(p.idstudent_fk)) continue;
    vistos.add(p.idstudent_fk);

    const s = byId.get(p.idstudent_fk);
    const dias = daysBetween(p.duedate, today);
    const pulado = jaAvisados.has(p.idstudent_fk);

    console.log(`  ${pulado ? '[PULA]  ' : '[ENVIA] '} ${s?.name || '(aluno desconhecido)'}`);
    console.log(`            e-mail : ${s?.email || '(SEM E-MAIL — nao recebe)'}`);
    console.log(`            fatura : R$ ${Number(p.amount).toFixed(2)}  vencida em ${p.duedate}  (${dias} dias)`);
    console.log(`            aluno  : ${s?.status || '?'}`);
    if (pulado) console.log(`            motivo : ja recebeu aviso de cobranca hoje`);
    console.log('');

    if (!pulado && s?.email) enviaria++;
  }

  console.log(`--------------------------------------------------------`);
  console.log(`E-MAILS QUE SAIRIAM AGORA: ${enviaria}`);
  console.log('Nenhum e-mail foi enviado — este script e somente leitura.');
};

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
