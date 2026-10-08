/**
 * Aulas 'agendada' cujo horario ja passou — deveriam estar 'realizada'.
 *
 *   node scripts/dry-run-aulas-realizadas.mjs            # dry-run (padrao)
 *   node scripts/dry-run-aulas-realizadas.mjs --apply    # grava
 *
 * A transicao automatica agendada -> realizada so rodava quando o ALUNO abria a
 * area dele, e so para as aulas DAQUELE aluno. Quem nunca logou ficou com a
 * agenda amarela para sempre. Este script mede o estrago acumulado antes de
 * ligar a rotina automatica (services/lesson-autocomplete.service.ts).
 *
 * O predicado aqui e o MESMO daquele modulo. Mudou la, muda aqui.
 *
 * Filtra por `datelesson` (TIMESTAMPTZ), NUNCA por `date` (VARCHAR com linhas
 * legadas em DD/MM/YYYY): lexicograficamente '19/03/2027' < '2026-08-22', entao
 * um filtro sobre `date` trataria aula FUTURA legada como passada.
 *
 * Saida sem acentos de proposito — codepage do console do Windows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
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
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const COLS = 'idlesson, studentname, teachername, idusers_fk, date, datelesson, starttime, endtime, lessonstatus';

const main = async () => {
  console.log(APPLY ? '### MODO GRAVACAO (--apply) ###\n' : '### DRY-RUN — nada sera gravado ###\n');

  // Relogio de Sao Paulo: o servidor roda em UTC e as 22:00 BRT `new Date()`
  // ja virou o dia — o corte marcaria aulas de hoje como passadas.
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const today = iso(now);
  const tomorrow = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  console.log(`Agora em Sao Paulo: ${today} ${hhmm}\n`);

  // `datelesson` e gravado como <dia>T12:00:00Z — marcador de dia, nao instante.
  // Logo datelesson < <hoje>T00:00:00Z equivale a dia < hoje, com 12h de folga.
  const [pastDays, endedToday] = await Promise.all([
    supabase.from('lesson').select(COLS)
      .eq('lessonstatus', 'agendada')
      .lt('datelesson', `${today}T00:00:00.000Z`),
    supabase.from('lesson').select(COLS)
      .eq('lessonstatus', 'agendada')
      .gte('datelesson', `${today}T00:00:00.000Z`)
      .lt('datelesson', `${tomorrow}T00:00:00.000Z`)
      .lt('endtime', hhmm),
  ]);

  if (pastDays.error) throw new Error(`lesson (dias passados): ${pastDays.error.message}`);
  if (endedToday.error) throw new Error(`lesson (hoje): ${endedToday.error.message}`);

  const rows = [...(pastDays.data ?? []), ...(endedToday.data ?? [])]
    .map(l => ({ ...l, dia: new Date(l.datelesson).toISOString().slice(0, 10) }))
    .sort((a, b) => a.dia.localeCompare(b.dia) || (a.starttime || '').localeCompare(b.starttime || ''));

  if (!rows.length) {
    console.log('Nenhuma aula pendente de marcacao. Nada a fazer.');
    return;
  }

  console.log(`TOTAL: ${rows.length} aulas`);
  console.log(`  dias anteriores a hoje : ${pastDays.data?.length ?? 0}`);
  console.log(`  hoje, ja terminadas    : ${endedToday.data?.length ?? 0}`);
  console.log(`MAIS ANTIGA: ${rows[0].dia}`);
  console.log(`MAIS RECENTE: ${rows[rows.length - 1].dia}`);

  // ── Por mes — e aqui que se ve cauda antiga que talvez nunca tenha ocorrido ──
  console.log('\nPOR MES:');
  const porMes = new Map();
  for (const r of rows) {
    const m = r.dia.slice(0, 7);
    porMes.set(m, (porMes.get(m) ?? 0) + 1);
  }
  for (const [mes, n] of [...porMes].sort()) {
    console.log(`  ${mes}  ${String(n).padStart(4)}  ${'#'.repeat(Math.min(n, 60))}`);
  }

  // ── Por professor + aluno ───────────────────────────────────────────────
  console.log('\nPOR PROFESSOR / ALUNO:');
  const porAluno = new Map();
  for (const r of rows) {
    const key = `${r.teachername || '(sem professor)'} | ${r.studentname || '(sem aluno)'}`;
    const acc = porAluno.get(key) ?? { n: 0, min: r.dia, max: r.dia };
    acc.n++;
    if (r.dia < acc.min) acc.min = r.dia;
    if (r.dia > acc.max) acc.max = r.dia;
    porAluno.set(key, acc);
  }
  for (const [key, a] of [...porAluno].sort((x, y) => y[1].n - x[1].n)) {
    console.log(`  ${String(a.n).padStart(4)}  ${key}   (${a.min} a ${a.max})`);
  }

  // ── Amostra das mais antigas ────────────────────────────────────────────
  console.log('\nAMOSTRA (20 mais antigas):');
  for (const r of rows.slice(0, 20)) {
    console.log(`  ${r.dia}  ${r.starttime || '--:--'}-${r.endtime || '--:--'}  ${r.idlesson.slice(0, 8)}  ${r.studentname || ''}`);
  }

  // ── Sanidade: linhas que o filtro antigo (sobre `date`) errava ──────────
  const legadas = rows.filter(r => !r.date || r.date.includes('/'));
  console.log(`\nLINHAS COM 'date' LEGADA (vazia ou DD/MM/YYYY): ${legadas.length}`);
  if (legadas.length) {
    console.log("  (essas sao as que o filtro antigo sobre `date` tratava errado)");
  }

  if (!APPLY) {
    console.log('\nNada gravado. Rode com --apply para aplicar.');
    return;
  }

  // ── Gravacao em lotes ───────────────────────────────────────────────────
  // O .eq('lessonstatus','agendada') fica como trava: se a aula mudou de status
  // entre a leitura e a escrita, esta linha simplesmente nao casa.
  let ok = 0;
  const ids = rows.map(r => r.idlesson);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await supabase
      .from('lesson')
      .update({ lessonstatus: 'realizada' })
      .eq('lessonstatus', 'agendada')
      .in('idlesson', chunk)
      .select('idlesson');
    if (error) console.error(`  ERRO lote ${i / 500 + 1}: ${error.message}`);
    else ok += data?.length ?? 0;
  }

  console.log(`\nAULAS marcadas como realizada: ${ok}/${ids.length}`);
};

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
