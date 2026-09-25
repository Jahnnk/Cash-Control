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
 *   · "PRÉSTAMO A ATELIER (FONDOS MUTUOS)" → Otros no operativos (la sede saca
 *     sus ahorros para prestarle a otra: tampoco es financiamiento recibido)
 *   · "RESCATE PARA ADELANTO UTILIDADES … (FONDOS MUTUOS)" → Otros no
 *     operativos. Kelly (25-sep-2026): cada mes Centro saca S/2,400 de sus
 *     ahorros para pagar el adelanto de utilidades de Jahnn y Juani (S/1,200
 *     c/u). Es plata propia que vuelve, no venta.
 */

import type { NON_OPERATIVE_CATEGORIES } from "./income-base";

type NoOperativa = (typeof NON_OPERATIVE_CATEGORIES)[number];

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

export function categoriaPrestamoIngreso(nota: string | null | undefined): NoOperativa | null {
  if (!nota) return null;
  const t = norm(nota);
  // Rescate de ahorros (fondos mutuos, plazo fijo): plata propia que vuelve.
  if (/\bRESCATE\b/.test(t)) return "Otros no operativos";
  if (!/\bPRESTAMO/.test(t)) return null;
  // Devolución de un préstamo que esta sede dio (cuota que le pagan).
  if (/^(PAGO|DEVOLUCION|CUOTA|ABONO)\b/.test(t) || /\bCUOTA\b.*\bPRESTAMO\b/.test(t)) return "Otros no operativos";
  // Plata propia que vuelve de los ahorros para prestarle a otra sede
  // ("PRESTAMO A ATELIER (FONDOS MUTUOS)"): no es financiamiento recibido.
  if (/FONDOS? MUTUOS?|AHORRO/.test(t)) return "Otros no operativos";
  return "Préstamos / financiamiento recibido";
}
