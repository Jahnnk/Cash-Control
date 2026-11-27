"use server";

/**
 * Recetas del sistema · Actions (solo dirección: Jahnn y Kelly — decisión
 * de Jahnn, 23-sep-2026; la administradora registra mermas pero no cambia
 * costos). La lógica de costos vive en lib/recetas.ts.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole } from "@/lib/session-access";
import { leerCatalogo, type Catalogo } from "@/lib/catalogo-costos-sql";
import { leerCarta, leerCambiosCarta, leerCatalogoCafeteria, type CatalogoCafeteria } from "@/lib/carta-sql";
import { CAFETERIAS } from "@/lib/recetas-cafeteria";
import { leerPreciosB2BByte } from "@/lib/productos/precio-b2b-byte-sql";
import type { PrecioB2BByte } from "@/lib/productos/precio-b2b-byte";
import { aplicarPanadero, idsProduccion } from "@/lib/recetas-panadero";
import { erroresDeReceta, refDeReceta, type RecetaSistema } from "@/lib/recetas";
import type { DetalleReceta } from "@/lib/costos-preparaciones";

const sql = neon(process.env.DATABASE_URL!);

/** Por ahora solo Atelier (ver actions/costos-preparaciones.ts). */
const ATELIER = 1;

async function quien(): Promise<string | null> {
  const role = await getSessionRole();
  return role?.kind === "full" ? role.quien : null;
}

/** Refs de las recetas archivadas (26-nov-2026): siguen costeando, solo salen de la lista principal. */
async function leerArchivadas(bId: number): Promise<string[]> {
  try {
    return ((await sql`SELECT ref FROM recetas_archivadas WHERE business_id = ${bId}`) as { ref: string }[]).map((r) => r.ref);
  } catch {
    return [];
  }
}

export async function getRecetas(): Promise<{ ok: true; catalogo: Catalogo; archivadas: string[] } | { ok: false; error: string }> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  const [catalogo, archivadas] = await Promise.all([leerCatalogo(sql, ATELIER), leerArchivadas(ATELIER)]);
  return { ok: true, catalogo, archivadas };
}

/** Archivar o desarchivar una receta (Atelier o cafeterías). No cambia costos ni recetas que la usan. */
export async function archivarReceta(input: { sede: SedeReceta; ref: string; archivar: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const autor = await quien();
  if (!autor) return { ok: false, error: "Solo dirección." };
  const ref = String(input.ref ?? "").trim().slice(0, 80);
  if (!ref) return { ok: false, error: "Falta la receta." };
  const bId = bIdDe(input.sede);
  try {
    if (input.archivar) {
      await sql`INSERT INTO recetas_archivadas (business_id, ref, archivada_por) VALUES (${bId}, ${ref}, ${autor})
                ON CONFLICT (business_id, ref) DO NOTHING`;
    } else {
      await sql`DELETE FROM recetas_archivadas WHERE business_id = ${bId} AND ref = ${ref}`;
    }
    revalidatePath("/grupo/recetas");
    return { ok: true };
  } catch (e) {
    console.error("[archivarReceta]", e);
    return { ok: false, error: /recetas_archivadas.*does not exist/i.test(String(e)) ? "Falta crear la tabla de recetas archivadas." : "No se pudo archivar. Intenta de nuevo." };
  }
}

/** Recetas de las cafeterías (26-nov-2026): la lista de costos de Fonavi y Centro con sus recetas. */
export async function getRecetasCafeteria(): Promise<{ ok: true; catalogo: CatalogoCafeteria; archivadas: string[] } | { ok: false; error: string }> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  try {
    const [catalogo, archivadas] = await Promise.all([leerCatalogoCafeteria(sql), leerArchivadas(CAFETERIAS)]);
    return { ok: true, catalogo, archivadas };
  } catch (e) {
    console.error("[getRecetasCafeteria]", e);
    return { ok: false, error: "No se pudieron leer las recetas de las cafeterías." };
  }
}

/** De quién es la receta: Atelier o las cafeterías (Fonavi y Centro comparten recetas). */
export type SedeReceta = "atelier" | "cafeterias";
const bIdDe = (sede: SedeReceta | undefined) => (sede === "cafeterias" ? CAFETERIAS : ATELIER);

export type RecetaInput = {
  /** Por defecto Atelier. */
  sede?: SedeReceta;
  /** null = receta nueva. */
  id: number | null;
  nombre: string;
  tipo: RecetaSistema["tipo"];
  categoria: string | null;
  detalle: DetalleReceta;
  /** Ref del ítem del Excel que reemplaza (al modificar una receta del Excel). */
  reemplaza: string | null;
};

