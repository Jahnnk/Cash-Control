/**
 * Lecturas de Proveedores que comparten Proveedores y Recetas y costos (20-nov-2026): qué producto es qué insumo y
 * el mejor precio de proveedor para cada insumo. Si las tablas aún no existen, devuelve vacío (no rompe Recetas).
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { mejorParaInsumo, vigentes, type MejorProveedor, type Oferta, type OrigenInsumo, type ProveedorCompra } from "./proveedores";

type Sql = NeonQueryFunction<false, false>;

export type EnlaceInsumo = { productoId: number; origen: OrigenInsumo; sku: string; factor: number };

export async function leerEnlaces(sql: Sql): Promise<EnlaceInsumo[]> {
  try {
    return (await sql`SELECT producto_id AS "productoId", origen, sku, factor::float AS factor FROM proveedor_producto_insumos`) as EnlaceInsumo[];
  } catch {
    return [];
  }
}

/** Proveedores activos y el precio vigente de cada (proveedor, producto). */
export async function leerOfertas(sql: Sql): Promise<{ proveedores: (ProveedorCompra & { sedes: number[] })[]; ofertas: Oferta[] }> {
  try {
    const [provs, precios] = await Promise.all([
      sql`SELECT id, nombre, sedes, costo_envio::float AS "costoEnvio", pedido_minimo::float AS "pedidoMinimo"
          FROM proveedores WHERE activo AND tipo = 'proveedor'`,
      sql`SELECT id, proveedor_id AS "proveedorId", producto_id AS "productoId", presentacion, cantidad::float AS cantidad,
                 precio::float AS precio, to_char(fecha, 'YYYY-MM-DD') AS fecha FROM proveedor_precios`,
    ]);
    return { proveedores: provs as (ProveedorCompra & { sedes: number[] })[], ofertas: vigentes(precios as (Oferta & { id: number })[]) };
  } catch {
    return { proveedores: [], ofertas: [] };
  }
}

/** Para cada insumo conectado («origen|SKU»), el mejor precio de proveedor en la unidad del insumo. */
export async function mejoresPorInsumo(sql: Sql): Promise<Map<string, MejorProveedor & { productoId: number }>> {
  const [enlaces, { proveedores, ofertas }] = await Promise.all([leerEnlaces(sql), leerOfertas(sql)]);
  const res = new Map<string, MejorProveedor & { productoId: number }>();
  for (const e of enlaces) {
    const m = mejorParaInsumo(ofertas, proveedores, e.productoId, e.origen, e.factor);
    if (m) res.set(`${e.origen}|${e.sku.toUpperCase()}`, { ...m, productoId: e.productoId });
  }
  return res;
}
