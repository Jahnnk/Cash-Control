"use server";

/**
 * Costos de preparaciones de Atelier · Actions.
 *
 * Jahnn sube su Excel maestro de pricing en Grupo → Configuración (se lee
 * en el navegador con lib/costos-preparaciones.ts); el panel
 * de Atelier usa la lista para costear las mermas solo.
 *
 * Cada subida reemplaza la lista completa de la sede: es una foto del Excel
 * vigente. Las mermas ya registradas guardan su propio costo, así que no se
 * mueven.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole, requireFullSession } from "@/lib/session-access";
import type { CostoPreparacion, TipoCosto } from "@/lib/costos-preparaciones";
import type { CostoCarta } from "@/lib/productos/costos-carta";
import type { PrecioInsumo } from "@/lib/productos/insumos-precios";
import { leerCatalogo } from "@/lib/catalogo-costos-sql";

const sql = neon(process.env.DATABASE_URL!);

/** Por ahora solo Atelier (pedido de Jahnn: "solamente fíjate en Atelier"). */
const ATELIER = 1;
const MAX_ITEMS = 5000;

const TIPOS: TipoCosto[] = ["producto", "preparacion", "insumo"];
const UNIDADES = ["und", "kg", "l"];

/**
 * Reemplaza la lista de costos de Atelier. El Excel se lee en el navegador
 * (pesa más que el límite de 1 MB de las actions); acá se valida cada ítem.
 */
export async function guardarCostos(input: {
  archivo: string;
  items: CostoPreparacion[];
  /**
   * Recetas del sistema que ahora trae el Excel con el mismo nombre y que
   * Jahnn eligió reemplazar por la del Excel: se borran y quien las usaba
   * como ingrediente pasa a usar la del Excel.
   */
  quedarmeConExcel?: { id: number; ref: string }[];
  /** Costo y precio de carta de las cafeterías (ver lib/productos/costos-carta.ts). */
  carta?: CostoCarta[];
  /** Precio de compra de cada insumo: la foto del historial (lib/productos/insumos-precios.ts, 18-nov-2026). */
  precios?: PrecioInsumo[];
}): Promise<{ ok: true; guardados: number; reemplazadas: number } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  const it = Array.isArray(input.items) ? input.items : [];
  if (it.length === 0) return { ok: false, error: "El Excel no trae costos de Atelier." };
  if (it.length > MAX_ITEMS) return { ok: false, error: "El Excel trae demasiados ítems." };
  const refs = new Set<string>();
  for (const i of it) {
    if (!i?.ref?.trim() || !i.nombre?.trim() || !TIPOS.includes(i.tipo) || !UNIDADES.includes(i.unidad)
      || !Number.isFinite(i.costo) || i.costo < 0 || refs.has(i.ref)) {
      return { ok: false, error: `Ítem inválido en la lista: "${i?.nombre ?? i?.ref ?? "?"}".` };
    }
    refs.add(i.ref);
  }
  if (!it.some((i) => i.tipo === "producto")) {
    return { ok: false, error: "No encontré productos de Atelier en la hoja PRICING. ¿Es el Excel maestro de pricing?" };
  }
  const archivo = String(input.archivo ?? "").slice(0, 200);
  try {
    await sql.transaction([
      sql`DELETE FROM costos_preparaciones WHERE business_id = ${ATELIER}`,
      sql`
        INSERT INTO costos_preparaciones (business_id, ref, tipo, nombre, categoria, unidad, costo, archivo, detalle)
        SELECT ${ATELIER}, t.ref, t.tipo, t.nombre, t.categoria, t.unidad, t.costo, ${archivo}, t.detalle::jsonb
        FROM unnest(
          ${it.map((i) => i.ref.trim())}::text[], ${it.map((i) => i.tipo)}::text[], ${it.map((i) => i.nombre.trim())}::text[],
          ${it.map((i) => i.categoria ?? null)}::text[], ${it.map((i) => i.unidad)}::text[], ${it.map((i) => i.costo)}::numeric[],
          ${it.map((i) => (i.detalle ? JSON.stringify(i.detalle) : null))}::text[]
        ) AS t(ref, tipo, nombre, categoria, unidad, costo, detalle)`,
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/costos_preparaciones/.test(msg) && /does not exist/.test(msg)) {
      return { ok: false, error: "Falta crear la tabla de costos en la base de datos (migración pendiente)." };
    }
    console.error("[guardarCostos] failed:", e);
    return { ok: false, error: "No se pudo guardar la lista de costos." };
  }
  await guardarCarta(input.carta ?? [], archivo);
  await guardarDesglose(input.carta ?? []);
  await guardarPrecios(input.precios ?? [], archivo);
  const reemplazadas = await quedarmeConLasDelExcel(input.quedarmeConExcel ?? [], refs);
  revalidatePath("/grupo/recetas");
  return { ok: true, guardados: it.length, reemplazadas };
}

