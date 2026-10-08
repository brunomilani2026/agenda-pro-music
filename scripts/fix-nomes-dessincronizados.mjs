/**
 * Corrige nomes dessincronizados do aluno.
 *
 * A `lesson` guarda `studentname` como cópia denormalizada, e a conta de login
 * guarda `users.fname`. Renomeações feitas por caminhos que não propagavam
 * deixaram esses valores para trás — este script realinha os dois com o
 * `student.name`, que é a fonte de verdade.
 *
 *   node scripts/fix-nomes-dessincronizados.mjs            # dry-run (padrão)
 *   node scripts/fix-nomes-dessincronizados.mjs --apply    # grava
 *
 * Só toca em aulas com `student_fk` preenchido: sem o vínculo não há como saber
 * a qual aluno a aula pertence, e casar por nome poderia atingir um homônimo.
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

const main = async () => {
  console.log(APPLY ? '### MODO GRAVACAO (--apply) ###\n' : '### DRY-RUN — nada sera gravado ###\n');

  const { data: students, error: sErr } = await supabase
    .from('student')
    .select('idstudent, name, account_fk');
  if (sErr) throw new Error(`student: ${sErr.message}`);
  const byId = new Map(students.map(s => [s.idstudent, s]));

  // ── 1. Aulas com nome divergente ───────────────────────────────────────
  const { data: lessons, error: lErr } = await supabase
    .from('lesson')
    .select('idlesson, student_fk, studentname, date, starttime')
    .not('student_fk', 'is', null)
    .order('date');
  if (lErr) throw new Error(`lesson: ${lErr.message}`);

  const staleLessons = lessons.filter(l => {
    const st = byId.get(l.student_fk);
    return st && (l.studentname || '') !== st.name;
  });

  console.log(`AULAS DIVERGENTES: ${staleLessons.length} de ${lessons.length} com vinculo\n`);
  const grouped = new Map();
  for (const l of staleLessons) {
    const st = byId.get(l.student_fk);
    const key = `${l.studentname} -> ${st.name}`;
    grouped.set(key, [...(grouped.get(key) ?? []), l]);
  }
  for (const [key, rows] of grouped) {
    console.log(`  "${key}"  (${rows.length} aulas)`);
    for (const r of rows) console.log(`      ${r.date} ${r.starttime}  ${r.idlesson.slice(0, 8)}`);
  }

  // ── 2. Contas de login com nome divergente ─────────────────────────────
  const withAccount = students.filter(s => s.account_fk);
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('idusers, fname')
    .in('idusers', withAccount.map(s => s.account_fk));
  if (uErr) throw new Error(`users: ${uErr.message}`);
  const userById = new Map(users.map(u => [u.idusers, u]));

  const staleUsers = withAccount.filter(s => {
    const u = userById.get(s.account_fk);
    return u && (u.fname || '') !== s.name;
  });

  console.log(`\nCONTAS DE LOGIN DIVERGENTES: ${staleUsers.length}\n`);
  for (const s of staleUsers) {
    console.log(`  users.fname "${userById.get(s.account_fk).fname}" -> "${s.name}"`);
  }

  if (!APPLY) {
    console.log('\nNada gravado. Rode com --apply para aplicar.');
    return;
  }

  // ── Gravacao ───────────────────────────────────────────────────────────
  let okLessons = 0;
  for (const l of staleLessons) {
    const st = byId.get(l.student_fk);
    const { error } = await supabase
      .from('lesson')
      .update({ studentname: st.name })
      .eq('idlesson', l.idlesson);
    if (error) console.error(`  ERRO aula ${l.idlesson}: ${error.message}`);
    else okLessons++;
  }

  let okUsers = 0;
  for (const s of staleUsers) {
    const { error } = await supabase
      .from('users')
      .update({ fname: s.name })
      .eq('idusers', s.account_fk);
    if (error) console.error(`  ERRO users ${s.account_fk}: ${error.message}`);
    else okUsers++;
  }

  console.log(`\nAULAS atualizadas: ${okLessons}/${staleLessons.length}`);
  console.log(`CONTAS atualizadas: ${okUsers}/${staleUsers.length}`);
};

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
