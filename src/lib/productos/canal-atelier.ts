/**
 * Atelier por canal en Grupo → Productos (pedido de Jahnn, 22-oct-2026). Atelier vende el mismo producto por dos canales,
 * y su prefijo en Byte lo dice (confirmado por Luis): «Y-» = a las cafeterías (Fonavi y Centro, ~60% de su venta), «P-» =
 * a otros B2B; sin prefijo = sub-recetas. La decisión cambia según el canal:
 *   · Y-: no se decide en Atelier sino en la carta de las cafeterías (si la cafetería deja de venderlo, Atelier deja de hacerlo).
 *   · P-: se decide por su venta B2B (crece, cae, deja margen).
 * Como «Fonavi + Centro» (id 0), las dos vistas son ids que no existen en la base: solo modos de la pantalla.
 */

import { canalDeLinea } from "../product-matching";
import type { FilaProducto } from "./panorama";

export const ATELIER = 1;
export const ATELIER_CAFETERIAS = -1;
export const ATELIER_B2B = -2;

export const VISTAS_ATELIER: { id: number; nombre: string; corto: string }[] = [
  { id: ATELIER, nombre: "Atelier", corto: "Todo" },
  { id: ATELIER_CAFETERIAS, nombre: "Atelier · a las cafeterías (Y-)", corto: "A las cafeterías (Y-)" },
  { id: ATELIER_B2B, nombre: "Atelier · B2B externo (P-)", corto: "B2B externo (P-)" },
];

/** ¿Es una de las dos vistas por canal de Atelier? */
export const esCanalAtelier = (id: number) => id === ATELIER_CAFETERIAS || id === ATELIER_B2B;
/** La sede real detrás de una vista (las de canal son Atelier). */
export const sedeReal = (id: number) => (esCanalAtelier(id) ? ATELIER : id);

/** Las filas de un canal (las sub-recetas, sin prefijo, solo están en «Todo»). */
export function filtrarPorCanal(filas: FilaProducto[], vista: number): FilaProducto[] {
  if (vista === ATELIER_CAFETERIAS) return filas.filter((f) => canalDeLinea(f.nombre) === "Y");
  if (vista === ATELIER_B2B) return filas.filter((f) => canalDeLinea(f.nombre) === "P");
  return filas;
}

export type RepartoCanal = { cafeterias: number; b2b: number; subRecetas: number; total: number };

/** Cuánto vendió Atelier por canal. */
export function repartoPorCanal(filas: { nombre: string; ingresos: number }[]): RepartoCanal {
  const r: RepartoCanal = { cafeterias: 0, b2b: 0, subRecetas: 0, total: 0 };
  for (const f of filas) {
    const c = canalDeLinea(f.nombre);
    if (c === "Y") r.cafeterias += f.ingresos; else if (c === "P") r.b2b += f.ingresos; else r.subRecetas += f.ingresos;
    r.total += f.ingresos;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { cafeterias: r2(r.cafeterias), b2b: r2(r.b2b), subRecetas: r2(r.subRecetas), total: r2(r.total) };
}
