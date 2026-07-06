"use server";

/**
 * Detalle de mermas por producto · Actions.
 *
 * El admin ya registraba el importe total de mermas del día; ahora puede
 * detallar QUÉ se mermó (producto, cantidad, costo unitario, motivo y
 * acción tomada) para categorizar qué insumos sufren más merma — el
 * formato replica el cuadro de Notion de Jahnn (Insumos & Packaging).
 *
 * Regla de coherencia: al guardar el detalle de un día, el campo
 * mermas_soles de upselling_daily se actualiza con la SUMA del detalle
 * (una sola fuente de verdad para los KPIs). El importe manual sin
 * detalle sigue siendo válido (compatibilidad).
 *
 * Resiliente pre-migración: sin la tabla merma_items, lecturas vacías y
 * escrituras con aviso claro.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole } from "@/lib/session-access";

const sql = neon(process.env.DATABASE_URL!);

async function hasAccess(bId: number): Promise<boolean> {
  const role = await getSessionRole();
  if (role?.kind === "full") return true;
  return role?.kind === "admin" && role.sede === bId;
}

export type MermaItem = {
  producto: string;
  cantidad: number;
  unidad: string | null;      // kg, und, lt… (texto libre)
  costoUnit: number;          // S/ por unidad
  total: number;              // cantidad × costo (redondeado a 2)
  motivo: string | null;      // Merma de calidad, Vencimiento, …
  accion: string | null;      // Descarte, Reproceso, …
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Detalle de mermas de un día. */
export async function getMermaItems(date: string): Promise<
  | { ok: true; items: MermaItem[]; tableReady: boolean }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  if (!(await hasAccess(bId))) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Fecha inválida." };
  try {
    const rows = (await sql`
      SELECT producto, cantidad::float AS cantidad, unidad,
             costo_unit::float AS "costoUnit", total::float AS total, motivo, accion
      FROM merma_items
      WHERE business_id = ${bId} AND date = ${date}
      ORDER BY id
    `) as MermaItem[];
    return { ok: true, items: rows, tableReady: true };
  } catch {
    return { ok: true, items: [], tableReady: false };
  }
}

/**
 * Guarda el detalle de mermas del día (reemplazo idempotente: DELETE +
 * INSERT del día) y sincroniza mermas_soles con la suma.
 */
export async function saveMermaDetail(input: {
  date: string;
  items: MermaItem[];
}): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (!(await hasAccess(bId))) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Fecha inválida." };
  for (const it of input.items) {
    if (!it.producto?.trim()) return { ok: false, error: "Cada merma necesita el producto o insumo." };
    if (!Number.isFinite(it.cantidad) || it.cantidad <= 0) return { ok: false, error: `Cantidad inválida en "${it.producto}".` };
    if (!Number.isFinite(it.costoUnit) || it.costoUnit < 0) return { ok: false, error: `Costo inválido en "${it.producto}".` };
  }
  const clean = input.items.map((it) => ({
    producto: it.producto.trim(),
    cantidad: it.cantidad,
    unidad: it.unidad?.trim() || null,
    costoUnit: r2(it.costoUnit),
    total: r2(it.cantidad * it.costoUnit),
    motivo: it.motivo?.trim() || null,
    accion: it.accion?.trim() || null,
  }));
  const total = r2(clean.reduce((s, it) => s + it.total, 0));
  try {
    await sql.transaction([
      sql`DELETE FROM merma_items WHERE business_id = ${bId} AND date = ${input.date}`,
      ...clean.map((it) => sql`
        INSERT INTO merma_items (business_id, date, producto, cantidad, unidad, costo_unit, total, motivo, accion)
        VALUES (${bId}, ${input.date}, ${it.producto}, ${it.cantidad}, ${it.unidad}, ${it.costoUnit}, ${it.total}, ${it.motivo}, ${it.accion})`),
      // Una sola fuente de verdad: el KPI del día = suma del detalle.
      sql`INSERT INTO upselling_daily (business_id, date, mermas_soles, source, updated_at)
          VALUES (${bId}, ${input.date}, ${total}, 'manual', NOW())
          ON CONFLICT (business_id, date) DO UPDATE
            SET mermas_soles = EXCLUDED.mermas_soles, updated_at = NOW()`,
    ]);
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true, total };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/merma_items/.test(msg)) {
      return { ok: false, error: "Falta la migración de mermas (tabla merma_items) — avísale a Jahnn. Mientras tanto puedes registrar el importe total." };
    }
    console.error("[saveMermaDetail] failed:", err);
    return { ok: false, error: msg || "Error al guardar el detalle de mermas" };
  }
}

export type MermaMonthSummary = {
  totalMes: number;
  /** Top productos mermados del mes (para categorizar qué sufre más). */
  top: { producto: string; total: number; veces: number; cantidad: number; unidad: string | null }[];
};

/** Resumen del mes: qué productos están sufriendo más merma. */
export async function getMermasMonthSummary(month: string): Promise<
  | { ok: true; data: MermaMonthSummary; tableReady: boolean }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  if (!(await hasAccess(bId))) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  try {
    const rows = (await sql`
      SELECT producto, SUM(total)::float AS total, COUNT(*)::int AS veces,
             SUM(cantidad)::float AS cantidad, MAX(unidad) AS unidad
      FROM merma_items
      WHERE business_id = ${bId} AND date >= ${month + "-01"}
        AND date < (${month + "-01"}::date + INTERVAL '1 month')
      GROUP BY producto
      ORDER BY SUM(total) DESC
    `) as { producto: string; total: number; veces: number; cantidad: number; unidad: string | null }[];
    // El total del mes se calcula sobre TODOS los productos; el top solo muestra 10.
    const totalMes = r2(rows.reduce((s, r) => s + r.total, 0));
    return { ok: true, data: { totalMes, top: rows.slice(0, 10).map((r) => ({ ...r, total: r2(r.total) })) }, tableReady: true };
  } catch {
    return { ok: true, data: { totalMes: 0, top: [] }, tableReady: false };
  }
}
