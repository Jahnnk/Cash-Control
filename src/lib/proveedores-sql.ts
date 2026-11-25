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

/** Un proveedor que vende un insumo, con su último precio (Grupo → Insumos y packaging, 24-nov-2026). */
export type OfertaInsumo = {
  productoId: number;
  /** El producto como lo anotan las compras («Leche Condensanda 1.2 Kg»). */
  producto: string;
  unidadProducto: string;
  proveedorId: number;
  proveedor: string;
  /** «Compra de 6 bolsas» o «Precio cotizado: lata de 393 g». */
  presentacion: string;
  cantidad: number;
  precio: number;
  fecha: string;
  /** Lo que cuesta en la unidad del insumo (por kg, litro o unidad). */
  precioInsumo: number;
  /** Anotado a mano (no es una compra registrada en Control de Caja). */
  cotizado: boolean;
};

/** Un producto de proveedor conectado a un insumo (tenga o no precio). */
export type ProductoConectado = { productoId: number; producto: string; unidadProducto: string; factor: number };

/**
 * Para cada insumo («origen|SKU»): los productos de proveedor conectados y el último precio de cada proveedor que
 * lo vende, ya en la unidad del insumo, del más barato al más caro. Sin las tablas, vacío.
 */
export async function leerDondeSeCompra(sql: Sql): Promise<{ ofertas: Map<string, OfertaInsumo[]>; conectados: Map<string, ProductoConectado[]> }> {
  const ofertas = new Map<string, OfertaInsumo[]>();
  const conectados = new Map<string, ProductoConectado[]>();
  try {
    const [enlaces, productos, provs, precios] = await Promise.all([
      leerEnlaces(sql),
      sql`SELECT id, nombre, unidad FROM proveedor_productos WHERE activo` as unknown as Promise<{ id: number; nombre: string; unidad: string }[]>,
      sql`SELECT id, nombre FROM proveedores WHERE activo` as unknown as Promise<{ id: number; nombre: string }[]>,
      sql`SELECT id, proveedor_id AS "proveedorId", producto_id AS "productoId", presentacion, cantidad::float AS cantidad, precio::float AS precio,
                 to_char(fecha, 'YYYY-MM-DD') AS fecha, registrado_por AS "registradoPor", caja_item_id IS NULL AS cotizado
          FROM proveedor_precios` as unknown as Promise<(Oferta & { id: number; registradoPor: string; cotizado: boolean })[]>,
    ]);
    const prod = new Map(productos.map((p) => [p.id, p]));
    const prov = new Map(provs.map((p) => [p.id, p.nombre]));
    const ultimas = vigentes(precios);
    for (const e of enlaces) {
      const p = prod.get(e.productoId);
      if (!p) continue;
      const k = `${e.origen}|${e.sku.toUpperCase()}`;
      conectados.set(k, [...(conectados.get(k) ?? []), { productoId: p.id, producto: p.nombre, unidadProducto: p.unidad, factor: e.factor }]);
      for (const o of ultimas) {
        if (o.productoId !== e.productoId || !(o.cantidad > 0) || !prov.has(o.proveedorId)) continue;
        ofertas.set(k, [...(ofertas.get(k) ?? []), {
          productoId: p.id, producto: p.nombre, unidadProducto: p.unidad, proveedorId: o.proveedorId, proveedor: prov.get(o.proveedorId)!,
          presentacion: o.presentacion, cantidad: o.cantidad, precio: o.precio, fecha: o.fecha,
          precioInsumo: Math.round((o.precio / o.cantidad) * e.factor * 10000) / 10000, cotizado: o.cotizado,
        }]);
      }
    }
    for (const lista of ofertas.values()) lista.sort((a, b) => a.precioInsumo - b.precioInsumo);
  } catch {
    /* sin tablas de proveedores: nada que mostrar */
  }
  return { ofertas, conectados };
}
