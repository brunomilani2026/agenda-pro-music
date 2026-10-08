import { addMonthsKeepDay, getLocalISODate, nowInSaoPaulo } from '@/lib/utils';

// ============================================================
// Janela de aulas carregadas em memória.
//
// A agenda mostra UMA semana, mas o AppContext carregava o histórico
// inteiro do professor a cada boot. Aqui definimos uma janela padrão
// (alguns meses ao redor de hoje) e o mínimo de álgebra de intervalos
// para saber o que já está carregado e o que falta buscar quando o
// professor navega para fora dela.
//
// Datas são sempre strings ISO 'YYYY-MM-DD' e os intervalos são
// INCLUSIVOS nas duas pontas — nesse formato a comparação
// lexicográfica coincide com a cronológica, então `<=` basta.
// ============================================================

// A janela vai INTEIRA no HTML de toda carga completa (e é hidratada no cliente),
// então cada mês a mais pesa em todo professor — centenas de aulas por ano.
// Passo atrás: 2 meses cobrem o mês corrente do dashboard e as semanas recentes
// da agenda. Passo à frente: a maior recorrência oferecida é "1 Semestre" (24
// semanas ≈ 6 meses), então 7 cobre tudo que o professor consegue pré-agendar
// de uma vez, com folga. Fora da janela nada quebra: a agenda busca a semana
// pedida sob demanda (ensureRangeLoaded) e o servidor é quem decide conflitos.
export const WINDOW_MONTHS_BACK = 2;
export const WINDOW_MONTHS_FORWARD = 7;

export interface LessonWindow {
  from: string; // YYYY-MM-DD, inclusivo
  to: string;   // YYYY-MM-DD, inclusivo
}

/**
 * Janela padrão do boot, ancorada em "hoje" no fuso de Brasília.
 *
 * ⚠️ Calcular SEMPRE no servidor. Um dispositivo em outro fuso derivaria
 * um "hoje" diferente e responderia errado a `rangeCovers` — a agenda
 * acharia que uma semana está carregada quando não está.
 */
export function computeDefaultWindow(now: Date = nowInSaoPaulo()): LessonWindow {
  const today = getLocalISODate(now);
  return {
    from: addMonthsKeepDay(today, -WINDOW_MONTHS_BACK),
    to: addMonthsKeepDay(today, WINDOW_MONTHS_FORWARD),
  };
}

/** Ordena por início e funde intervalos que se tocam ou se sobrepõem. */
function coalesce(ranges: LessonWindow[]): LessonWindow[] {
  if (ranges.length <= 1) return [...ranges];
  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
  const out: LessonWindow[] = [sorted[0]];
  for (const r of sorted.slice(1)) {
    const last = out[out.length - 1];
    // `<=` (e não `<`) para fundir também intervalos apenas adjacentes:
    // dois dias contíguos carregados separadamente viram um só.
    if (r.from <= nextDay(last.to)) {
      if (r.to > last.to) out[out.length - 1] = { from: last.from, to: r.to };
    } else {
      out.push(r);
    }
  }
  return out;
}

/** Dia seguinte a uma data ISO, em ISO. */
function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return getLocalISODate(new Date(y, m - 1, d + 1));
}

/** Insere um intervalo na lista de carregados, fundindo o que der. */
export function mergeRange(ranges: LessonWindow[], next: LessonWindow): LessonWindow[] {
  return coalesce([...ranges, next]);
}

/** true se [from, to] estiver inteiramente coberto por algum intervalo já carregado. */
export function rangeCovers(ranges: LessonWindow[], from: string, to: string): boolean {
  return coalesce(ranges).some(r => r.from <= from && r.to >= to);
}

/**
 * Pedaços de [from, to] que ainda NÃO estão carregados.
 * Vazio significa que não há nada a buscar.
 */
export function missingSubRanges(ranges: LessonWindow[], from: string, to: string): LessonWindow[] {
  const covered = coalesce(ranges);
  const gaps: LessonWindow[] = [];
  let cursor = from;

  for (const r of covered) {
    if (r.to < cursor) continue;   // termina antes do que falta
    if (r.from > to) break;        // começa depois do que falta
    if (r.from > cursor) gaps.push({ from: cursor, to: prevDay(r.from) });
    if (r.to >= cursor) cursor = nextDay(r.to);
    if (cursor > to) return gaps;
  }

  if (cursor <= to) gaps.push({ from: cursor, to });
  return gaps;
}

/** Dia anterior a uma data ISO, em ISO. */
function prevDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return getLocalISODate(new Date(y, m - 1, d - 1));
}
