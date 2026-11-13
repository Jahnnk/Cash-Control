/**
 * De las palancas al presupuesto · MOTOR (puro). Fase 2 del centro de mando (pedido de Jahnn, 13-nov-2026).
 *
 * Las palancas hablan en grande (venta, costo variable %, planilla, otros fijos); el presupuesto, por categoría.
 * Para bajar de una a otra se usa la MEZCLA de los últimos meses cerrados (lib/presupuesto.ts → sugerir) y se
 * escala cada grupo hasta que sume lo que marca su palanca:
 *
 *   · Costo variable  → las categorías de la operación que van en % de la venta (sin IMPUESTOS).
 *   · Planilla        → la categoría PLANILLA.
 *   · Otros fijos     → las demás categorías de la operación que van en soles.
 *   · NO se mueven: impuestos, deudas, inversión y ahorro. No son costo de operar (salen del EBITDA): quedan como
 *     estaban en el plan del mes o, si no hay plan, como los sugiere el historial.
 *
 * La parte que maneja el administrador (tope de Control de Caja) se conserva del plan actual, sin pasar del nuevo monto.
 * El resultado es un BORRADOR: nadie lo aprueba solo.
 */

import { areaDe, montoDe, type Linea } from "./presupuesto";
import type { Palancas } from "./palancas";

export type Grupo = "variable" | "planilla" | "otrosFijos" | "sinMover";

const CAT_PLANILLA = "PLANILLA";
const CAT_IMPUESTOS = "IMPUESTOS";
/** Si el historial no trae ninguna categoría variable, todo el costo variable va aquí. */
const CAT_VARIABLE_POR_DEFECTO = "INSUMOS";

export function grupoDe(l: Pick<Linea, "categoria" | "modo">): Grupo {
  if (areaDe(l.categoria).bloque !== "operacion" || l.categoria === CAT_IMPUESTOS) return "sinMover";
  if (l.categoria === CAT_PLANILLA) return "planilla";
  return l.modo === "pct" ? "variable" : "otrosFijos";
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Escala los valores para que sumen `total`, redondeando a `paso`; la diferencia del redondeo va a la línea más grande. */
function escalar(lineas: Linea[], total: number, paso: number): Linea[] {
  const suma = lineas.reduce((t, l) => t + l.valor, 0);
  if (lineas.length === 0 || suma <= 0) return [];
  const redondear = (n: number) => Math.round(n / paso) * paso;
  const out = lineas.map((l) => ({ ...l, valor: redondear((l.valor / suma) * total) }));
  const mayor = out.reduce((m, l) => (l.valor > m.valor ? l : m), out[0]);
  mayor.valor = redondear(mayor.valor + (total - out.reduce((t, l) => t + l.valor, 0)));
  return out.map((l) => ({ ...l, valor: paso < 1 ? r1(l.valor) : r2(l.valor) })).filter((l) => l.valor > 0);
}

export type FilaCambio = { categoria: string; grupo: Grupo; /** Monto en soles del plan actual (null = no estaba). */ antes: number | null; ahora: number | null };

export type PlanDesdePalancas = {
  ventaEsperada: number;
  lineas: Linea[];
  /** Categoría por categoría, el plan actual contra el nuevo (en soles), para revisarlo antes de guardar. */
  cambios: FilaCambio[];
  /** Otros fijos que no se pudieron repartir porque el historial no tiene ninguna categoría fija (0 = todo repartido). */
  sinRepartir: number;
};

/**
 * @param sugerido  Las líneas que propone el historial (la mezcla).
 * @param actual    El plan que ya tiene ese mes (puede estar vacío) y su venta esperada.
 */
export function planDesdePalancas(p: Palancas, sugerido: Linea[], actual: { ventaEsperada: number | null; lineas: Linea[] }): PlanDesdePalancas {
  const ventaEsperada = Math.round(p.ventas);
  const de = (g: Grupo, lista: Linea[]) => lista.filter((l) => grupoDe(l) === g);
  // La mezcla sale del historial; si el historial no dice nada de un grupo, del plan actual.
  const mezcla = (g: Grupo) => { const h = de(g, sugerido); return h.length ? h : de(g, actual.lineas); };

  const mezclaVar = mezcla("variable");
  const variables = mezclaVar.length
    ? escalar(mezclaVar.map((l) => ({ categoria: l.categoria, modo: "pct" as const, valor: l.valor })), r1(p.variablePct), 0.1)
    : p.variablePct > 0 ? [{ categoria: CAT_VARIABLE_POR_DEFECTO, modo: "pct" as const, valor: r1(p.variablePct) }] : [];
  const planilla: Linea[] = p.planilla > 0 ? [{ categoria: CAT_PLANILLA, modo: "soles", valor: Math.round(p.planilla / 10) * 10 }] : [];
  const mezclaFijos = mezcla("otrosFijos");
  const otros = escalar(mezclaFijos.map((l) => ({ categoria: l.categoria, modo: "soles" as const, valor: l.valor })), Math.round(p.otrosFijos / 10) * 10, 10);
  // Lo que no es costo de operar: como está en el plan del mes; si no hay plan, como lo sugiere el historial.
  const quietas = (de("sinMover", actual.lineas).length ? de("sinMover", actual.lineas) : de("sinMover", sugerido)).map((l) => ({ categoria: l.categoria, modo: l.modo, valor: l.valor }));

  const topes = new Map(actual.lineas.filter((l) => (l.topeCaja ?? 0) > 0).map((l) => [l.categoria, l.topeCaja!]));
  const lineas: Linea[] = [...variables, ...planilla, ...otros, ...quietas].map((l) => {
    const tope = topes.get(l.categoria);
    const monto = montoDe(l, ventaEsperada);
    return tope && monto !== null ? { ...l, topeCaja: r2(Math.min(tope, monto)) } : l;
  });

  const antes = new Map(actual.lineas.map((l) => [l.categoria, montoDe(l, actual.ventaEsperada)]));
  const ahora = new Map(lineas.map((l) => [l.categoria, montoDe(l, ventaEsperada)]));
  const ORDEN: Grupo[] = ["variable", "planilla", "otrosFijos", "sinMover"];
  const cambios: FilaCambio[] = [...new Set([...ahora.keys(), ...antes.keys()])].map((categoria) => {
    const linea = lineas.find((l) => l.categoria === categoria) ?? actual.lineas.find((l) => l.categoria === categoria)!;
    return { categoria, grupo: grupoDe(linea), antes: antes.get(categoria) ?? null, ahora: ahora.get(categoria) ?? null };
  }).sort((a, b) => ORDEN.indexOf(a.grupo) - ORDEN.indexOf(b.grupo) || (b.ahora ?? 0) - (a.ahora ?? 0));

  return { ventaEsperada, lineas, cambios, sinRepartir: mezclaFijos.length ? 0 : Math.round(p.otrosFijos) };
}

/**
 * Ruta de 90 días: tres escalones parejos desde el EBITDA de hoy hasta la meta (redondeados a medio punto).
 * Si hoy ya se está en la meta o por encima, no hay ruta.
 */
export function rutaDe90Dias(ebitdaHoyPct: number, metaPct: number): number[] {
  if (ebitdaHoyPct >= metaPct) return [];
  const medio = (n: number) => Math.round(n * 2) / 2;
  return [1, 2, 3].map((k) => (k === 3 ? metaPct : medio(ebitdaHoyPct + ((metaPct - ebitdaHoyPct) * k) / 3)));
}
