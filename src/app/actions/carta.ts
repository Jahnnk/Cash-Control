"use server";

/**
 * Carta de las cafeterías en el sistema · Actions (fase 2a de «la carta vive en el sistema», 18-nov-2026).
 *
 * Jahnn cambia aquí el precio de carta, el precio interno de lo que hace Atelier y la sección, sin tocar ni
 * volver a subir el Excel de pricing. Los cambios viven en carta_sistema y ganan sobre el Excel (motor:
 * lib/productos/carta-sistema.ts; lectura única: lib/carta-sql.ts). Retirar de la carta usa el mismo
 * «archivar» de Productos (un solo concepto). Solo dirección.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { requireFullSession } from "@/lib/session-access";
import { leerCambiosCarta, leerCartaConCostos } from "@/lib/carta-sql";
import { marcaDe, precioValido, type MarcaSistema } from "@/lib/productos/carta-sistema";
import { claveByte, enlazarCosto } from "@/lib/productos/costos-carta";
import { ORIGEN_DE, erroresDeAlta, refNueva, type LineaTienda, type RecetaCarta } from "@/lib/productos/receta-carta";
import { leerCatalogo, leerPreciosVigentes } from "@/lib/catalogo-costos-sql";
import type { PrecioVigente } from "@/lib/productos/precios-vigentes";
import type { CostoPreparacion } from "@/lib/costos-preparaciones";

const sql = neon(process.env.DATABASE_URL!);

export type ProductoCarta = {
  ref: string;
  nombre: string;
  seccion: string | null;
  origen: string | null;
  enCarta: boolean | null;
  /** Precio de carta (S/). */
  precio: number | null;
  /** Lo que le cuesta a la cafetería: su receta, o el precio interno de Atelier / de compra. */
  costo: number;
  /** Costo en insumos (en lo de Atelier, lo que le cuesta a Atelier). */
  costoInsumos: number | null;
  /** Lo que trae el Excel, para mostrar el cambio. */
  excel: { precio: number | null; costo: number; seccion: string | null } | null;
  marca: MarcaSistema;
  actualizadoEl: string | null;
  /** Solo productos nuevos (fase 2b): su receta, para editarlo. */
  receta: RecetaCarta | null;
  /** Nombres con que Byte lo vendió en los últimos 3 meses, y si están archivados en Productos. */
  byte: { nombre: string; clave: string; archivado: boolean }[];
};

const mesLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
function mesesAtras(n: number): string[] {
  const [y, m] = mesLima().split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export async function getCarta(): Promise<{ ok: true; productos: ProductoCarta[]; secciones: string[] } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  try {
    const [{ costos, vinculos }, cambios, excel, ventas, archivados] = await Promise.all([
      leerCartaConCostos(sql),
      leerCambiosCarta(sql),
      (sql`SELECT ref, precio::float AS precio, costo::float AS costo, seccion FROM costos_carta` as unknown as Promise<{ ref: string; precio: number | null; costo: number; seccion: string | null }[]>).catch(() => []),
      (sql`SELECT product_name_raw AS nombre, SUM(units)::float AS u, SUM(revenue)::float AS r FROM product_month_sales
           WHERE business_id IN (2, 3) AND month = ANY(${mesesAtras(3)}::text[]) GROUP BY 1` as unknown as Promise<{ nombre: string; u: number; r: number }[]>).catch(() => []),
      (sql`SELECT clave FROM productos_archivados` as unknown as Promise<{ clave: string }[]>).catch(() => []),
    ]);
    const porRefCambio = new Map(cambios.map((c) => [c.ref, c]));
    const porRefExcel = new Map(excel.map((e) => [e.ref, e]));
    const arch = new Set(archivados.map((a) => a.clave));
    const byte = new Map<string, ProductoCarta["byte"]>();
    for (const v of ventas) {
      const nombre = v.nombre.replace(/\s*\((Fonavi|Centro)\)\s*$/i, "").trim();
      const e = enlazarCosto(nombre, costos, vinculos, v.u > 0 ? v.r / v.u : null);
      if (!e) continue;
      const clave = claveByte(nombre);
      const lista = byte.get(e.item.ref) ?? [];
      if (!lista.some((x) => x.clave === clave)) lista.push({ nombre, clave, archivado: arch.has(clave) });
      byte.set(e.item.ref, lista);
    }
    const productos: ProductoCarta[] = costos
      .filter((c) => c.precio !== null || porRefCambio.get(c.ref)?.nuevo)
      .map((c) => {
        const cambio = porRefCambio.get(c.ref);
        const ex = porRefExcel.get(c.ref);
        return {
          ref: c.ref, nombre: c.nombreCarta ?? c.nombre, seccion: c.seccion ?? null, origen: c.origen ?? null, enCarta: c.enCarta ?? null,
          precio: c.precio, costo: c.costo, costoInsumos: c.costoInsumos ?? null,
          excel: ex ? { precio: ex.precio, costo: ex.costo, seccion: ex.seccion } : null,
          marca: marcaDe(cambio), actualizadoEl: cambio?.actualizadoEl ?? null, receta: cambio?.nuevo ? cambio.receta ?? null : null,
          byte: (byte.get(c.ref) ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
        };
      })
      // Lo que está fuera de la carta (exhibidor) va al final.
      .sort((a, b) => Number(!a.seccion) - Number(!b.seccion) || (a.seccion ?? "").localeCompare(b.seccion ?? "", "es") || a.nombre.localeCompare(b.nombre, "es"));
    const secciones = [...new Set(costos.map((c) => c.seccion).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, "es"));
    return { ok: true, productos, secciones };
  } catch (e) {
    console.error("[getCarta] failed:", e);
    return { ok: false, error: "No se pudo leer la carta." };
  }
}

/**
 * Guarda los cambios de un producto. Cada campo: un valor = lo pone el sistema; null = vuelve a lo del Excel.
 * El costo solo se cambia en lo que la cafetería no prepara (precio interno de Atelier o de compra): lo que se
 * prepara en la cafetería sale de su receta.
 */
export async function guardarCambioCarta(input: { ref: string; precio: number | null; costo: number | null; seccion: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  const ref = typeof input?.ref === "string" ? input.ref.trim() : "";
  const { costos } = await leerCartaConCostos(sql);
  const item = costos.find((c) => c.ref === ref);
  if (!item) return { ok: false, error: "No encontré ese producto en la carta." };
  const precio = input.precio == null ? null : Math.round(Number(input.precio) * 100) / 100;
  const costo = input.costo == null ? null : Math.round(Number(input.costo) * 10000) / 10000;
  const seccion = typeof input.seccion === "string" && input.seccion.trim() ? input.seccion.trim().slice(0, 60) : null;
  if (precio !== null && !precioValido(precio)) return { ok: false, error: "Escribe un precio de carta mayor que cero." };
  if (costo !== null && !precioValido(costo)) return { ok: false, error: "Escribe un precio interno mayor que cero." };
  if (costo !== null && item.origen === "Cafetería") return { ok: false, error: "Lo que se prepara en la cafetería toma el costo de su receta." };
  const anterior = (await leerCambiosCarta(sql)).find((c) => c.ref === ref);
  try {
    if (precio === null && costo === null && seccion === null && !anterior?.nuevo) {
      await sql`DELETE FROM carta_sistema WHERE ref = ${ref}`;
    } else {
      await sql`
        INSERT INTO carta_sistema (ref, precio, costo, seccion)
        VALUES (${ref}, ${precio}, ${costo}, ${seccion})
        ON CONFLICT (ref) DO UPDATE SET precio = EXCLUDED.precio, costo = EXCLUDED.costo, seccion = EXCLUDED.seccion, actualizado_el = NOW()`;
    }
  } catch (e) {
    console.error("[guardarCambioCarta] failed:", e);
    return { ok: false, error: "No se pudo guardar el cambio." };
  }
  revalidatePath("/grupo/recetas");
  revalidatePath("/grupo/direccion");
  revalidatePath("/grupo/productos");
  return { ok: true };
}

export type OpcionesAlta = {
  /** Lo que compra la cafetería, con su precio vigente. */
  insumos: { sku: string; nombre: string; unidad: string; precio: number }[];
  /** Lo que la cafetería le compra a Atelier, a su precio interno. */
  deAtelier: { ref: string; nombre: string; costo: number }[];
  /** Las recetas de Atelier (Excel + sistema), para enlazar un postre nuevo y conocer su costo en insumos. */
  recetasAtelier: { ref: string; nombre: string; costo: number }[];
};

/** Lo que hace falta para armar un producto nuevo (fase 2b). Solo dirección. */
export async function getOpcionesAlta(): Promise<{ ok: true; data: OpcionesAlta } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  try {
    const [{ vigentes }, { costos }, catalogo] = await Promise.all([leerPreciosVigentes(sql), leerCartaConCostos(sql), leerCatalogo(sql, 1)]);
    const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");
    return {
      ok: true,
      data: {
        insumos: vigentes.filter((v) => v.origen === "Cafetería").map((v) => ({ sku: v.sku, nombre: v.nombre, unidad: v.unidad, precio: v.precio })).sort(porNombre),
        deAtelier: costos.filter((c) => c.ref.startsWith("AT-") && c.costo > 0).map((c) => ({ ref: c.ref, nombre: c.nombreCarta ?? c.nombre, costo: c.costo })).sort(porNombre),
        recetasAtelier: catalogo.efectivo.filter((i) => i.tipo === "producto").map((i) => ({ ref: i.ref, nombre: i.nombre, costo: i.costo })).sort(porNombre),
      },
    };
  } catch (e) {
    console.error("[getOpcionesAlta] failed:", e);
    return { ok: false, error: "No se pudo leer la lista de insumos." };
  }
}

const UNIDADES_LINEA = new Set(["g", "kg", "ml", "l", "und"]);

function limpiarReceta(r: RecetaCarta | null | undefined): RecetaCarta | null {
  if (!r || typeof r !== "object") return null;
  if (r.tipo === "reventa") return { tipo: "reventa" };
  if (r.tipo === "atelier") return { tipo: "atelier", recetaRef: typeof r.recetaRef === "string" && r.recetaRef.trim() ? r.recetaRef.trim().slice(0, 40) : null };
  if (r.tipo !== "tienda" || !Array.isArray(r.lineas)) return null;
  const lineas: LineaTienda[] = r.lineas.slice(0, 60)
    .filter((l) => l && (l.tipo === "insumo" || l.tipo === "atelier") && typeof l.ref === "string" && l.ref.trim())
    .map((l) => ({
      tipo: l.tipo, ref: l.ref.trim().slice(0, 40), nombre: String(l.nombre ?? "").slice(0, 120),
      cantidad: Number(l.cantidad), unidad: l.tipo === "atelier" ? "und" : UNIDADES_LINEA.has(l.unidad) ? l.unidad : "g",
    }));
  const merma = Number(r.merma);
  return { tipo: "tienda", porciones: Number(r.porciones), merma: Number.isFinite(merma) ? Math.min(Math.max(merma, 0), 0.95) : 0, lineas };
}

/**
 * Crea (sin ref) o corrige (con ref) un producto nuevo de la carta. Vale desde ya en Productos, Precios y el
 * simulador; Byte lo enlaza solo por el nombre cuando empiece a venderse. Solo dirección.
 */
export async function guardarProductoNuevo(input: {
  ref: string | null; nombre: string; seccion: string | null; precio: number | null; costo: number | null; receta: RecetaCarta;
}): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  const receta = limpiarReceta(input?.receta);
  if (!receta) return { ok: false, error: "Elige cómo se hace el producto." };
  const nombre = typeof input.nombre === "string" ? input.nombre.trim().slice(0, 120) : "";
  const precio = input.precio == null ? null : Math.round(Number(input.precio) * 100) / 100;
  const costo = receta.tipo === "tienda" || input.costo == null ? null : Math.round(Number(input.costo) * 10000) / 10000;
  const errores = erroresDeAlta({ nombre, precio, costo, receta });
  if (errores.length > 0) return { ok: false, error: errores[0] };
  if (precio !== null && !precioValido(precio)) return { ok: false, error: "El precio de carta no es válido." };
  if (costo !== null && !precioValido(costo)) return { ok: false, error: "El costo no es válido." };
  const seccion = typeof input.seccion === "string" && input.seccion.trim() ? input.seccion.trim().slice(0, 60) : null;
  try {
    const cambios = await leerCambiosCarta(sql);
    let ref = typeof input.ref === "string" ? input.ref.trim() : "";
    if (ref) {
      if (!cambios.some((c) => c.ref === ref && c.nuevo)) return { ok: false, error: "Solo se corrigen aquí los productos creados en el sistema." };
      // Si cambia de clase (tienda ↔ Atelier), la ref ya no calza: se le da una nueva.
      if ((receta.tipo === "atelier") !== ref.startsWith("AT-")) {
        await sql`DELETE FROM carta_sistema WHERE ref = ${ref} AND nuevo = true`;
        ref = "";
      }
    }
    if (!ref) {
      const { costos } = await leerCartaConCostos(sql);
      ref = refNueva(receta.tipo, [...costos.map((c) => c.ref), ...cambios.map((c) => c.ref)]);
    }
    await sql`
      INSERT INTO carta_sistema (ref, nombre, nombre_carta, seccion, origen, categoria, precio, costo, receta, nuevo)
      VALUES (${ref}, ${nombre}, ${nombre}, ${seccion}, ${ORIGEN_DE[receta.tipo]}, ${seccion?.toUpperCase() ?? null}, ${precio}, ${costo}, ${JSON.stringify(receta)}::jsonb, true)
      ON CONFLICT (ref) DO UPDATE SET nombre = EXCLUDED.nombre, nombre_carta = EXCLUDED.nombre_carta, seccion = EXCLUDED.seccion,
        origen = EXCLUDED.origen, categoria = EXCLUDED.categoria, precio = EXCLUDED.precio, costo = EXCLUDED.costo,
        receta = EXCLUDED.receta, nuevo = true, actualizado_el = NOW()`;
    revalidatePath("/grupo/recetas");
    revalidatePath("/grupo/direccion");
    revalidatePath("/grupo/productos");
    return { ok: true, ref };
  } catch (e) {
    console.error("[guardarProductoNuevo] failed:", e);
    return { ok: false, error: "No se pudo guardar el producto." };
  }
}