/** La carta de las cafeterías se reemplaza entera con cada Excel (si trae). */
async function guardarCarta(carta: CostoCarta[], archivo: string): Promise<void> {
  const ok = carta.filter((c) => c?.ref?.trim() && c.nombre?.trim() && Number.isFinite(c.costo) && c.costo >= 0).slice(0, 5000);
  if (ok.length === 0) return;
  // Antes de la migración de sección y en-carta (7-nov-2026) se guarda sin esas dos columnas.
  try {
    await sql.transaction([
      sql`DELETE FROM costos_carta`,
      sql`
        INSERT INTO costos_carta (ref, nombre, nombre_carta, categoria, costo, precio, archivo, origen, insumos, seccion, en_carta)
        SELECT t.ref, t.nombre, t.nombre_carta, t.categoria, t.costo, t.precio, ${archivo}, t.origen, t.insumos::jsonb, t.seccion, t.en_carta
        FROM unnest(
          ${ok.map((c) => c.ref.trim())}::text[], ${ok.map((c) => c.nombre.trim())}::text[], ${ok.map((c) => c.nombreCarta ?? null)}::text[],
          ${ok.map((c) => c.categoria ?? null)}::text[], ${ok.map((c) => c.costo)}::numeric[], ${ok.map((c) => (c.precio && Number.isFinite(c.precio) ? c.precio : null))}::numeric[],
          ${ok.map((c) => (typeof c.origen === "string" ? c.origen.slice(0, 40) : null))}::text[],
          ${ok.map((c) => (Array.isArray(c.insumos) ? JSON.stringify(c.insumos.slice(0, 60).map((i) => ({ sku: i.sku ?? null, nombre: String(i.nombre).slice(0, 120), exclusivo: !!i.exclusivo }))) : null))}::text[],
          ${ok.map((c) => (typeof c.seccion === "string" ? c.seccion.slice(0, 60) : null))}::text[],
          ${ok.map((c) => (typeof c.enCarta === "boolean" ? c.enCarta : null))}::boolean[]
        ) AS t(ref, nombre, nombre_carta, categoria, costo, precio, origen, insumos, seccion, en_carta)
        ON CONFLICT (ref) DO NOTHING`,
    ]);
  } catch (e) {
    console.warn("[guardarCarta] sin columnas de sección, se guarda la versión anterior:", e instanceof Error ? e.message : e);
    await guardarCartaAnterior(ok, archivo);
  }
}

/**
 * El desglose del costo por insumo de cada producto (simulador de alzas, 18-nov-2026). Va aparte para no
 * tocar el guardado de la carta: si la columna todavía no existe, la carta se guarda igual.
 */
async function guardarDesglose(carta: CostoCarta[]): Promise<void> {
  const con = carta.filter((c) => c?.ref?.trim() && Array.isArray(c.desglose)).slice(0, 5000);
  if (con.length === 0) return;
  const limpio = (c: CostoCarta) => JSON.stringify(c.desglose!.slice(0, 80)
    .filter((x) => x && typeof x.nombre === "string" && Number.isFinite(x.costo) && x.costo > 0)
    .map((x) => ({ sku: typeof x.sku === "string" ? x.sku.slice(0, 20) : null, nombre: x.nombre.slice(0, 120), costo: Math.round(x.costo * 10000) / 10000 })));
  try {
    await sql`
      UPDATE costos_carta c SET desglose = t.d::jsonb
      FROM unnest(${con.map((c) => c.ref.trim())}::text[], ${con.map(limpio)}::text[]) AS t(ref, d)
      WHERE c.ref = t.ref`;
  } catch (e) {
    console.warn("[guardarDesglose] sin columna desglose (migración pendiente):", e instanceof Error ? e.message : e);
  }
}

const ORIGENES = new Set(["Atelier", "Cafetería"]);
const UNIDADES_PRECIO = new Set(["kg", "l", "und"]);

