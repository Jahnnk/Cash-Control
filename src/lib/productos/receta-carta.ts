/**
 * Productos nuevos de la carta, con su receta · MOTOR (puro).
 *
 * Fase 2b de «la carta vive en el sistema» (pedido de Jahnn, 18-nov-2026: «si agregamos algún producto
 * nuevo, ya sea sánguche que se hace en las mismas cafeterías, bebida, o algún postre que se produce en
 * Atelier»). Tres clases de producto nuevo:
 *
 *   TIENDA   se prepara en la cafetería: receta con insumos que compra la cafetería (precio vigente,
 *            lib/productos/precios-vigentes.ts) y productos de Atelier a su precio interno (el pan…).
 *            Costo por unidad = suma de las líneas ÷ (porciones × (1 − merma)). Se recalcula siempre con
 *            los precios de hoy, así que una subida de un insumo llega sola.
 *   ATELIER  lo produce Atelier: se enlaza a su receta (Grupo → Recetas de Atelier) para el costo en insumos;
 *            a la cafetería le cuesta el precio interno.
 *   REVENTA  se compra hecho: el costo es el precio de compra.
 */

import type { AporteInsumo } from "./desglose-insumos";
import { costoIngrediente } from "@/lib/recetas";

export type LineaTienda = {
  /** «insumo»: lo compra la cafetería (SKU de CAF · Insumos). «atelier»: se lo compra a Atelier (ref AT-…). */
  tipo: "insumo" | "atelier";
  ref: string;
  nombre: string;
  cantidad: number;
  /** g, kg, ml, l o und. Lo de Atelier va en unidades. */
  unidad: string;
};

export type RecetaCarta =
  | { tipo: "tienda"; porciones: number; merma: number; lineas: LineaTienda[] }
  | { tipo: "atelier"; recetaRef: string | null }
  | { tipo: "reventa" };

export const ORIGEN_DE: Record<RecetaCarta["tipo"], string> = { tienda: "Cafetería", atelier: "Atelier", reventa: "Externo" };

export type CostoTienda = {
  /** Costo por unidad; null si falta el precio de alguna línea o no hay porciones. */
  costo: number | null;
  desglose: AporteInsumo[];
  faltantes: string[];
  lineas: { linea: LineaTienda; costo: number | null }[];
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function costoTienda(
  r: Extract<RecetaCarta, { tipo: "tienda" }>,
  insumo: (sku: string) => { unidad: string; precio: number } | null,
  atelier: (ref: string) => number | null,
): CostoTienda {
  const faltantes: string[] = [];
  const lineas = r.lineas.map((l) => {
    let c: number | null = null;
    if (l.tipo === "insumo") {
      const i = insumo(l.ref);
      c = i ? costoIngrediente({ unidad: i.unidad as "kg" | "l" | "und", costo: i.precio }, l.cantidad, l.unidad) : null;
    } else {
      const p = atelier(l.ref);
      c = p !== null && Number.isFinite(l.cantidad) ? p * l.cantidad : null;
    }
    if (c === null) faltantes.push(l.nombre);
    return { linea: l, costo: c };
  });
  const merma = Math.min(Math.max(r.merma || 0, 0), 0.95);
  const divisor = (r.porciones > 0 ? r.porciones : 0) * (1 - merma);
  if (divisor <= 0 || lineas.length === 0 || faltantes.length > 0) return { costo: null, desglose: [], faltantes, lineas };
  const acum = new Map<string, AporteInsumo>();
  for (const { linea, costo } of lineas) {
    const k = `${linea.tipo}|${linea.ref}`;
    const ya = acum.get(k);
    acum.set(k, { sku: linea.ref, nombre: linea.nombre, costo: (ya?.costo ?? 0) + (costo ?? 0) / divisor });
  }
  const desglose = [...acum.values()].map((a) => ({ ...a, costo: r4(a.costo) })).filter((a) => a.costo > 0).sort((a, b) => b.costo - a.costo);
  return { costo: r4(lineas.reduce((t, x) => t + (x.costo ?? 0), 0) / divisor), desglose, faltantes, lineas };
}

/** Lo que falta para poder guardar un producto nuevo (vacío = se puede). */
export function erroresDeAlta(p: { nombre: string; precio: number | null; costo: number | null; receta: RecetaCarta }): string[] {
  const e: string[] = [];
  if (!p.nombre.trim()) e.push("Escribe el nombre del producto.");
  if (!(p.precio != null && p.precio > 0)) e.push("Escribe el precio de carta.");
  if (p.receta.tipo === "tienda") {
    if (p.receta.lineas.length === 0) e.push("Agrega al menos un ingrediente.");
    if (!(p.receta.porciones > 0)) e.push("Las porciones deben ser más que cero.");
    if (p.receta.lineas.some((l) => !(l.cantidad > 0))) e.push("Cada ingrediente necesita una cantidad mayor que cero.");
  } else if (!(p.costo != null && p.costo > 0)) {
    e.push(p.receta.tipo === "atelier" ? "Escribe el precio interno (lo que paga la cafetería a Atelier)." : "Escribe el precio de compra.");
  }
  return e;
}

/** La ref siguiente para un producto nuevo: CF-S001… (tienda y reventa) o AT-S001… (Atelier). */
export function refNueva(tipo: RecetaCarta["tipo"], usadas: string[]): string {
  const prefijo = tipo === "atelier" ? "AT-S" : "CF-S";
  const max = usadas.filter((r) => r.startsWith(prefijo)).map((r) => Number(r.slice(prefijo.length)) || 0).reduce((a, b) => Math.max(a, b), 0);
  return `${prefijo}${String(max + 1).padStart(3, "0")}`;
}
