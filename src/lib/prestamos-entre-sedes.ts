/**
 * Préstamos que una sede le hizo a otra (Fonavi y Centro → Atelier, 11-ago-2026) · cálculo PURO.
 *
 * Centro le prestó S/6,000 y Fonavi S/5,000 a Atelier, sin intereses, en 5 cuotas de fin de mes (ago–dic).
 * No hay una tabla de préstamos entre sedes: se arma con lo que ya está en el sistema. El préstamo es la salida
 * «PRESTAMO A ATELIER» de la sede que prestó; cada cuota es un ingreso suyo con «préstamo» y «cuota» en la nota.
 * Lo que falta por devolver es lo prestado menos lo devuelto. Pedido de Jahnn (9-nov-2026): ver ese saldo.
 */

export type PrestamoDado = { prestamistaId: number; prestamista: string; fecha: string; monto: number };
export type CuotaRecibida = { prestamistaId: number; fecha: string; monto: number };

export type PrestamoEntreSedes = {
  prestamistaId: number;
  prestamista: string;
  /** Hacia quién va (por ahora siempre Atelier). */
  deudor: string;
  fecha: string;
  prestado: number;
  devuelto: number;
  pendiente: number;
  cuota: number | null;
  cuotasPagadas: number;
  /** Cuántas cuotas tenía en total (prestado ÷ cuota). null si aún no hubo ninguna. */
  cuotasTotal: number | null;
  /** Cuotas que faltan (redondeado hacia arriba). */
  cuotasFaltan: number | null;
  /** Fin del mes siguiente a la última cuota pagada. null si ya está saldado o no hubo cuotas. */
  proxima: string | null;
  saldado: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function finDeMesSiguiente(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  // Día 0 del mes m+2 = último día del mes m+1.
  return new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
}

export function armarPrestamosEntreSedes(prestamos: PrestamoDado[], cuotas: CuotaRecibida[]): PrestamoEntreSedes[] {
  const out: PrestamoEntreSedes[] = [];
  for (const p of [...prestamos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    // Las cuotas de este préstamo: de la misma sede, después de prestar.
    const mias = cuotas.filter((c) => c.prestamistaId === p.prestamistaId && c.fecha > p.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const devuelto = r2(mias.reduce((t, c) => t + c.monto, 0));
    const pendiente = Math.max(0, r2(p.monto - devuelto));
    const cuota = mias.length ? mias[mias.length - 1].monto : null;
    const saldado = pendiente < 0.5;
    out.push({
      prestamistaId: p.prestamistaId, prestamista: p.prestamista, deudor: "Atelier", fecha: p.fecha,
      prestado: r2(p.monto), devuelto, pendiente, cuota,
      cuotasPagadas: mias.length,
      cuotasTotal: cuota ? Math.round(p.monto / cuota) : null,
      cuotasFaltan: cuota && !saldado ? Math.ceil(pendiente / cuota - 1e-9) : saldado ? 0 : null,
      proxima: !saldado && mias.length ? finDeMesSiguiente(mias[mias.length - 1].fecha) : null,
      saldado,
    });
  }
  return out;
}
