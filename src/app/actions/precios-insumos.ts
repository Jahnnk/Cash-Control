"use server";

/**
 * Precios de insumos en el sistema · Actions (fase 1 de «la carta vive en el sistema», 18-nov-2026).
 *
 * Jahnn cambia el precio de compra de un insumo en Grupo → Recetas y costos, sin tocar ni volver a subir el
 * Excel. Cada cambio es una fila de insumos_precios (fuente «sistema»): entra al historial y mueve los costos
 * de Atelier y de la carta (motor: lib/productos/precios-vigentes.ts). Solo dirección.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { requireFullSession } from "@/lib/session-access";
import { claveInsumo, leerArchivados, leerPreciosVigentes } from "@/lib/catalogo-costos-sql";
import { getSessionRole } from "@/lib/session-access";
import { ARCHIVO_SISTEMA, type PrecioVigente } from "@/lib/productos/precios-vigentes";
import type { AporteInsumo } from "@/lib/productos/desglose-insumos";
import { mejoresPorInsumo } from "@/lib/proveedores-sql";
import type { MejorProveedor } from "@/lib/proveedores";

const sql = neon(process.env.DATABASE_URL!);

export type InsumoConUso = PrecioVigente & {
  /** Productos de la carta de las cafeterías que lo llevan (por su desglose). */
  usos: string[];
  /** El mejor precio de Proveedores para este insumo, ya en su unidad (null = no está conectado o sin precio). */
  proveedor: MejorProveedor | null;
  /** Ya no se compra: no sale en los buscadores de recetas (las recetas que lo usan no cambian). */
  archivado: boolean;
};

export async function getPreciosInsumos(): Promise<{ ok: true; insumos: InsumoConUso[] } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  try {
    const [{ vigentes }, carta, mejores, archivados] = await Promise.all([
      leerPreciosVigentes(sql),
      (sql`SELECT ref, COALESCE(nombre_carta, nombre) AS nombre, desglose FROM costos_carta WHERE desglose IS NOT NULL` as unknown as Promise<{ ref: string; nombre: string; desglose: AporteInsumo[] }[]>).catch(() => []),
      mejoresPorInsumo(sql).catch(() => new Map()),
      leerArchivados(sql),
    ]);
    const usos = new Map<string, Set<string>>();
    for (const c of carta) {
      const origen = c.ref.startsWith("AT-") ? "Atelier" : "Cafetería";
      for (const a of c.desglose ?? []) {
        if (!a.sku) continue;
        const k = `${origen}|${a.sku.toUpperCase()}`;
        usos.set(k, (usos.get(k) ?? new Set()).add(c.nombre));
      }
    }
    return { ok: true, insumos: vigentes.map((v) => ({
      ...v,
      usos: [...(usos.get(`${v.origen}|${v.sku.toUpperCase()}`) ?? [])].sort((a, b) => a.localeCompare(b, "es")),
      proveedor: mejores.get(`${v.origen}|${v.sku.toUpperCase()}`) ?? null,
      archivado: archivados.has(claveInsumo(v.origen, v.sku)),
    })) };
  } catch (e) {
    console.error("[getPreciosInsumos] failed:", e);
    return { ok: false, error: "No se pudieron leer los precios." };
  }
}

/** Guarda el precio nuevo de un insumo desde hoy. Dos cambios el mismo día: vale el último. */
export async function guardarPrecioInsumo(input: { origen: string; sku: string; precio: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  const precio = Math.round(Number(input?.precio) * 10000) / 10000;
  if (!Number.isFinite(precio) || precio <= 0 || precio > 100000) return { ok: false, error: "Escribe un precio mayor que cero." };
  const { vigentes } = await leerPreciosVigentes(sql);
  const v = vigentes.find((x) => x.origen === input?.origen && x.sku === input?.sku);
  if (!v) return { ok: false, error: "No encontré ese insumo en la lista." };
  const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  try {
    await sql`
      INSERT INTO insumos_precios (fecha, origen, sku, nombre, unidad, precio, archivo, fuente)
      VALUES (${fecha}::date, ${v.origen}, ${v.sku}, ${v.nombre}, ${v.unidad}, ${precio}, ${ARCHIVO_SISTEMA}, 'sistema')
      ON CONFLICT (fecha, origen, sku, fuente) DO UPDATE SET precio = EXCLUDED.precio, cargado_el = NOW()`;
  } catch (e) {
    console.error("[guardarPrecioInsumo] failed:", e);
    return { ok: false, error: "No se pudo guardar. Falta preparar la base (migración pendiente)." };
  }
  revalidatePath("/grupo/recetas");
  revalidatePath("/grupo/direccion");
  return { ok: true };
}

/**
 * Archiva (o desarchiva) un insumo que ya no se compra. Sale de los buscadores de recetas; las recetas que ya lo
 * usan conservan su precio. No se borra nada (paso 1 de «una sola lista de insumos», 24-nov-2026). Solo dirección.
 */
export async function archivarInsumo(input: { origen: string; sku: string; archivar: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  const { vigentes } = await leerPreciosVigentes(sql);
  const v = vigentes.find((x) => x.origen === input?.origen && x.sku === input?.sku);
  if (!v) return { ok: false, error: "No encontré ese insumo en la lista." };
  const quien = role.nombre ?? (role.quien === "kelly" ? "Kelly" : "Jahnn");
  try {
    if (input.archivar) {
      await sql`INSERT INTO insumos_archivados (origen, sku, archivado_por) VALUES (${v.origen}, ${v.sku}, ${quien})
                ON CONFLICT (origen, sku) DO NOTHING`;
    } else {
      await sql`DELETE FROM insumos_archivados WHERE origen = ${v.origen} AND sku = ${v.sku}`;
    }
  } catch (e) {
    console.error("[archivarInsumo] failed:", e);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
  revalidatePath("/grupo/recetas");
  return { ok: true };
}
