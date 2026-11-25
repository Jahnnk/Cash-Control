/**
 * Precio de compra de un insumo (25-nov-2026): además de kg, litro y unidad, se puede comprar «por g»
 * (cuántos g trae y cuánto cuesta). La lista de insumos guarda siempre el precio por kg, litro o unidad.
 */

import type { CostoPreparacion } from "@/lib/costos-preparaciones";

export type Compra = "kg" | "g" | "l" | "und";
export type PrecioCompra = { compra: Compra; gramos: string; precio: string };

export const num = (s: string) => Number(s.replace(",", "."));
export const ETIQUETA_COMPRA: Record<Compra, string> = { kg: "kg", g: "g", l: "litro", und: "unidad" };

/** Qué opciones de compra tiene un insumo según su unidad (un insumo por kg se puede comprar por g). */
export const comprasPara = (unidad: CostoPreparacion["unidad"] | null): Compra[] =>
  unidad === null ? ["kg", "g", "l", "und"] : unidad === "kg" ? ["kg", "g"] : [unidad];

/** El precio por la unidad de la lista (kg, l, und). Por g: precio ÷ gramos × 1000. null = falta un dato. */
export function precioPorBase(p: PrecioCompra): { unidad: "kg" | "l" | "und"; precio: number } | null {
  const precio = num(p.precio);
  if (!(precio > 0)) return null;
  if (p.compra !== "g") return { unidad: p.compra, precio };
  const g = num(p.gramos);
  if (!(g > 0)) return null;
  return { unidad: "kg", precio: Math.round((precio / g) * 1000 * 10000) / 10000 };
}

