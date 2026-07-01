/**
 * Helpers PUROS del Panel Ejecutivo de Liquidez (sección Saldos del
 * Dashboard). La server action liquidity-panel.ts arma los datos crudos
 * (saldos conocidos por día, netos de efectivo) y estas funciones producen
 * la serie continua, las variaciones y la cobertura. Testeable sin BD.
 */

export type DayPoint = { date: string; value: number };

/** Rango continuo de fechas YYYY-MM-DD, ambos extremos incluidos. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  const stop = new Date(end + "T00:00:00Z");
  while (d <= stop) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Serie del BANCO: para cada día, el último saldo conocido (forward-fill).
 * `seed` es el último saldo conocido ANTES del rango (0 si no hay).
 */
export function forwardFill(
  dates: string[],
  known: Map<string, number>,
  seed: number,
): number[] {
  let last = seed;
  return dates.map((d) => {
    if (known.has(d)) last = known.get(d)!;
    return last;
  });
}

/**
 * Serie de la CAJA: acumulado día a día de los netos de efectivo,
 * partiendo de `base` (acumulado histórico antes del rango).
 */
export function cumulate(
  dates: string[],
  dailyNets: Map<string, number>,
  base: number,
): number[] {
  let acc = base;
  return dates.map((d) => {
    acc += dailyNets.get(d) ?? 0;
    return Math.round(acc * 100) / 100;
  });
}

/** Días de cobertura: liquidez / gasto operativo diario. null si no hay gasto histórico. */
export function runwayDays(liquid: number, dailyExpense: number): number | null {
  if (dailyExpense <= 0) return null;
  return Math.max(0, Math.floor(liquid / dailyExpense));
}

/**
 * Variaciones de la serie (último punto vs ayer y vs hace 7 días).
 * null si la serie no alcanza.
 */
export function seriesDeltas(series: DayPoint[]): { day: number | null; week: number | null } {
  const n = series.length;
  if (n < 2) return { day: null, week: null };
  const last = series[n - 1].value;
  const day = Math.round((last - series[n - 2].value) * 100) / 100;
  const week = n >= 8 ? Math.round((last - series[n - 8].value) * 100) / 100 : null;
  return { day, week };
}

/** Nivel de salud de la liquidez frente al objetivo mínimo (en días). */
export function liquidityLevel(days: number | null): "verde" | "ambar" | "rojo" | "sin-datos" {
  if (days === null) return "sin-datos";
  if (days >= 15) return "verde";
  if (days >= 7) return "ambar";
  return "rojo";
}
