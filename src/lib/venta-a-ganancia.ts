/**
 * De la venta a la ganancia · las tres barras de cada sede.
 *
 * Idea del libro que lee Jahnn (3-oct-2026): facturación, efectivo y
 * beneficio son tres números distintos que hay que aprender a diferenciar.
 * En Cash Control:
 *
 *   1 · Vendido        = Ventas de Byte hasta el último día con Excel.
 *   2 · Ingresado      = lo que entró POR VENTAS: las filas del Excel con Grupo «Ventas»
 *                        (16-oct-2026, tras la reunión de Jahnn con Kelly: Ing&Gtos trae TODO lo
 *                        que pasa por la cuenta). Lo demás de la operación va aparte como
 *                        «otros ingresos». Sin filas marcadas en el mes, los ingresos operativos.
 *                        Antes se llamaba «Cobrado» (14-oct-2026): chocaba con «Por cobrar» y en las
 *                        cafeterías nadie cobra después. El campo interno sigue siendo `cobrado`.
 *                        No se llama "Caja" porque la tarjeta Caja cuenta
 *                        TODO lo que entra y sale, incluido el ahorro.
 *   3 · Ganancia real  = Ventas − Costos − Gastos − Impuestos (seis cifras).
 *
 * Los números salen de getSeisCifras: esta pieza solo los ordena y dice,
 * en una frase, qué pasa entre la barra 1 y la 2.
 */

import type { CifrasSede } from "./seis-cifras";

export type BarrasSede = {
  businessId: number;
  sede: string;
  corte: string | null;
  vendido: number | null;
  cobrado: number | null;
  /** Lo que entró y no es venta (devoluciones, depósitos, ventas sueltas sin marcar…); null si no se separa. */
  otrosIngresos: number | null;
  ganancia: number | null;
  gananciaPct: number | null;
  /** Por qué falta la ganancia (null si la hay). */
  sinGananciaPorque: string | null;
  /** Una frase sobre la distancia entre lo vendido y lo ingresado. */
  nota: string | null;
  /** La sede tiene al menos vendido y cobrado: se pueden dibujar las barras. */
  conBarras: boolean;
  /** Si el Excel va más adelante que Byte: la frase que lo dice (todo se midió hasta el día de Byte). */
  avisoCorte: string | null;
};

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Byte atrasado respecto del Excel: falta subir el reporte de ventas de esos días. */
export function avisoDeCorte(corte: string | null, corteExcel: string | null): string | null {
  if (!corte || !corteExcel || corteExcel <= corte) return null;
  return `El Excel llega al ${ddmm(corteExcel)}, pero las ventas de Byte solo al ${ddmm(corte)}: todo se mide hasta el ${ddmm(corte)}. Falta subir el reporte de ventas de Byte.`;
}

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

export function notaVendidoIngresado(vendido: number | null, cobrado: number | null): string | null {
  if (vendido === null || cobrado === null || vendido <= 0) return null;
  const dif = vendido - cobrado;
  if (Math.abs(dif) < vendido * 0.01) return "Ingresó prácticamente todo lo que vendiste.";
  if (dif > 0) return `Vendiste ${soles(dif)} más de lo que ingresó: crédito por cobrar o plata que llega después.`;
  return `Ingresaron ${soles(-dif)} más de lo que vendiste: llegaron cobros de ventas de antes.`;
}

export function barrasDeSede(s: CifrasSede): BarrasSede {
  return {
    businessId: s.businessId, sede: s.sede, corte: s.corte,
    vendido: s.ventas, cobrado: s.ingresadoVentas ?? s.cobrado, otrosIngresos: s.ingresadoVentas !== null ? s.otrosIngresos : null,
    ganancia: s.ganancia, gananciaPct: s.gananciaPct,
    sinGananciaPorque: s.conResultado ? null : s.sinResultadoPorque,
    // Con el mes a medias, lo ingresado va unos días detrás de lo vendido: comparar sería engañoso.
    nota: s.mesCompleto ? notaVendidoIngresado(s.ventas, s.ingresadoVentas ?? s.cobrado) : "Mes a medias: lo ingresado va unos días detrás de lo vendido (los abonos del POS llegan con retraso).",
    conBarras: s.ventas !== null && s.ventas > 0 && (s.ingresadoVentas ?? s.cobrado) !== null,
    avisoCorte: avisoDeCorte(s.corte, s.corteExcel),
  };
}

const ORDEN = [2, 3, 1];

/** Las tres sedes en el orden del dashboard (Fonavi, Centro, Atelier). */
export function barrasDelMes(sedes: CifrasSede[]): BarrasSede[] {
  return ORDEN.map((id) => sedes.find((s) => s.businessId === id)).filter((s): s is CifrasSede => !!s).map(barrasDeSede);
}
