/**
 * Ventas internas del grupo · MOTOR (lógica pura).
 *
 * ─── El problema ───
 *
 * Atelier le vende pan y pastelería a Fonavi y Centro. Para cada sede
 * por separado eso es real: Atelier vende, y la cafetería compra
 * (categoría PRODUCTOS ATELIER, gasto variable). Pero en el CONSOLIDADO
 * del grupo, sumar las tres sedes tal cual cuenta esa plata dos veces:
 * una como venta de Atelier y otra como gasto de la cafetería, cuando
 * ningún cliente de afuera la pagó. Kelly lo confirmó el 14-sep-2026:
 * "todo lo que dice productos Atelier es la venta que vende Atelier a
 * las cafeterías".
 *
 * Es mucho: en agosto 2026, S/25,545 de los S/38,570 que vendió Atelier
 * del 3 al 29 fueron a las cafeterías (66%). Inflar ventas y variables
 * por el mismo monto sube el % de variables y, con él, el punto de
 * equilibrio del grupo.
 *
 * ─── Cómo se descuenta ───
 *
 * Del lado del GASTO se quita lo que cada cafetería registró como
 * PRODUCTOS ATELIER. Del lado de la VENTA se usa ese mismo monto como
 * medida de lo que Atelier les vendió: en el periodo del 3 al 29 de
 * agosto Atelier reportó S/25,545 a las sedes y las sedes le pagaron
 * S/24,899 (97%). La diferencia es de días de pago, la misma que ya
 * tiene todo el cálculo por caja.
 *
 * Solo se descuenta el par Atelier↔cafetería cuando las DOS están dentro
 * del consolidado, y cada lado con SUS meses: la venta de Atelier en los
 * meses que Atelier aporta, el gasto de la cafetería en los meses que la
 * cafetería aporta. Si una sede quedó fuera, lo que le compra o vende a
 * la otra sí es "de afuera" para ese consolidado parcial.
 */

export type SedeEnConsolidado = {
  businessId: number;
  /** Meses que la sede aporta al consolidado (referencia o el mes mismo). */
  meses: string[];
  /** Lo que la sede registró como compra a Atelier, por mes. */
  compraAtelierPorMes: Record<string, number>;
};

export const ATELIER_ID = 1;

export function ventasInternasDelGrupo(sedes: SedeEnConsolidado[]): { ventas: number; variables: number } {
  const atelier = sedes.find((s) => s.businessId === ATELIER_ID);
  if (!atelier) return { ventas: 0, variables: 0 };
  let ventas = 0;
  let variables = 0;
  for (const s of sedes) {
    if (s.businessId === ATELIER_ID) continue;
    for (const m of atelier.meses) ventas += s.compraAtelierPorMes[m] ?? 0;
    for (const m of s.meses) variables += s.compraAtelierPorMes[m] ?? 0;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { ventas: r2(ventas), variables: r2(variables) };
}
