/**
 * Comparativo "este mes vs el mes pasado" — el que alimenta la alerta
 * de ventas del dashboard (auditoría de Jahnn, 28-jul-2026).
 *
 * EL BUG QUE ORIGINÓ ESTA LIB: la alerta comparaba TODO lo que llevaba
 * el mes actual contra el mes pasado hasta el mismo NÚMERO de día del
 * calendario, sin mirar si ambos lados tenían la misma cantidad de días
 * CON DATOS. El lunes 27, Fonavi tenía datos hasta el 24 (Kelly sube los
 * viernes): comparaba 24 días contra 27 y gritaba "-22.7%". Peor en
 * Centro: 24 días de julio contra los 7 días de junio que había en el
 * sistema → "+167.8%" de crecimiento inventado.
 *
 * DOS LECTURAS, porque ninguna sola dice la verdad completa:
 *
 *  1. `sameDay` — mismo número de día, SOLO los días presentes en AMBOS
 *     meses. Es la lectura literal ("día 1 vs día 1") y la que se
 *     muestra como titular: es la que el dueño puede auditar a mano.
 *
 *  2. `weekdayAligned` — empareja el 1er lunes con el 1er lunes, el 2do
 *     sábado con el 2do sábado… En una cafetería el fin de semana vende
 *     distinto a un martes, y cuando los meses empiezan en días de
 *     semana diferentes (jun-2026 arrancó lunes, jul-2026 miércoles) la
 *     lectura literal mezcla peras con manzanas. Va como contexto.
 *
 * Función PURA: recibe filas y devuelve números; no toca la BD.
 */

export type DayRow = { date: string; total: number };

export type MonthCompareView = {
  current: number;
  previous: number;
  /** Variación % (null si el mes pasado no tiene con qué comparar). */
  pct: number | null;
  /** Días efectivamente comparados (pares con dato en ambos meses). */
  daysCompared: number;
};

export type MonthComparison = {
  /** Lectura literal: mismo número de día, días presentes en ambos. */
  sameDay: MonthCompareView;
  /** Lectura alineada por día de semana (lunes con lunes). */
  weekdayAligned: MonthCompareView;
  /** Días de desfase entre el 1° de un mes y el 1° del otro (0 = igual). */
  weekdayShift: number;
  /** Último día del mes actual con datos (para decir "al día N"). */
  throughDay: number | null;
  /** true = hay tan pocos días comparables que el % no es confiable. */
  lowCoverage: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Día del mes (1-31) de una fecha YYYY-MM-DD. */
function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Día de la semana 0-6 (domingo=0), estable e independiente de zona. */
function weekday(iso: string): number {
  return new Date(iso + "T12:00:00Z").getUTCDay();
}

/** Menos de este número de días comparados → el % no es confiable. */
export const MIN_DAYS_CONFIABLE = 10;

function view(pairs: { cur: number; prev: number }[]): MonthCompareView {
  const current = r2(pairs.reduce((s, p) => s + p.cur, 0));
  const previous = r2(pairs.reduce((s, p) => s + p.prev, 0));
  return {
    current,
    previous,
    pct: previous > 0 ? r2(((current - previous) / previous) * 100) : null,
    daysCompared: pairs.length,
  };
}

export function compareMonths(current: DayRow[], previous: DayRow[]): MonthComparison {
  const cur = current.filter((r) => r.total > 0);
  const prev = previous.filter((r) => r.total > 0);

  // ── 1. Mismo número de día, solo los presentes en AMBOS meses ──
  const prevByDay = new Map(prev.map((r) => [dayOfMonth(r.date), r.total]));
  const samePairs: { cur: number; prev: number }[] = [];
  for (const r of cur) {
    const p = prevByDay.get(dayOfMonth(r.date));
    if (p !== undefined) samePairs.push({ cur: r.total, prev: p });
  }

  // ── 2. Alineado por día de semana: n-ésimo lunes con n-ésimo lunes ──
  const bucket = (rows: DayRow[]) => {
    const m = new Map<number, number[]>();
    for (const r of rows) {
      const k = weekday(r.date);
      const list = m.get(k) ?? [];
      list.push(r.total);
      m.set(k, list);
    }
    return m;
  };
  const curW = bucket(cur);
  const prevW = bucket(prev);
  const wPairs: { cur: number; prev: number }[] = [];
  for (const [dow, cs] of curW) {
    const ps = prevW.get(dow) ?? [];
    const n = Math.min(cs.length, ps.length);
    for (let i = 0; i < n; i++) wPairs.push({ cur: cs[i], prev: ps[i] });
  }

  const sameDay = view(samePairs);
  const weekdayAligned = view(wPairs);

  // Desfase de arranque: qué tan distinto empieza cada mes.
  let weekdayShift = 0;
  if (cur.length > 0 && prev.length > 0) {
    const c1 = `${cur[0].date.slice(0, 8)}01`;
    const p1 = `${prev[0].date.slice(0, 8)}01`;
    weekdayShift = (weekday(c1) - weekday(p1) + 7) % 7;
  }

  return {
    sameDay,
    weekdayAligned,
    weekdayShift,
    throughDay: cur.length > 0 ? dayOfMonth(cur[cur.length - 1].date) : null,
    lowCoverage: sameDay.daysCompared < MIN_DAYS_CONFIABLE,
  };
}
