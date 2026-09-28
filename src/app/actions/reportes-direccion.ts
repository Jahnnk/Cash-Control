"use server";

/**
 * Los reportes de Byte que sube dirección (Jahnn) · solo sesión completa.
 * Qué es cada uno y cómo se lee: src/lib/productos/reportes-direccion.ts.
 *
 *   · Ventas de <MES> → byte_ventas_direccion. Manda sobre el reporte que
 *     subió la sede (vista byte_ventas_efectiva); el de la sede se conserva
 *     para comparar. El día de hoy no se guarda: está a medias.
 *   · Platos con menor rotación → productos_menor_rotacion (foto por sede).
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { requireFullSession } from "@/lib/session-access";
import type { ParsedVentaDay } from "@/lib/incentives/byte-ventas-parser";
import { soloDiasCerrados, grupoSinVenta, type ProductoMenorRotacion, type GrupoSinVenta } from "@/lib/productos/reportes-direccion";
import { familiaDeProducto, FAMILIA_OTROS } from "@/lib/productos/panorama";

const sql = neon(process.env.DATABASE_URL!);
const SEDES = [1, 2, 3];
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refrescar() {
  revalidatePath("/grupo/productos");
  revalidatePath("/grupo/dashboard");
  revalidatePath("/", "layout");
}

/* ─────────────────────────── Ventas de <MES> ─────────────────────────── */

export type ComparacionVentas = {
  /** Días que se van a guardar (sin el de hoy). */
  dias: number;
  total: number;
  desde: string | null;
  hasta: string | null;
  /** Días del archivo que se descartan por no haber terminado. */
  descartados: { date: string; total: number }[];
  /** Días que la sede no subió. */
  nuevos: number;
  /** Días en que la sede subió lo mismo (± S/1). */
  iguales: number;
  /** Días en que la sede subió otra cifra. */
  distintos: { date: string; sede: number; tuyo: number }[];
};

/** Antes de guardar: qué trae el archivo y cómo se compara con lo que subió la sede. */
export async function compararVentasDireccion(bId: number, days: ParsedVentaDay[]): Promise<Res<{ data: ComparacionVentas }>> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  if (!SEDES.includes(bId)) return { ok: false, error: "Sede inválida." };
  const { cerrados, descartados } = soloDiasCerrados(days, hoyLima());
  if (cerrados.length === 0) return { ok: false, error: "El archivo no trae días cerrados (solo el de hoy)." };
  const fechas = cerrados.map((d) => d.date).sort();
  const sede = (await sql`
    SELECT date::text AS date, total::float AS total FROM byte_ventas_daily
    WHERE business_id = ${bId} AND date BETWEEN ${fechas[0]} AND ${fechas[fechas.length - 1]} AND COALESCE(source, 'import') = 'import'
  `) as { date: string; total: number }[];
  const deSede = new Map(sede.map((s) => [s.date, s.total]));
  const distintos: ComparacionVentas["distintos"] = [];
  let iguales = 0, nuevos = 0;
  for (const d of cerrados) {
    const s = deSede.get(d.date);
    if (s === undefined) nuevos++;
    else if (Math.abs(s - d.total) < 1) iguales++;
    else distintos.push({ date: d.date, sede: s, tuyo: d.total });
  }
  return {
    ok: true,
    data: {
      dias: cerrados.length,
      total: Math.round(cerrados.reduce((t, d) => t + d.total, 0) * 100) / 100,
      desde: fechas[0], hasta: fechas[fechas.length - 1],
      descartados: descartados.map((d) => ({ date: d.date, total: d.total })),
      nuevos, iguales, distintos,
    },
  };
}

export async function importVentasDireccion(bId: number, input: { days: ParsedVentaDay[]; fileName: string | null }): Promise<Res<{ guardados: number; descartados: number }>> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  if (!SEDES.includes(bId)) return { ok: false, error: "Sede inválida." };
  if (!Array.isArray(input.days) || input.days.length === 0 || input.days.length > 62) return { ok: false, error: "El archivo no trae días válidos." };
  for (const d of input.days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Number.isFinite(d.total) || d.total < 0 || !Number.isFinite(d.pedidos) || d.pedidos < 0) {
      return { ok: false, error: `Fila inválida: ${d.date}` };
    }
  }
  const { cerrados, descartados } = soloDiasCerrados(input.days, hoyLima());
  if (cerrados.length === 0) return { ok: false, error: "El archivo no trae días cerrados (solo el de hoy)." };
  try {
    await sql.transaction(cerrados.map((d) => sql`
      INSERT INTO byte_ventas_direccion (business_id, date, pedidos, descuentos, total, file_name, imported_at)
      VALUES (${bId}, ${d.date}, ${d.pedidos}, ${d.descuentos}, ${d.total}, ${input.fileName}, now())
      ON CONFLICT (business_id, date) DO UPDATE
        SET pedidos = EXCLUDED.pedidos, descuentos = EXCLUDED.descuentos, total = EXCLUDED.total,
            file_name = EXCLUDED.file_name, imported_at = now()
    `));
    refrescar();
    return { ok: true, guardados: cerrados.length, descartados: descartados.length };
  } catch (e) {
    console.error("[importVentasDireccion] failed:", e);
    return { ok: false, error: "No se pudo guardar el reporte de ventas." };
  }
}

