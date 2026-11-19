/**
 * La carta de las cafeterías con los cambios hechos en el sistema · MOTOR (puro).
 *
 * Fase 2 de «la carta vive en el sistema» (pedido de Jahnn, 18-nov-2026: «nuestra carta es muy dinámica y
 * cambia cada tres meses o cada mes»). El Excel de pricing se sube y reemplaza costos_carta entera; los
 * cambios hechos en Grupo → Recetas y costos → Carta viven aparte (carta_sistema) y ganan siempre, también
 * después de subir otro Excel (igual que las recetas del sistema de Atelier).
 *
 *   2a · precio de carta, precio interno de Atelier (lo que paga la cafetería), sección.
 *   2b · productos nuevos con su receta (nuevo = true).
 * Un campo vacío (null) = se queda lo del Excel.
 */

import type { CostoCarta } from "./costos-carta";
import type { RecetaCarta } from "./receta-carta";

export type CambioCarta = {
  ref: string;
  nombre: string | null;
  nombreCarta: string | null;
  seccion: string | null;
  origen: string | null;
  categoria: string | null;
  precio: number | null;
  costo: number | null;
  nuevo: boolean;
  /** Solo productos nuevos (fase 2b): cómo se hace y de dónde sale su costo (lib/productos/receta-carta.ts). */
  receta?: RecetaCarta | null;
  actualizadoEl?: string | null;
};

/** Qué campos cambió el sistema en un producto (para mostrarlo en la pantalla). */
export type MarcaSistema = { precio: boolean; costo: boolean; seccion: boolean; nuevo: boolean };

export function aplicarCartaSistema(excel: CostoCarta[], cambios: CambioCarta[]): CostoCarta[] {
  if (cambios.length === 0) return excel;
  const porRef = new Map(cambios.map((c) => [c.ref, c]));
  const out = excel.map((i) => {
    const c = porRef.get(i.ref);
    if (!c) return i;
    return {
      ...i,
      nombre: c.nombre ?? i.nombre,
      nombreCarta: c.nombreCarta ?? i.nombreCarta,
      categoria: c.categoria ?? i.categoria,
      origen: c.origen ?? i.origen,
      seccion: c.seccion ?? i.seccion,
      // Con sección elegida en el sistema, está en la carta que ve el cliente.
      enCarta: c.seccion ? true : i.enCarta,
      precio: c.precio ?? i.precio,
      costo: c.costo ?? i.costo,
    };
  });
  const enExcel = new Set(excel.map((i) => i.ref));
  for (const c of cambios) {
    if (!c.nuevo || enExcel.has(c.ref) || !c.nombre) continue;
    out.push({
      ref: c.ref, nombre: c.nombre, nombreCarta: c.nombreCarta, categoria: c.categoria, origen: c.origen,
      seccion: c.seccion, enCarta: c.seccion ? true : null, precio: c.precio, costo: c.costo ?? 0,
      insumos: null, desglose: null,
    });
  }
  return out;
}

export function marcaDe(c: CambioCarta | undefined): MarcaSistema {
  return { precio: c?.precio != null, costo: c?.costo != null, seccion: !!c?.seccion, nuevo: !!c?.nuevo };
}

/** El precio redondo más cercano a un precio escrito: S/ 0.10 de paso (la carta usa .00, .50 y .90). */
export const precioValido = (n: number) => Number.isFinite(n) && n > 0 && n < 10000;
