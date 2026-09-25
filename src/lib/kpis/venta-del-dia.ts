/**
 * La venta de un día, cuando hay más de una fuente · MOTOR (puro).
 *
 * Tres datos independientes de la misma venta:
 *   · el reporte oficial de Byte (lo sube la sede),
 *   · la copia de Byte en el Excel (pestaña "Control de VTAS"),
 *   · lo que registra el administrador en su panel.
 *
 * Regla (pedido de Jahnn, 25-sep-2026: "usar las ventas de mis
 * administradores para reforzar los datos de Byte"): manda Byte, salvo que
 * Byte y el Excel difieran y el administrador confirme el Excel — dos de
 * tres. Caso real: el 30/08 el reporte de Byte de Fonavi decía S/102.10 (se
 * bajó antes de cerrar el día); el Excel S/899.60 y el administrador
 * S/899.60. Gana S/899.60.
 *
 * Lo usan el cargador de ventas (dashboard, deck) y la verificación contra
 * el Excel: si eligieran distinto, se contradirían.
 */

/** A partir de cuánto dos fuentes "no coinciden" en un día. */
export const TOLERANCIA_DESACUERDO = 5;
/** Hasta cuánto el administrador "coincide" con una fuente (redondeos). */
export const TOLERANCIA_COINCIDE = 1;

export type FuenteVenta = "byte" | "excel" | "admin";
export type MotivoEleccion =
  | "unica"               // solo había una fuente
  | "coinciden"           // las fuentes dicen lo mismo (± S/5)
  | "admin-confirma-excel"
  | "admin-confirma-byte"
  | "sin-desempate";      // no coinciden y no hay tercer dato que decida

export type EleccionDia = { total: number; fuente: FuenteVenta; motivo: MotivoEleccion };

const cerca = (a: number, b: number, tol: number) => Math.abs(a - b) < tol;

export function elegirVentaDia(byte?: number | null, excel?: number | null, admin?: number | null): EleccionDia | null {
  const b = byte ?? null, e = excel ?? null, a = admin ?? null;
  if (b !== null) {
    if (e === null) {
      if (a === null || cerca(a, b, TOLERANCIA_DESACUERDO)) return { total: b, fuente: "byte", motivo: a === null ? "unica" : "coinciden" };
      return { total: b, fuente: "byte", motivo: "sin-desempate" };
    }
    if (cerca(b, e, TOLERANCIA_DESACUERDO)) return { total: b, fuente: "byte", motivo: "coinciden" };
    if (a !== null && cerca(a, e, TOLERANCIA_COINCIDE) && !cerca(a, b, TOLERANCIA_COINCIDE)) return { total: e, fuente: "excel", motivo: "admin-confirma-excel" };
    if (a !== null && cerca(a, b, TOLERANCIA_COINCIDE)) return { total: b, fuente: "byte", motivo: "admin-confirma-byte" };
    return { total: b, fuente: "byte", motivo: "sin-desempate" };
  }
  if (e !== null) {
    if (a === null || cerca(a, e, TOLERANCIA_DESACUERDO)) return { total: e, fuente: "excel", motivo: a === null ? "unica" : "coinciden" };
    return { total: e, fuente: "excel", motivo: "sin-desempate" };
  }
  if (a !== null) return { total: a, fuente: "admin", motivo: "unica" };
  return null;
}
