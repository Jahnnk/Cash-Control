/**
 * Recetas de panes y focaccias en «% panadero» · MOTOR (puro).
 *
 * Pedido de Jahnn (26-nov-2026), caso real: Luis cambió el peso de la focaccia a 1,520 g de masa cruda por bandeja.
 * En la hoja de producción de Luis cada insumo es «(masa ÷ peso por bandeja) × 1,043.75 × %»: la harina base
 * (1,043.75) estaba escrita a mano, así que el 1,520 se cancelaba y la hoja seguía haciendo 2,022 g por bandeja.
 *
 * Aquí la harina base NO se escribe: sale del peso de masa y de la suma de los %:
 *   harina base = peso de masa × 100 ÷ suma de los %
 *   gramos de un insumo = harina base × su % ÷ 100   (todos juntos suman el peso de masa)
 * Las cantidades guardadas son las de UNA bandeja; la calculadora de producción las multiplica.
 * Los ingredientes sin % (toppings, bolsas) van con su cantidad fija por bandeja y no son parte de la masa.
 */

import type { DetalleReceta, Ingrediente } from "@/lib/costos-preparaciones";

const r2 = (n: number) => Math.round(n * 100) / 100;

export const esPanadero = (d: Pick<DetalleReceta, "panadero">): boolean => !!d.panadero && d.panadero.pesoMasa > 0;
export const enMasa = (i: Pick<Ingrediente, "pct">): boolean => typeof i.pct === "number" && i.pct > 0;

/** Suma de los % de la masa (la focaccia V4: 193.6). */
export const sumaPct = (d: DetalleReceta): number => d.ingredientes.reduce((s, i) => s + (enMasa(i) ? i.pct! : 0), 0);

/** Gramos de harina de 1 bandeja (el 100%). null si no hay %. */
export function harinaBase(d: DetalleReceta): number | null {
  const suma = sumaPct(d);
  return esPanadero(d) && suma > 0 ? (d.panadero!.pesoMasa * 100) / suma : null;
}

/** La receta con las cantidades de 1 bandeja calculadas desde los % (en g, o ml para líquidos). */
export function aplicarPanadero(d: DetalleReceta): DetalleReceta {
  const base = harinaBase(d);
  if (base === null) return d;
  return {
    ...d,
    ingredientes: d.ingredientes.map((i) => (enMasa(i)
      ? { ...i, unidad: i.unidad === "ml" || i.unidad === "l" ? "ml" : "g", cantidad: r2((base * i.pct!) / 100) }
      : { ...i, pct: null })),
  };
}

export type LineaProduccion = { nombre: string; unidad: string; cantidad: number; pct: number | null };

/** Lo que Luis pesa para N bandejas. */
export function produccion(d: DetalleReceta, bandejas: number): { lineas: LineaProduccion[]; masa: number } {
  const n = Number.isFinite(bandejas) && bandejas > 0 ? bandejas : 0;
  const a = aplicarPanadero(d);
  const lineas = a.ingredientes.map((i) => ({ nombre: i.nombre, unidad: i.unidad, cantidad: i.cantidad * n, pct: enMasa(i) ? i.pct! : null }));
  return { lineas, masa: (d.panadero?.pesoMasa ?? 0) * n };
}

/** Lo que falta para guardar una receta en % panadero. */
export function erroresPanadero(d: DetalleReceta): string[] {
  if (!d.panadero) return [];
  const e: string[] = [];
  if (!(d.panadero.pesoMasa > 0)) e.push("Pon el peso de masa de una bandeja (en gramos).");
  if (d.panadero.piezas !== null && !(d.panadero.piezas > 0)) e.push("Las piezas por bandeja tienen que ser más de 0.");
  if (!d.ingredientes.some(enMasa)) e.push("Pon el % de cada insumo de la masa (la harina es 100%).");
  for (const i of d.ingredientes) if (enMasa(i) && i.unidad === "und") e.push(`"${i.nombre}": va por unidad; no puede llevar %.`);
  return e;
}

/** Lo que lee la app de Producción de cada receta conectada (ver app/api/recetas-panadero). */
export type RecetaParaProduccion = {
  ref: string;
  nombre: string;
  /** Id de la receta en Producción. */
  produccion: number;
  /** Gramos de masa cruda de la pieza base (la bandeja de focaccia: 1,520). */
  pesoMasa: number;
  /** Harina de la pieza base = pesoMasa × 100 ÷ suma de %. */
  harinaBase: number;
  /** Solo la masa (las filas con %), en orden. `prod` = insumo de Producción (null si no existe allá). */
  lineas: { prod: number | null; nombre: string; pct: number }[];
  actualizadoPor: string | null;
  actualizadoEl: string;
};

export function recetasParaProduccion(filas: { id: number; nombre: string; detalle: DetalleReceta; por: string | null; el: string }[]): RecetaParaProduccion[] {
  const out: RecetaParaProduccion[] = [];
  for (const f of filas) {
    const d = f.detalle;
    const base = harinaBase(d);
    if (!d.panadero?.produccion || base === null) continue;
    out.push({
      ref: `REC:${f.id}`, nombre: f.nombre, produccion: d.panadero.produccion, pesoMasa: d.panadero.pesoMasa,
      harinaBase: Math.round(base * 100) / 100,
      lineas: d.ingredientes.filter(enMasa).map((i) => ({ prod: i.prod ?? null, nombre: i.nombre, pct: i.pct! })),
      actualizadoPor: f.por, actualizadoEl: String(f.el),
    });
  }
  return out;
}
