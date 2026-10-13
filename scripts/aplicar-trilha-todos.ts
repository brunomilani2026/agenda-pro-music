// Aplica uma trilha a todos os alunos ativos e bloqueados (mesma lógica de aplicarTrilha). Só ACRESCENTA; não duplica.
import { readFileSync } from 'node:fs';
import { posicaoNaTrilha } from '../lib/estudos';
const env: Record<string, string> = {};
for (const l of readFileSync('C:/dev/agenda-pro-music-novo/.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); }
const B = env.NEXT_PUBLIC_SUPABASE_URL, H = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' };
const get = async (p: string) => (await fetch(B + p, { headers: H })).json();
const APLICAR = process.argv.includes('--aplicar');
const TRILHA = '87e3b12e-db6d-4319-b0fb-352e94e6d5ea', P = 'fd3d810e-5421-4661-9354-fc45fad77d1a';
(async () => {
  const [trilha] = await get(`/rest/v1/study_track?select=id,name&id=eq.${TRILHA}&idusers_fk=eq.${P}`);
  const modulos = await get(`/rest/v1/study_module?select=id,title,position&track_fk=eq.${TRILHA}&order=position`);
  const itens = await get(`/rest/v1/study_item?select=id,module_fk,title,description,objective,difficulty,competency,position&track_fk=eq.${TRILHA}`);
  const alunos = await get(`/rest/v1/student?select=idstudent,name,status&idusers_fk=eq.${P}&status=in.(ativo,bloqueado)`);
  const ids = alunos.map((a: any) => a.idstudent);
  const ex = await get(`/rest/v1/student_study_item?select=idstudent_fk,source_item_fk&idusers_fk=eq.${P}&idstudent_fk=in.(${ids.join(',')})`);
  const jaTem = new Set(ex.map((e: any) => `${e.idstudent_fk}|${e.source_item_fk}`));
  const indice = new Map(modulos.map((m: any, i: number) => [m.id, { idx: i, title: m.title }]));
  const linhas: any[] = []; let jaTinham = 0;
  for (const a of alunos) for (const it of itens) {
    if (jaTem.has(`${a.idstudent}|${it.id}`)) { jaTinham++; continue; }
    const mod: any = indice.get(it.module_fk); if (!mod) continue;
    linhas.push({ idstudent_fk: a.idstudent, idusers_fk: P, source_item_fk: it.id, track_name: trilha.name, module_title: mod.title, title: it.title, description: it.description,
      objective: it.objective, difficulty: it.difficulty, competency: it.competency, position: posicaoNaTrilha(mod.idx, it.position), status: 'nao_iniciado' });
  }
  console.log(`trilha "${trilha.name}": ${itens.length} conteúdos | alunos: ${alunos.length} | a adicionar: ${linhas.length} | já tinham: ${jaTinham}`);
  if (!APLICAR) return;
  for (let k = 0; k < linhas.length; k += 300) {
    const r = await fetch(`${B}/rest/v1/student_study_item`, { method: 'POST', headers: H, body: JSON.stringify(linhas.slice(k, k + 300)) });
    if (!r.ok) { console.log('ERRO', r.status, await r.text()); process.exit(1); }
  }
  console.log('gravado:', linhas.length);
})();
