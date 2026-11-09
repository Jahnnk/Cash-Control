/**
 * Financiamientos que se pagan mes a mes (Diners, deuda antigua, congeladora…) · cálculo PURO. Pedido de Jahnn, 9-nov-2026.
 *
 * Cada deuda es de UNA sede y vive en la tabla `financiamientos`. Sus pagos NO se vuelven a escribir: se reconocen entre los
 * egresos «PRÉSTAMOS Y TARJETAS» del Excel, primero por la palabra de su nombre en el concepto («diners») y, si el concepto no la
 * dice («CUOTA SET 2026»), por el día del mes y el monto de la cuota. Lo que no se sabe (monto, cuotas) queda en null y se
 * muestra «falta dato»: nunca se inventa. El saldo es lo original menos lo pagado; si la cuota trae intereses es solo una
 * referencia (aviso en `incluyeIntereses`).
 */

export type Financiamiento = {
  id: number; businessId: number; sede: string; nombre: string; acreedor: string | null; patron: string | null;
  diaPago: number | null; cuota: number | null; montoOriginal: number | null; cuotasTotal: number | null;
  incluyeIntereses: boolean | null; desde: string | null;
};
export type PagoDeuda = { fecha: string; monto: number; concepto: string; businessId: number };

export type EstadoFinanciamiento = Financiamiento & {
  pagado: number; cuotasPagadas: number; ultimoPago: string | null;
  /** Lo que falta devolver. null si no sabemos el monto original. */
  saldo: number | null; cuotasFaltan: number | null;
  /** Qué datos faltan para calcular el saldo, en palabras de Jahnn. */
  faltaDato: string[];
  saldado: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function coincideConcepto(f: Financiamiento, p: PagoDeuda): boolean {
  if (!f.patron) return false;
  try { return new RegExp(f.patron, "i").test(norm(p.concepto)); } catch { return false; }
}
function coincidePorDia(f: Financiamiento, p: PagoDeuda): boolean {
  if (!f.cuota || !f.diaPago) return false;
  const dia = Number(p.fecha.slice(8, 10));
  return Math.abs(dia - f.diaPago) <= 2 && Math.abs(p.monto - f.cuota) <= f.cuota * 0.15;
}

/** Reparte los pagos entre las deudas de su sede. Cada pago es de UNA deuda: gana el concepto, luego el día y monto. */
export function repartirPagos(deudas: Financiamiento[], pagos: PagoDeuda[]): { porDeuda: Map<number, PagoDeuda[]>; sinDeuda: PagoDeuda[] } {
  const porDeuda = new Map<number, PagoDeuda[]>(deudas.map((d) => [d.id, []]));
  const sinDeuda: PagoDeuda[] = [];
  for (const p of pagos) {
    const mias = deudas.filter((d) => d.businessId === p.businessId && (!d.desde || p.fecha >= d.desde));
    const dueña = mias.find((d) => coincideConcepto(d, p)) ?? mias.find((d) => coincidePorDia(d, p));
    if (dueña) porDeuda.get(dueña.id)!.push(p); else sinDeuda.push(p);
  }
  return { porDeuda, sinDeuda };
}

export function armarFinanciamientos(deudas: Financiamiento[], pagos: PagoDeuda[]): { deudas: EstadoFinanciamiento[]; sinDeuda: PagoDeuda[] } {
  const { porDeuda, sinDeuda } = repartirPagos(deudas, pagos);
  const out = deudas.map((d): EstadoFinanciamiento => {
    const mios = (porDeuda.get(d.id) ?? []).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const pagado = r2(mios.reduce((t, p) => t + p.monto, 0));
    const meses = new Set(mios.map((p) => p.fecha.slice(0, 7)));
    const saldo = d.montoOriginal !== null ? Math.max(0, r2(d.montoOriginal - pagado)) : null;
    const faltaDato: string[] = [];
    if (d.montoOriginal === null) faltaDato.push("monto original");
    if (d.cuotasTotal === null) faltaDato.push("número de cuotas");
    if (d.incluyeIntereses === null) faltaDato.push("si la cuota trae intereses");
    return {
      ...d, pagado, cuotasPagadas: meses.size, ultimoPago: mios.length ? mios[mios.length - 1].fecha : null,
      saldo,
      cuotasFaltan: d.cuotasTotal !== null ? Math.max(0, d.cuotasTotal - meses.size) : null,
      faltaDato,
      saldado: saldo !== null && saldo < 0.5,
    };
  });
  return { deudas: out, sinDeuda };
}

/** Lo que sale este mes por todas las deudas activas con cuota conocida (para «cuánto sale este mes»). */
export const cuotaMensualTotal = (d: EstadoFinanciamiento[]) => r2(d.filter((x) => !x.saldado).reduce((t, x) => t + (x.cuota ?? 0), 0));
