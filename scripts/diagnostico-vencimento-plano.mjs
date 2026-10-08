/**
 * Diagnostico: student.expirationdate desalinhado do ciclo das faturas.
 *
 *   node scripts/diagnostico-vencimento-plano.mjs
 *
 * Somente leitura — este script NUNCA grava.
 *
 * O bug: em payment.service.ts, ao confirmar uma mensalidade, o vencimento do
 * plano avanca a partir de `max(hoje, expirationdate)`. Quem paga ATRASADO tem
 * a base trocada pela data do pagamento, e o dia do ciclo escorrega:
 *
 *   plano vence 17/07 -> aluno paga em 28/07 -> plano vai para 28/08
 *   fatura seguinte   -> addMonthsKeepDay(17/07) -> 17/08
 *
 * Resultado: a ficha diz um dia e o financeiro diz outro. Este script mede
 * quantos alunos ja escorregaram e qual seria o dia correto (o das faturas).
 *
 * Saida sem acentos de proposito — codepage do console do Windows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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

const RECORRENTES = { mensal: 1, trimestral: 3, semestral: 6 };
const dia = iso => (iso || '').slice(8, 10);

const main = async () => {
  console.log('### DIAGNOSTICO — somente leitura ###\n');

  const { data: students, error: sErr } = await supabase
    .from('student')
    .select('idstudent, name, packagetype, expirationdate, status, idusers_fk');
  if (sErr) throw new Error(`student: ${sErr.message}`);

  const recorrentes = (students ?? []).filter(
    s => RECORRENTES[(s.packagetype || '').toLowerCase()] && s.expirationdate
  );

  console.log(`Alunos com plano recorrente e vencimento definido: ${recorrentes.length}\n`);

  const { data: payments, error: pErr } = await supabase
    .from('payment')
    .select('id, idstudent_fk, duedate, paymentdate, status, amount, lesson_fk, credits_qty, notes')
    .order('duedate', { ascending: true });
  if (pErr) throw new Error(`payment: ${pErr.message}`);

  const porAluno = new Map();
  for (const p of payments ?? []) {
    porAluno.set(p.idstudent_fk, [...(porAluno.get(p.idstudent_fk) ?? []), p]);
  }

  const desalinhados = [];

  for (const s of recorrentes) {
    // Mensalidades = faturas que nao sao de aula avulsa nem de compra de
    // creditos. Mesma regra que payment.service.ts usa para decidir se o
    // pagamento avanca o ciclo do plano.
    const faturas = (porAluno.get(s.idstudent) ?? []).filter(
      p => !p.lesson_fk && !p.credits_qty && p.status !== 'cancelado'
    );
    if (!faturas.length) continue;

    const ultima = faturas[faturas.length - 1];
    const diaPlano = dia(s.expirationdate);
    const diaFatura = dia(ultima.duedate);

    if (diaPlano !== diaFatura) {
      desalinhados.push({ s, faturas, ultima, diaPlano, diaFatura });
    }
  }

  if (!desalinhados.length) {
    console.log('Nenhum aluno com vencimento desalinhado. Nada a corrigir.');
    return;
  }

  console.log(`ALUNOS DESALINHADOS: ${desalinhados.length}\n`);

  for (const { s, faturas, ultima, diaPlano, diaFatura } of desalinhados) {
    console.log(`--------------------------------------------------------`);
    console.log(`ALUNO: ${s.name}   (${s.packagetype}, status ${s.status})`);
    console.log(`  idstudent           : ${s.idstudent}`);
    console.log(`  plano vence em      : ${s.expirationdate}   (dia ${diaPlano})`);
    console.log(`  ultima fatura vence : ${ultima.duedate}   (dia ${diaFatura})  [${ultima.status}]`);
    console.log(`  FATURAS (${faturas.length}):`);
    for (const f of faturas) {
      const pago = f.paymentdate ? `  pago em ${f.paymentdate}` : '';
      const atraso = f.paymentdate && f.paymentdate > f.duedate
        ? `  << PAGO COM ATRASO (${Math.round((new Date(f.paymentdate) - new Date(f.duedate)) / 86400000)} dias)`
        : '';
      console.log(`     vence ${f.duedate}  R$ ${Number(f.amount).toFixed(2)}  ${String(f.status).padEnd(9)}${pago}${atraso}`);
    }

    // Dia correto = o das faturas. Reprojeta o vencimento do plano mantendo
    // esse dia, avancando ciclos a partir da ultima fatura ate passar de hoje.
    const meses = RECORRENTES[(s.packagetype || '').toLowerCase()];
    const hoje = new Date().toISOString().slice(0, 10);
    let sugerido = ultima.duedate;
    for (let i = 0; i < 60 && sugerido < hoje; i++) {
      const [y, m, d] = sugerido.split('-').map(Number);
      const ref = new Date(y, m - 1 + meses, 1);
      const ultimoDia = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
      const dd = Math.min(d, ultimoDia);
      sugerido = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    console.log(`  >> SUGERIDO         : ${sugerido}   (era ${s.expirationdate})`);
  }

  console.log(`\n--------------------------------------------------------`);
  console.log(`TOTAL A CORRIGIR: ${desalinhados.length} aluno(s).`);
  console.log('Nada foi gravado — este script e somente leitura.');
};

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