/* ─────────────────────────── Menor rotación ─────────────────────────── */

export async function importMenorRotacion(bId: number, input: { desde: string; hasta: string; productos: ProductoMenorRotacion[]; fileName: string | null }): Promise<Res<{ guardados: number }>> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  if (!SEDES.includes(bId)) return { ok: false, error: "Sede inválida." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(input.hasta)) return { ok: false, error: "Rango inválido." };
  if (!Array.isArray(input.productos) || input.productos.length === 0 || input.productos.length > 3000) return { ok: false, error: "El archivo no trae productos." };
  try {
    // La lista es una foto: la nueva reemplaza a la anterior de la sede.
    await sql.transaction([
      sql`DELETE FROM productos_menor_rotacion WHERE business_id = ${bId}`,
      ...input.productos.map((p) => sql`
        INSERT INTO productos_menor_rotacion (business_id, desde, hasta, producto, tipo_byte, stock, vendido, ultima_venta, nunca_vendido, precio, file_name)
        VALUES (${bId}, ${input.desde}, ${input.hasta}, ${p.producto.slice(0, 200)}, ${p.tipoByte?.slice(0, 80) ?? null}, ${p.stock},
                ${p.vendido}, ${p.ultimaVenta}, ${p.nuncaVendido}, ${p.precio}, ${input.fileName})
      `),
    ]);
    refrescar();
    return { ok: true, guardados: input.productos.length };
  } catch (e) {
    console.error("[importMenorRotacion] failed:", e);
    return { ok: false, error: "No se pudo guardar el reporte de menor rotación." };
  }
}

export type ProductoSinVenta = ProductoMenorRotacion & { grupo: GrupoSinVenta };

export type SinVentaSede = {
  businessId: number;
  sede: string;
  desde: string;
  hasta: string;
  subidoEl: string;
  /** Productos de la carta (lo que no es carta —extras, empaques, delivery— va aparte). */
  carta: ProductoSinVenta[];
  noCarta: number;
};

/** "Productos que no se venden", por sede, de la última lista de menor rotación que subió dirección. */
export async function getProductosSinVenta(): Promise<Res<{ sedes: SinVentaSede[] }>> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  try {
    const rows = (await sql`
      SELECT business_id, desde::text, hasta::text, (imported_at AT TIME ZONE 'America/Lima')::date::text AS subido,
             producto, tipo_byte, stock::float, vendido::float, ultima_venta::text, nunca_vendido, precio::float
      FROM productos_menor_rotacion ORDER BY business_id, vendido, producto
    `) as { business_id: number; desde: string; hasta: string; subido: string; producto: string; tipo_byte: string | null; stock: number | null; vendido: number; ultima_venta: string | null; nunca_vendido: boolean; precio: number | null }[];
    const nombres: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };
    const sedes: SinVentaSede[] = [];
    for (const bId of [2, 3, 1]) {
      const fs = rows.filter((r) => r.business_id === bId);
      if (fs.length === 0) continue;
      const productos = fs.map((r) => ({
        producto: r.producto, tipoByte: r.tipo_byte, stock: r.stock, vendido: r.vendido, ultimaVenta: r.ultima_venta,
        nuncaVendido: r.nunca_vendido, precio: r.precio,
      }));
      const esCarta = (p: ProductoMenorRotacion) => familiaDeProducto(p.producto) !== FAMILIA_OTROS;
      const carta = productos
        .filter(esCarta)
        .map((p) => ({ ...p, grupo: grupoSinVenta(p, fs[0].hasta) }))
        .filter((p): p is ProductoSinVenta => p.grupo !== null);
      sedes.push({
        businessId: bId, sede: nombres[bId], desde: fs[0].desde, hasta: fs[0].hasta, subidoEl: fs[0].subido,
        carta, noCarta: productos.filter((p) => !esCarta(p)).length,
      });
    }
    return { ok: true, sedes };
  } catch (e) {
    console.error("[getProductosSinVenta] failed:", e);
    return { ok: false, error: "No se pudo leer la lista de productos que no se venden." };
  }
}