/** La foto de precios de compra del día (una por fecha, hoja y SKU: subir dos veces el mismo día la corrige). */
async function guardarPrecios(precios: PrecioInsumo[], archivo: string): Promise<void> {
  const ok = precios.filter((p) => p && ORIGENES.has(p.origen) && /^[A-Z]{2}\d{3}$/.test(p.sku ?? "") && typeof p.nombre === "string"
    && UNIDADES_PRECIO.has(p.unidad) && Number.isFinite(p.precio) && p.precio > 0).slice(0, 3000);
  if (ok.length === 0) return;
  const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const cols = [ok.map((p) => p.origen), ok.map((p) => p.sku), ok.map((p) => p.nombre.slice(0, 120)), ok.map((p) => p.unidad), ok.map((p) => p.precio)] as const;
  try {
    // Con la columna «fuente» (migración 2026-11-18-precios-insumos-sistema): la foto del Excel no pisa un cambio hecho en el sistema.
    await sql`
      INSERT INTO insumos_precios (fecha, origen, sku, nombre, unidad, precio, archivo, fuente)
      SELECT ${fecha}::date, t.origen, t.sku, t.nombre, t.unidad, t.precio, ${archivo}, 'excel'
      FROM unnest(${cols[0]}::text[], ${cols[1]}::text[], ${cols[2]}::text[], ${cols[3]}::text[], ${cols[4]}::numeric[]) AS t(origen, sku, nombre, unidad, precio)
      ON CONFLICT (fecha, origen, sku, fuente) DO UPDATE SET nombre = EXCLUDED.nombre, unidad = EXCLUDED.unidad, precio = EXCLUDED.precio,
        archivo = EXCLUDED.archivo, cargado_el = NOW()`;
  } catch {
    try {
      await sql`
        INSERT INTO insumos_precios (fecha, origen, sku, nombre, unidad, precio, archivo)
        SELECT ${fecha}::date, t.origen, t.sku, t.nombre, t.unidad, t.precio, ${archivo}
        FROM unnest(${cols[0]}::text[], ${cols[1]}::text[], ${cols[2]}::text[], ${cols[3]}::text[], ${cols[4]}::numeric[]) AS t(origen, sku, nombre, unidad, precio)
        ON CONFLICT (fecha, origen, sku) DO UPDATE SET nombre = EXCLUDED.nombre, unidad = EXCLUDED.unidad, precio = EXCLUDED.precio,
          archivo = EXCLUDED.archivo, cargado_el = NOW()`;
    } catch (e) {
      console.warn("[guardarPrecios] sin tabla insumos_precios (migración pendiente):", e instanceof Error ? e.message : e);
    }
  }
}

async function guardarCartaAnterior(ok: CostoCarta[], archivo: string): Promise<void> {
  try {
    await sql.transaction([
      sql`DELETE FROM costos_carta`,
      sql`
        INSERT INTO costos_carta (ref, nombre, nombre_carta, categoria, costo, precio, archivo, origen, insumos)
        SELECT t.ref, t.nombre, t.nombre_carta, t.categoria, t.costo, t.precio, ${archivo}, t.origen, t.insumos::jsonb
        FROM unnest(
          ${ok.map((c) => c.ref.trim())}::text[], ${ok.map((c) => c.nombre.trim())}::text[], ${ok.map((c) => c.nombreCarta ?? null)}::text[],
          ${ok.map((c) => c.categoria ?? null)}::text[], ${ok.map((c) => c.costo)}::numeric[], ${ok.map((c) => (c.precio && Number.isFinite(c.precio) ? c.precio : null))}::numeric[],
          ${ok.map((c) => (typeof c.origen === "string" ? c.origen.slice(0, 40) : null))}::text[],
          ${ok.map((c) => (Array.isArray(c.insumos) ? JSON.stringify(c.insumos.slice(0, 60).map((i) => ({ sku: i.sku ?? null, nombre: String(i.nombre).slice(0, 120), exclusivo: !!i.exclusivo }))) : null))}::text[]
        ) AS t(ref, nombre, nombre_carta, categoria, costo, precio, origen, insumos)
        ON CONFLICT (ref) DO NOTHING`,
    ]);
  } catch (e) {
    // Antes de la migración de candidatos: la lista de Atelier se guarda igual.
    console.error("[guardarCarta] failed:", e);
  }
}