/** Quita un producto creado en el sistema (por ejemplo, uno que se creó por error). Los del Excel no. */
export async function quitarProductoNuevo(ref: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  try {
    await sql`DELETE FROM carta_sistema WHERE ref = ${String(ref ?? "")} AND nuevo = true`;
    revalidatePath("/grupo/recetas");
    return { ok: true };
  } catch (e) {
    console.error("[quitarProductoNuevo] failed:", e);
    return { ok: false, error: "No se pudo quitar." };
  }
}

/** Todo lo que lleva el Excel de la carta (fase 3): se arma en el navegador (lib/carta-xlsx.ts). Solo dirección. */
export async function getDatosExcelCarta(): Promise<{ ok: true; carta: ProductoCarta[]; insumos: PrecioVigente[]; atelier: CostoPreparacion[] } | { ok: false; error: string }> {
  const carta = await getCarta();
  if (!carta.ok) return carta;
  try {
    const [{ vigentes }, catalogo] = await Promise.all([leerPreciosVigentes(sql), leerCatalogo(sql, 1)]);
    return { ok: true, carta: carta.productos, insumos: vigentes, atelier: catalogo.efectivo.map((i) => ({ ...i, detalle: undefined })) };
  } catch (e) {
    console.error("[getDatosExcelCarta] failed:", e);
    return { ok: false, error: "No se pudo armar el Excel." };
  }
}
