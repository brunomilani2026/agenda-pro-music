/**
 * Realinha student.expirationdate ao dia do ciclo das faturas.
 *
 *   node scripts/fix-vencimento-plano.mjs            # dry-run (padrao)
 *   node scripts/fix-vencimento-plano.mjs --apply    # grava
 *
 * Corrige o estrago de dois bugs em payment.service.ts (ja consertados no
 * codigo), que escorregavam o DIA do vencimento do plano a cada pagamento:
 *
 *  1. a base do proximo ciclo era `max(hoje, expirationdate)`, entao quem
 *     pagava ATRASADO levava o dia do ciclo para a data do pagamento
 *     (vence 17/07, paga 28/07 -> plano vai para 28/08, faturas seguem no 17);
 *  2. `getLocalISODate(new Date())` lia o relogio do servidor (UTC), entao
 *     pagamento confirmado depois das 21:00 BRT empurrava +1 dia por ciclo.
 *
 * A fonte de verdade e a FATURA: e ela que o aluno ve, paga e sobre a qual o
 * cron dispara cobranca. O plano se realinha a ela, nunca o contrario.
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

const RECORRENTES = { mensal: 1, trimestral: 3, semestral: 6 };

/** Mesma funcao de lib/utils.ts — preserva o dia e nao estoura em mes curto. */
const addMonthsKeepDay = (iso, months) => {
  const [y, m, d] = iso.split('-').map(Number);
  const ref = new Date(y, m - 1 + months, 1);
  const ultimoDia = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const day = Math.min(d, ultimoDia);
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const main = async () => {
  console.log(APPLY ? '### MODO GRAVACAO (--apply) ###\n' : '### DRY-RUN — nada sera gravado ###\n');

  // Relogio de Sao Paulo — mesma razao do bug 2 acima.
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  console.log(`Hoje em Sao Paulo: ${hoje}\n`);

  const { data: students, error: sErr } = await supabase
    .from('student')
    .select('idstudent, name, packagetype, expirationdate, status');
  if (sErr) throw new Error(`student: ${sErr.message}`);

  const { data: payments, error: pErr } = await supabase
    .from('payment')
    .select('id, idstudent_fk, duedate, paymentdate, status, amount, lesson_fk, credits_qty')
    .order('duedate', { ascending: true });
  if (pErr) throw new Error(`payment: ${pErr.message}`);

  const porAluno = new Map();
  for (const p of payments ?? []) {
    porAluno.set(p.idstudent_fk, [...(porAluno.get(p.idstudent_fk) ?? []), p]);
  }

  const correcoes = [];

  for (const s of students ?? []) {
    const meses = RECORRENTES[(s.packagetype || '').toLowerCase()];
    if (!meses || !s.expirationdate) continue;

    // Mensalidades apenas: aula avulsa (lesson_fk) e compra de creditos
    // (credits_qty) nao fazem parte do ciclo do plano. Mesma regra que
    // payment.service.ts usa para decidir se o pagamento avanca o vencimento.
    const faturas = (porAluno.get(s.idstudent) ?? []).filter(
      p => !p.lesson_fk && !p.credits_qty && p.status !== 'cancelado'
    );
    if (!faturas.length) continue;

    // O plano vale ate o fim do periodo EFETIVAMENTE PAGO. Nao se avanca ate
    // "passar de hoje" como no fluxo de confirmacao de pagamento: aqui e uma
    // reconstrucao historica, e empurrar para o futuro daria um ciclo gratis a
    // quem esta inadimplente (o caso do aluno bloqueado com fatura vencida).
    const pagas = faturas.filter(p => p.status === 'pago');
    const sugerido = pagas.length
      ? addMonthsKeepDay(pagas[pagas.length - 1].duedate, meses)
      : faturas[0].duedate; // nunca pagou: vence na primeira fatura emitida

    if (sugerido === s.expirationdate) continue;

    correcoes.push({ s, ultima: faturas[faturas.length - 1], pagas, sugerido });
  }

  if (!correcoes.length) {
    console.log('Nenhum aluno desalinhado. Nada a fazer.');
    return;
  }

  console.log(`ALUNOS A CORRIGIR: ${correcoes.length}\n`);
  for (const { s, ultima, pagas, sugerido } of correcoes) {
    const ultimaPaga = pagas.length ? pagas[pagas.length - 1] : null;
    console.log(`  ${s.name}  [${s.packagetype}, ${s.status}]`);
    console.log(`     ultima fatura PAGA : ${ultimaPaga ? `${ultimaPaga.duedate}  (pago em ${ultimaPaga.paymentdate || '?'})` : 'nenhuma'}`);
    console.log(`     ultima fatura      : ${ultima.duedate}  (${ultima.status})`);
    console.log(`     plano  ATUAL       : ${s.expirationdate}`);
    console.log(`     plano  NOVO        : ${sugerido}`);
    console.log(`     situacao           : ${sugerido < hoje ? 'VENCIDO (coerente com fatura em aberto)' : 'em dia'}`);
    console.log('');
  }

  if (!APPLY) {
    console.log('Nada gravado. Rode com --apply para aplicar.');
    return;
  }

  let ok = 0;
  for (const { s, sugerido } of correcoes) {
    const { error } = await supabase
      .from('student')
      .update({ expirationdate: sugerido })
      .eq('idstudent', s.idstudent);
    if (error) console.error(`  ERRO ${s.name}: ${error.message}`);
    else ok++;
  }

  console.log(`ALUNOS atualizados: ${ok}/${correcoes.length}`);
};

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
