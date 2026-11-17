/**
 * Candados del presupuesto · MOTOR (puro). Pedido de Jahnn (16-nov-2026): «hay costos que no podemos reducir»: el
 * alquiler va por contrato y los sueldos no se rebajan. Una categoría con candado queda en su promedio real y las
 * palancas no la recortan; la perilla de su grupo no baja de lo que suman las que tienen candado.
 *
 * Solo llevan candado la PLANILLA y los otros gastos fijos de la operación (el costo variable va en % de la venta y
 * se mueve con recetas y precios; impuestos, deudas, inversión y ahorro ya no los tocan las palancas).
 * Guardado por sede en presupuesto_candados; sin fila manda POR_DEFECTO.
 */

import { grupoDe } from "./palancas-presupuesto";
import { modoPorDefecto } from "./presupuesto";

export const CON_CANDADO_POR_DEFECTO = ["ALQUILER", "PLANILLA"] as const;

/** ¿Esta categoría puede llevar candado? */
export function admiteCandado(categoria: string): boolean {
  const g = grupoDe({ categoria, modo: modoPorDefecto(categoria) });
  return g === "planilla" || g === "otrosFijos";
}

/** Las categorías con candado de una sede: las de por defecto, corregidas por lo que guardó dirección. */
export function candadosDe(guardados: { categoria: string; bloqueado: boolean }[]): string[] {
  const s = new Set<string>(CON_CANDADO_POR_DEFECTO);
  for (const g of guardados) if (g.bloqueado) s.add(g.categoria); else s.delete(g.categoria);
  return [...s].filter(admiteCandado).sort();
}

/** Cuánto suman, en promedio real, los otros fijos con candado: la perilla 4 no puede bajar de aquí. */
export function pisoOtrosFijos(candados: string[], promedio: Record<string, number>): number {
  return Math.round(candados.filter((c) => c !== "PLANILLA").reduce((t, c) => t + (promedio[c] ?? 0), 0));
}
