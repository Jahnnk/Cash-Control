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
export async function guardarCostos(input: { archivo: string; items: CostoPreparacion[] }): Promise<
  { ok: true; guardados: number } | { ok: false; error: string }
> {
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
        INSERT INTO costos_preparaciones (business_id, ref, tipo, nombre, categoria, unidad, costo, archivo)
        SELECT ${ATELIER}, t.ref, t.tipo, t.nombre, t.categoria, t.unidad, t.costo, ${archivo}
        FROM unnest(
          ${it.map((i) => i.ref.trim())}::text[], ${it.map((i) => i.tipo)}::text[], ${it.map((i) => i.nombre.trim())}::text[],
          ${it.map((i) => i.categoria ?? null)}::text[], ${it.map((i) => i.unidad)}::text[], ${it.map((i) => i.costo)}::numeric[]
        ) AS t(ref, tipo, nombre, categoria, unidad, costo)`,
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/costos_preparaciones/.test(msg) && /does not exist/.test(msg)) {
      return { ok: false, error: "Falta crear la tabla de costos en la base de datos (migración pendiente)." };
    }
    console.error("[guardarCostos] failed:", e);
    return { ok: false, error: "No se pudo guardar la lista de costos." };
  }
  revalidatePath("/grupo/configuracion");
  return { ok: true, guardados: it.length };
}

export type EstadoPricing = { archivo: string | null; cargadoEl: string | null; conteos: Record<TipoCosto, number> } | null;

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
    return { archivo: rows[0]?.archivo ?? null, cargadoEl: rows.map((r) => r.cargado).sort().pop() ?? null, conteos };
  } catch {
    return null;
  }
}

/** La lista de costos de la sede activa, para el detalle de mermas. */
export async function getCatalogoCostos(): Promise<CostoPreparacion[]> {
  const bId = await activeBusinessId();
  const role = await getSessionRole();
  if (!(role?.kind === "full" || (role?.kind === "admin" && role.sede === bId))) return [];
  try {
    return (await sql`
      SELECT ref, tipo, nombre, categoria, unidad, costo::float AS costo
      FROM costos_preparaciones WHERE business_id = ${bId}
      ORDER BY CASE tipo WHEN 'producto' THEN 0 WHEN 'preparacion' THEN 1 ELSE 2 END, nombre
    `) as CostoPreparacion[];
  } catch {
    return []; // antes de la migración: el detalle sigue funcionando a mano
  }
}