/** Ver guardarCostos › quedarmeConExcel. Devuelve cuántas recetas se reemplazaron. */
async function quedarmeConLasDelExcel(pares: { id: number; ref: string }[], refsExcel: Set<string>): Promise<number> {
  const validos = pares.filter((p) => Number.isInteger(p.id) && refsExcel.has(p.ref));
  if (validos.length === 0) return 0;
  const { recetas } = await leerCatalogo(sql, ATELIER);
  const cambio = new Map(validos.filter((p) => recetas.some((r) => r.id === p.id && !r.reemplaza)).map((p) => [`REC:${p.id}`, p.ref]));
  if (cambio.size === 0) return 0;
  const ids = [...cambio.keys()].map((k) => Number(k.slice(4)));
  const actualizar = recetas
    .filter((r) => !ids.includes(r.id) && r.detalle.ingredientes.some((g) => g.ref && cambio.has(g.ref)))
    .map((r) => {
      const detalle = { ...r.detalle, ingredientes: r.detalle.ingredientes.map((g) => (g.ref && cambio.has(g.ref) ? { ...g, ref: cambio.get(g.ref)! } : g)) };
      return sql`UPDATE recetas_sistema SET detalle = ${JSON.stringify(detalle)}::jsonb, actualizado_el = NOW() WHERE id = ${r.id}`;
    });
  try {
    await sql.transaction([...actualizar, sql`DELETE FROM recetas_sistema WHERE business_id = ${ATELIER} AND id = ANY(${ids}::int[])`]);
    return ids.length;
  } catch (e) {
    console.error("[quedarmeConLasDelExcel] failed:", e);
    return 0;
  }
}

export type EstadoPricing = {
  archivo: string | null;
  cargadoEl: string | null;
  conteos: Record<TipoCosto, number>;
  /** Recetas del Excel que tienen versión propia en el sistema (esa sigue valiendo al subir otro Excel). */
  reemplazos: { ref: string; nombre: string }[];
  /**
   * Recetas creadas en el sistema (no reemplazan a ninguna del Excel): al
   * subir un Excel que ya las trae con el mismo nombre, se ofrece quedarse
   * con la del Excel.
   */
  propias: { id: number; nombre: string; unidad: string; costo: number | null }[];
} | null;

/** Qué Excel está cargado y cuándo (para la tarjeta de Configuración). */
export async function getEstadoPricing(): Promise<EstadoPricing> {
  if (!(await requireFullSession())) return null;
  try {
    const rows = (await sql`
      SELECT tipo, COUNT(*)::int AS n, MAX(archivo) AS archivo,
             to_char(MAX(cargado_el) AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS cargado
      FROM costos_preparaciones WHERE business_id = ${ATELIER}
      GROUP BY tipo
    `) as { tipo: TipoCosto; n: number; archivo: string; cargado: string }[];
    const conteos: Record<TipoCosto, number> = { producto: 0, preparacion: 0, insumo: 0 };
    for (const r of rows) conteos[r.tipo] = r.n;
    let reemplazos: { ref: string; nombre: string }[] = [];
    try {
      reemplazos = (await sql`
        SELECT reemplaza_ref AS ref, nombre FROM recetas_sistema
        WHERE business_id = ${ATELIER} AND reemplaza_ref IS NOT NULL ORDER BY nombre
      `) as { ref: string; nombre: string }[];
    } catch {
      reemplazos = []; // antes de la migración de recetas
    }
    const cat = await leerCatalogo(sql, ATELIER);
    const propias = cat.recetas.filter((r) => !r.reemplaza).map((r) => {
      const i = cat.efectivo.find((x) => x.recetaId === r.id);
      return { id: r.id, nombre: r.nombre, unidad: r.tipo === "preparacion" ? "kg" : "und", costo: i?.costo ?? null };
    });
    return { archivo: rows[0]?.archivo ?? null, cargadoEl: rows.map((r) => r.cargado).sort().pop() ?? null, conteos, reemplazos, propias };
  } catch {
    return null;
  }
}

/**
 * La lista de costos de la sede activa para el detalle de mermas: el Excel
 * con las recetas del sistema encima. Sin la receta de cada ítem (no hace
 * falta para registrar una merma y pesa).
 */
export async function getCatalogoCostos(): Promise<CostoPreparacion[]> {
  const bId = await activeBusinessId();
  const role = await getSessionRole();
  if (!(role?.kind === "full" || (role?.kind === "admin" && role.sede === bId))) return [];
  const { efectivo } = await leerCatalogo(sql, bId);
  return efectivo
    .map((i) => ({ ...i, detalle: undefined }))
    .sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo] || a.nombre.localeCompare(b.nombre));
}

const ORDEN = { producto: 0, preparacion: 1, insumo: 2 } as const;
