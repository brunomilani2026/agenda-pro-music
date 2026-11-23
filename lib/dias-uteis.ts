// Dia útil = não é sábado, domingo nem feriado nacional. Todo vencimento de fatura passa por aqui.
// Módulo puro (sem banco). Datas sempre em 'YYYY-MM-DD'.

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function somarDiasIso(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher).
function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

const cache = new Map<number, Set<string>>();

/** Feriados nacionais do ano (os fixos + Sexta-feira Santa). Não inclui Carnaval nem Corpus Christi (são pontos facultativos). */
export function feriadosNacionais(ano: number): Set<string> {
  let s = cache.get(ano);
  if (!s) {
    s = new Set([
      iso(ano, 1, 1),   // Confraternização Universal
      somarDiasIso(pascoa(ano), -2), // Sexta-feira Santa
      iso(ano, 4, 21),  // Tiradentes
      iso(ano, 5, 1),   // Dia do Trabalho
      iso(ano, 9, 7),   // Independência
      iso(ano, 10, 12), // Nossa Senhora Aparecida
      iso(ano, 11, 2),  // Finados
      iso(ano, 11, 15), // Proclamação da República
      iso(ano, 11, 20), // Consciência Negra
      iso(ano, 12, 25), // Natal
    ]);
    cache.set(ano, s);
  }
  return s;
}

export function ehDiaUtil(data: string): boolean {
  const dow = new Date(`${data}T12:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !feriadosNacionais(Number(data.slice(0, 4))).has(data);
}

/** Se a data cair em fim de semana ou feriado nacional, devolve o próximo dia útil. */
export function proximoDiaUtil(data: string): string {
  let d = data;
  for (let i = 0; i < 10 && !ehDiaUtil(d); i++) d = somarDiasIso(d, 1);
  return d;
}

/**
 * Avança `months` meses a partir de `base` mantendo o dia combinado com o aluno (`diaAncora`, se houver),
 * e ajusta para dia útil. A âncora evita o "escorregão": 29 → 30 (ajustado) → 30 nos meses seguintes.
 */
export function avancarVencimento(base: string, months: number, diaAncora?: number | null): string {
  const [y, m, dBase] = base.split('-').map(Number);
  const dia = diaAncora && diaAncora >= 1 && diaAncora <= 31 ? diaAncora : dBase;
  const ref = new Date(Date.UTC(y, m - 1 + months, 1));
  const ultimo = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0)).getUTCDate();
  const nominal = iso(ref.getUTCFullYear(), ref.getUTCMonth() + 1, Math.min(dia, ultimo));
  return proximoDiaUtil(nominal);
}
