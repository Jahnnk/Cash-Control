/**
 * "Corte de datos": hasta qué momento los números de una sede son
 * completos (pedido de Jahnn, 28-jul-2026).
 *
 * El dashboard decía "LIQUIDEZ · HOY" mostrando en realidad la foto del
 * último Excel de Kelly: el lunes 27 exhibía un saldo que era del 24/07
 * a las 6:30 p.m. — con ventas de ese mismo día ya ocurridas después de
 * esa hora. Regla de la casa: una etiqueta que miente es un bug.
 *
 * Fuente: businesses.data_cutoff_at (la fija el import y se puede
 * ajustar la hora en Grupo → Configuración). Fallback pre-migración y
 * para sedes sin corte guardado: el último día CON movimientos.
 */

export type DataCutoff = {
  /** YYYY-MM-DD del corte. null = la sede aún no tiene datos. */
  date: string | null;
  /** "18:30" si el corte fue a media tarde; null = día completo. */
  time: string | null;
  /** true = el corte salió del último movimiento, no de un dato guardado. */
  inferred: boolean;
};

const LIMA = "America/Lima";

/** Fecha (YYYY-MM-DD) y hora (HH:MM) de un timestamp, en hora de Lima. */
export function splitLima(ts: Date): { date: string; time: string } {
  const date = ts.toLocaleDateString("en-CA", { timeZone: LIMA });
  const time = ts.toLocaleTimeString("en-GB", {
    timeZone: LIMA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { date, time };
}

/**
 * Arma el corte a partir de lo guardado y del último movimiento.
 * Un corte a las 23:59 significa "día completo" → no se muestra hora
 * (decir "al 24/07 11:59 p.m." es ruido, no información).
 */
export function buildCutoff(
  storedAt: Date | null,
  lastMovementDate: string | null,
): DataCutoff {
  if (storedAt) {
    const { date, time } = splitLima(storedAt);
    return { date, time: time === "23:59" ? null : time, inferred: false };
  }
  return { date: lastMovementDate, time: null, inferred: true };
}

/** "24/07 6:30 p.m." · "24/07" si el día está completo · "—" sin datos. */
export function formatCutoff(c: DataCutoff): string {
  if (!c.date) return "—";
  const dm = `${c.date.slice(8, 10)}/${c.date.slice(5, 7)}`;
  if (!c.time) return dm;
  const [h, m] = c.time.split(":").map(Number);
  const ampm = h >= 12 ? "p.m." : "a.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dm} ${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** ¿El corte quedó atrás respecto de hoy? (para avisar que falta cargar) */
export function cutoffIsStale(c: DataCutoff, todayLima: string): boolean {
  return c.date !== null && c.date < todayLima;
}
