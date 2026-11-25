/**
 * El mismo insumo en las dos listas (Atelier ↔ cafeterías), emparejado por su nombre de origen. Lo usan Grupo →
 * Insumos y packaging y la conexión con Proveedores. Regla pura: parejasEntreListas (lib/insumos-ficha.ts).
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { claveInsumo } from "@/lib/catalogo-costos-sql";
import { ARCHIVO_SISTEMA } from "@/lib/productos/precios-vigentes";
import { parejasEntreListas } from "@/lib/insumos-ficha";

type Sql = NeonQueryFunction<false, false>;

/**
 * El nombre «de origen» de cada insumo, para emparejar las dos listas sin que lo mueva un nombre corregido: el
 * del último Excel; si nunca estuvo en el Excel, el primero con que se creó en el sistema.
 */
export async function leerNombresOriginales(sql: Sql): Promise<Map<string, string>> {
  const rows = (await sql`
    SELECT DISTINCT ON (origen, upper(sku)) origen, sku, nombre FROM insumos_precios
    ORDER BY origen, upper(sku), (archivo = ${ARCHIVO_SISTEMA}) ASC,
             CASE WHEN archivo = ${ARCHIVO_SISTEMA} THEN fecha END ASC, fecha DESC`) as { origen: string; sku: string; nombre: string }[];
  return new Map(rows.map((r) => [claveInsumo(r.origen, r.sku), r.nombre]));
}

/** Las parejas entre listas («origen|SKU» → la del otro lado), por el nombre de origen. */
export async function leerParejas(sql: Sql, vigentes: { origen: string; sku: string; nombre: string }[], originales?: Map<string, string>): Promise<Map<string, string>> {
  const o = originales ?? await leerNombresOriginales(sql);
  return parejasEntreListas(vigentes.map((v) => ({ origen: v.origen, sku: v.sku, nombre: o.get(claveInsumo(v.origen, v.sku)) ?? v.nombre })));
}

