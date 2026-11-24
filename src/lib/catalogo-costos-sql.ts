/**
 * La lista de costos de una sede, lista para usar: los ítems del último
 * Excel de pricing + las recetas del sistema (ver lib/recetas.ts). La usan
 * el detalle de mermas (para mostrar y para recalcular el costo al guardar)
 * y la pantalla Grupo → Recetas.
 *
 * Resiliente pre-migración: sin la columna "detalle" o sin la tabla de
 * recetas, devuelve lo que haya.
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { CostoPreparacion, DetalleReceta } from "@/lib/costos-preparaciones";
import { catalogoEfectivo, type RecetaSistema } from "@/lib/recetas";
import { ajustarCatalogo, factoresDe, preciosVigentes, type Factores, type FotoConArchivo, type PrecioVigente } from "@/lib/productos/precios-vigentes";
import { esInsumoDelSistema } from "@/lib/precios-sugeridos";

type Sql = NeonQueryFunction<false, false>;

export type Catalogo = {
  /** Lo que trajo el Excel, tal cual (incluye lo que las recetas reemplazan). */
  excel: CostoPreparacion[];
  recetas: RecetaSistema[];
  /** Insumos de Atelier creados en el sistema (SIS-A…, fase A de recetas, 24-nov-2026): no están en el Excel. */
  insumosSistema: CostoPreparacion[];
  /** Lo que se usa: Excel con los precios de insumos vigentes + insumos del sistema + recetas del sistema encima. */
  efectivo: CostoPreparacion[];
};

/** Los insumos de Atelier creados en el sistema, como ítems de la lista de costos (ref = su SKU). */
export function insumosDelSistema(vigentes: PrecioVigente[], excel: CostoPreparacion[]): CostoPreparacion[] {
  const refs = new Set(excel.map((i) => i.ref.toUpperCase()));
  return vigentes
    .filter((v) => v.origen === "Atelier" && esInsumoDelSistema(v.sku) && !refs.has(v.sku.toUpperCase()) && (v.unidad === "kg" || v.unidad === "l" || v.unidad === "und"))
    .map((v) => ({ ref: v.sku, tipo: "insumo" as const, nombre: v.nombre, categoria: "Insumos nuevos", unidad: v.unidad as CostoPreparacion["unidad"], costo: v.precio }));
}

/**
 * Los precios de compra vigentes (Excel + cambios hechos en el sistema, lib/productos/precios-vigentes.ts).
 * Sin la tabla (antes de la migración del 18-nov-2026), lista vacía: todo queda como en el Excel.
 */
export async function leerPreciosVigentes(sql: Sql): Promise<{ vigentes: PrecioVigente[]; factores: Factores }> {
  let fotos: FotoConArchivo[] = [];
  try {
    fotos = (await sql`
      SELECT fecha::text AS fecha, origen, sku, nombre, unidad, precio::float AS precio, archivo FROM insumos_precios
      WHERE fecha >= (CURRENT_DATE - INTERVAL '800 days')`) as FotoConArchivo[];
  } catch {
    fotos = [];
  }
  const vigentes = preciosVigentes(fotos);
  return { vigentes, factores: factoresDe(vigentes) };
}

export async function leerCatalogo(sql: Sql, bId: number): Promise<Catalogo> {
  let excel: CostoPreparacion[] = [];
  try {
    excel = (await sql`
      SELECT ref, tipo, nombre, categoria, unidad, costo::float AS costo, detalle
      FROM costos_preparaciones WHERE business_id = ${bId}
      ORDER BY CASE tipo WHEN 'producto' THEN 0 WHEN 'preparacion' THEN 1 ELSE 2 END, nombre
    `) as CostoPreparacion[];
  } catch {
    try {
      excel = (await sql`
        SELECT ref, tipo, nombre, categoria, unidad, costo::float AS costo
        FROM costos_preparaciones WHERE business_id = ${bId}
      `) as CostoPreparacion[];
    } catch {
      excel = [];
    }
  }
  let recetas: RecetaSistema[] = [];
  try {
    const rows = (await sql`
      SELECT id, nombre, tipo, categoria, detalle, reemplaza_ref
      FROM recetas_sistema WHERE business_id = ${bId} ORDER BY nombre
    `) as { id: number; nombre: string; tipo: RecetaSistema["tipo"]; categoria: string | null; detalle: DetalleReceta; reemplaza_ref: string | null }[];
    recetas = rows.map((r) => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, categoria: r.categoria, detalle: r.detalle, reemplaza: r.reemplaza_ref }));
  } catch {
    recetas = [];
  }
  const { vigentes, factores } = bId === 1 ? await leerPreciosVigentes(sql) : { vigentes: [], factores: null };
  const insumosSistema = insumosDelSistema(vigentes, excel);
  const conPrecios = [...(factores ? ajustarCatalogo(excel, factores) : excel), ...insumosSistema];
  return { excel, recetas, insumosSistema, efectivo: catalogoEfectivo(conPrecios, recetas) };
}
