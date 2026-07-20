/**
 * Comparativos de ventas Byte para el deck de la reunión.
 *
 * Tres preguntas del directorio, en una sola tabla:
 *   1. ¿Cuánto vendimos en el rango del informe? ¿más o menos que la
 *      ventana anterior del mismo largo?
 *   2. ¿Cuánto llevamos acumulado en el mes?
 *   3. ¿Vamos mejor o peor que el mes pasado? — comparado a MISMOS DÍAS
 *      transcurridos (día 1 al 15 vs día 1 al 15), nunca mes completo
 *      contra mes a medias (patrón del punto de equilibrio/presupuesto).
 *
 * Función pura: recibe filas y fechas, no toca la BD — testeable.
 */

export type VentaRow = { date: string; total: number };

export type VentasSedeComparison = {
  sede: string;
  /** Venta del rango del informe [ws, we]. */
  rango: number;
  /** Venta de la ventana anterior del mismo largo; null si no hay datos. */
  rangoPrev: number | null;
  deltaRangoPct: number | null;
  /** Acumulado del mes de `we`, del día 1 hasta `we`. */
  mes: number;
  /** Mes pasado a mismos días transcurridos; null si no hay datos. */
  mesPrev: number | null;
  deltaMesPct: number | null;
  /** Última fecha con datos — para saber si falta subir el reporte. */
  hasta: string | null;
  /** De dónde salieron los números: 'byte' = reporte de Ventas oficial;
   * 'registro' = registro diario del panel (respaldo cuando falta el
   * reporte). null si no hubo datos por ninguna vía. */
  fuente: "byte" | "registro" | null;
};

function sum(rows: VentaRow[], from: string, to: string): { total: number; days: number } {
  let total = 0, days = 0;
  for (const r of rows) {
    if (r.date >= from && r.date <= to && r.total > 0) {
      total += r.total;
      days++;
    }
  }
  return { total: Math.round(total * 100) / 100, days };
}

function shiftDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Mismo día del mes anterior, ajustado a fin de mes (31-jul → 30-jun). */
function sameDayPrevMonth(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const lastDay = new Date(py, pm, 0).getDate();
  return `${py}-${String(pm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

function pct(actual: number, prev: number | null): number | null {
  if (prev === null || prev <= 0) return null;
  return Math.round(((actual - prev) / prev) * 10000) / 100;
}

export function compareVentasSede(
  sede: string,
  rows: VentaRow[],
  ws: string,
  we: string,
  fuente: "byte" | "registro" = "byte",
): VentasSedeComparison {
  const rangeDays = Math.round((new Date(we + "T12:00:00Z").getTime() - new Date(ws + "T12:00:00Z").getTime()) / 86400000) + 1;
  const ps = shiftDays(ws, -rangeDays);
  const pe = shiftDays(ws, -1);

  const rango = sum(rows, ws, we);
  const rangoPrev = sum(rows, ps, pe);

  const mesStart = we.slice(0, 7) + "-01";
  const mes = sum(rows, mesStart, we);
  const prevCut = sameDayPrevMonth(we);
  const mesPrev = sum(rows, prevCut.slice(0, 7) + "-01", prevCut);

  const withData = rows.filter((r) => r.total > 0).map((r) => r.date).sort();

  return {
    sede,
    rango: rango.total,
    rangoPrev: rangoPrev.days > 0 ? rangoPrev.total : null,
    deltaRangoPct: rangoPrev.days > 0 ? pct(rango.total, rangoPrev.total) : null,
    mes: mes.total,
    mesPrev: mesPrev.days > 0 ? mesPrev.total : null,
    deltaMesPct: mesPrev.days > 0 ? pct(mes.total, mesPrev.total) : null,
    hasta: withData.length > 0 ? withData[withData.length - 1] : null,
    fuente: withData.length > 0 ? fuente : null,
  };
}