export async function guardarReceta(input: RecetaInput): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  const autor = await quien();
  if (!autor) return { ok: false, error: "Solo dirección." };
  const pan = input.detalle.panadero;
  const panadero = pan ? {
    pesoMasa: Number(pan.pesoMasa) || 0,
    piezas: pan.piezas !== null && pan.piezas !== undefined ? Number(pan.piezas) : null,
    ...(idsProduccion(pan).length > 0 ? { produccion: idsProduccion(pan).length === 1 ? idsProduccion(pan)[0] : idsProduccion(pan) } : {}),
  } : null;
  // En % panadero las cantidades se recalculan aquí desde los % (no se confía en las del navegador).
  const detalle: DetalleReceta = aplicarPanadero({
    rendimiento: input.detalle.rendimiento && input.detalle.rendimiento > 0 ? Number(input.detalle.rendimiento) : null,
    merma: Number(input.detalle.merma) || 0,
    ingredientes: (input.detalle.ingredientes ?? []).map((i) => ({
      ref: i.ref, nombre: String(i.nombre ?? "").trim(), unidad: String(i.unidad ?? "").trim().toLowerCase(), cantidad: Number(i.cantidad),
      ...(panadero && Number(i.pct) > 0 ? { pct: Number(i.pct) } : {}),
      ...(panadero?.produccion && Number(i.prod) > 0 ? { prod: Number(i.prod) } : {}),
    })),
    ...(panadero ? { panadero } : {}),
    ...(Array.isArray(input.detalle.byte) && input.detalle.byte.length > 0 ? { byte: input.detalle.byte.map(String) } : {}),
    ...(input.detalle.paraLlevar === true && input.tipo === "producto" ? { paraLlevar: true } : {}),
  });
  const errores = erroresDeReceta({ nombre: input.nombre ?? "", tipo: input.tipo, detalle });
  if (errores.length > 0) return { ok: false, error: errores[0] };

  const bId = bIdDe(input.sede);
  let refs: Set<string>;
  let reemplazables: Set<string>;
  if (bId === CAFETERIAS) {
    const c = await leerCatalogoCafeteria(sql);
    refs = new Set([...c.base.map((i) => i.ref), ...c.recetas.map((r) => refDeReceta(r.id))]);
    reemplazables = new Set(c.carta.map((x) => x.ref));
  } else {
    const { excel, recetas, insumosSistema } = await leerCatalogo(sql, ATELIER);
    refs = new Set([...excel.map((i) => i.ref), ...insumosSistema.map((i) => i.ref), ...recetas.map((r) => refDeReceta(r.id))]);
    reemplazables = new Set(excel.map((i) => i.ref));
  }
  const faltan = detalle.ingredientes.filter((i) => !i.ref || !refs.has(i.ref));
  if (faltan.length > 0) return { ok: false, error: `"${faltan[0].nombre}" ya no está en la lista de costos. Vuelve a elegirlo.` };
  if (input.id !== null && detalle.ingredientes.some((i) => i.ref === refDeReceta(input.id!))) {
    return { ok: false, error: "Una receta no puede usarse a sí misma como ingrediente." };
  }
  const reemplaza = input.reemplaza && reemplazables.has(input.reemplaza) ? input.reemplaza : null;
  const nombre = input.nombre.trim();
  const json = JSON.stringify(detalle);
  try {
    if (input.id === null) {
      const rows = (await sql`
        INSERT INTO recetas_sistema (business_id, nombre, tipo, categoria, detalle, reemplaza_ref, actualizado_por)
        VALUES (${bId}, ${nombre}, ${input.tipo}, ${input.categoria}, ${json}::jsonb, ${reemplaza}, ${autor})
        RETURNING id
      `) as { id: number }[];
      revalidatePath("/grupo/recetas");
      return { ok: true, ref: refDeReceta(rows[0].id) };
    }
    const rows = (await sql`
      UPDATE recetas_sistema
      SET nombre = ${nombre}, tipo = ${input.tipo}, categoria = ${input.categoria}, detalle = ${json}::jsonb,
          actualizado_por = ${autor}, actualizado_el = NOW()
      WHERE id = ${input.id} AND business_id = ${bId}
      RETURNING id
    `) as { id: number }[];
    if (rows.length === 0) return { ok: false, error: "Esa receta ya no existe." };
    revalidatePath("/grupo/recetas");
    return { ok: true, ref: refDeReceta(input.id) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/recetas_sistema_reemplaza_uq/.test(msg)) return { ok: false, error: "Esa receta del Excel ya tiene una versión en el sistema: edita esa." };
    if (/recetas_sistema/.test(msg) && /does not exist/.test(msg)) return { ok: false, error: "Falta crear la tabla de recetas (migración pendiente)." };
    console.error("[guardarReceta] failed:", e);
    return { ok: false, error: "No se pudo guardar la receta." };
  }
}

