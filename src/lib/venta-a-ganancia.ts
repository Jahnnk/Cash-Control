/**
 * De la venta a la ganancia · las tres barras de cada sede.
 *
 * Idea del libro que lee Jahnn (3-oct-2026): facturación, efectivo y
 * beneficio son tres números distintos que hay que aprender a diferenciar.
 * En Cash Control:
 *
 *   1 · Vendido        = Ventas de Byte hasta el último día con Excel.
 *   2 · Ingresado      = lo que entró de las ventas a banco y caja (ingresos operativos del
 *                        Excel, sin préstamos, rescates ni reembolsos).
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
  ganancia: number | null;
  gananciaPct: number | null;
  /** Por qué falta la ganancia (null si la hay). */
  sinGananciaPorque: string | null;
  /** Una frase sobre la distancia entre lo vendido y lo ingresado. */
  nota: string | null;
  /** La sede tiene al menos vendido y cobrado: se pueden dibujar las barras. */
  conBarras: boolean;
};

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
    vendido: s.ventas, cobrado: s.cobrado,
    ganancia: s.ganancia, gananciaPct: s.gananciaPct,
    sinGananciaPorque: s.conResultado ? null : s.sinResultadoPorque,
    // Con el mes a medias, lo ingresado va unos días detrás de lo vendido: comparar sería engañoso.
    nota: s.mesCompleto ? notaVendidoIngresado(s.ventas, s.cobrado) : "Mes a medias: lo ingresado suele ir unos días detrás de lo vendido.",
    conBarras: s.ventas !== null && s.ventas > 0 && s.cobrado !== null,
  };
}

const ORDEN = [2, 3, 1];

/** Las tres sedes en el orden del dashboard (Fonavi, Centro, Atelier). */
export function barrasDelMes(sedes: CifrasSede[]): BarrasSede[] {
  return ORDEN.map((id) => sedes.find((s) => s.businessId === id)).filter((s): s is CifrasSede => !!s).map(barrasDeSede);
}
