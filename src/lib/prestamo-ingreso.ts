/**
 * ¿Este ingreso del Excel de Kelly es un préstamo y no una venta?
 *
 * Caso real (25-sep-2026): el 16/09 entraron a Atelier S/1,500 como
 * "PRÉSTAMO PARA 50% ARREGLO ABATIDOR (SE DEVOLVERÁ EN OCTUBRE) (JUAN
 * TERRONES)" y se contaron como ingreso del mes. En agosto pasó lo mismo con
 * los préstamos de Fonavi y Centro a Atelier (S/11,000). La plata entró al
 * banco de verdad, así que sigue contando en el saldo, pero no es venta: se
 * marca como ingreso no operativo (la columna non_operative_category, que
 * ya excluye de ingresos del mes, EBITDA y punto de equilibrio).
 *
 *   · "PRÉSTAMO …"                       → Préstamos / financiamiento recibido
 *   · "PAGO 1ER CUOTA PRÉSTAMO …"        → Otros no operativos (otra sede le
 *     devuelve a esta un préstamo que le dio: es cobrar una deuda, no vender)
 */

import type { NON_OPERATIVE_CATEGORIES } from "./income-base";

type NoOperativa = (typeof NON_OPERATIVE_CATEGORIES)[number];

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

export function categoriaPrestamoIngreso(nota: string | null | undefined): NoOperativa | null {
  if (!nota) return null;
  const t = norm(nota);
  if (!/\bPRESTAMO/.test(t)) return null;
  // Devolución de un préstamo que esta sede dio (cuota que le pagan).
  if (/^(PAGO|DEVOLUCION|CUOTA|ABONO)\b/.test(t) || /\bCUOTA\b.*\bPRESTAMO\b/.test(t)) return "Otros no operativos";
  return "Préstamos / financiamiento recibido";
}