/**
 * Borra una receta del sistema. Si reemplazaba a una del Excel, vuelve a
 * valer la del Excel. Las mermas ya registradas guardan su costo: no cambian.
 */
export async function eliminarReceta(id: number, sede?: SedeReceta): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  const bId = bIdDe(sede);
  const { recetas } = bId === CAFETERIAS ? await leerCatalogoCafeteria(sql) : await leerCatalogo(sql, ATELIER);
  const usadaPor = recetas.filter((r) => r.id !== id && r.detalle.ingredientes.some((i) => i.ref === refDeReceta(id)));
  const propia = recetas.find((r) => r.id === id);
  if (usadaPor.length > 0 && !propia?.reemplaza) {
    return { ok: false, error: `No se puede borrar: la usa "${usadaPor[0].nombre}". Quítala de esa receta primero.` };
  }
  try {
    await sql`DELETE FROM recetas_sistema WHERE id = ${id} AND business_id = ${bId}`;
  } catch (e) {
    console.error("[eliminarReceta] failed:", e);
    return { ok: false, error: "No se pudo borrar la receta." };
  }
  revalidatePath("/grupo/recetas");
  return { ok: true };
}

/** Precios de venta guardados de un producto de Atelier (los que falten se muestran como sugeridos). */
export type PreciosVenta = {
  b2b?: number; interno?: number; carta?: number;
  /** Ref en la carta, para cambiar interno y carta. */ cartaRef?: string;
  /** El precio B2B real de Byte (fase 4, 26-nov-2026): manda sobre `b2b`, que queda para lo que no se vende en Byte. */
  b2bByte?: PrecioB2BByte;
};

/**
 * Precios de venta por ref de receta (25-nov-2026, «Ruta de precios»): B2B de precios_b2b; interno y carta de
 * la carta de las cafeterías (los AT- del Excel por su ref; los productos nuevos por la receta que usan).
 */
export async function getPreciosVenta(): Promise<{ ok: true; precios: Record<string, PreciosVenta> } | { ok: false; error: string }> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  try {
    const [b2b, carta, cambios, catalogo] = await Promise.all([
      (sql`SELECT ref, precio::float AS precio FROM precios_b2b` as unknown as Promise<{ ref: string; precio: number }[]>).catch(() => []),
      leerCarta(sql),
      leerCambiosCarta(sql),
      leerCatalogo(sql, ATELIER),
    ]);
    const deByte = await leerPreciosB2BByte(sql, catalogo.efectivo).catch(() => new Map<string, PrecioB2BByte>());
    const out: Record<string, PreciosVenta> = {};
    const poner = (ref: string, p: PreciosVenta) => { out[ref] = { ...out[ref], ...p }; };
    for (const r of b2b) if (r.precio > 0) poner(r.ref, { b2b: r.precio });
    const recetaDe = new Map(cambios.filter((c) => c.nuevo && c.receta?.tipo === "atelier" && c.receta.recetaRef).map((c) => [c.ref, (c.receta as { recetaRef: string }).recetaRef]));
    for (const c of carta) {
      // Lo del exhibidor (fuera de la carta digital) también se vende al público: su ruta usa sus precios (26-nov-2026).
      // Primero la receta enlazada: los productos nuevos de Atelier también empiezan con AT- (AT-S001).
      const ref = recetaDe.get(c.ref) ?? (c.ref.startsWith("AT-") ? c.ref : undefined);
      if (!ref) continue;
      poner(ref, { cartaRef: c.ref, ...(c.costo > 0 ? { interno: c.costo } : {}), ...(c.precio && c.precio > 0 ? { carta: c.precio } : {}) });
    }
    for (const [ref, p] of deByte) poner(ref, { b2bByte: p });
    return { ok: true, precios: out };
  } catch (e) {
    console.error("[getPreciosVenta]", e);
    return { ok: false, error: "No se pudieron leer los precios de venta." };
  }
}
