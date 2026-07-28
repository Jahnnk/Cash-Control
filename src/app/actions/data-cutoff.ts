"use server";

/**
 * Corte de datos por sede — "¿hasta qué momento estos números son
 * completos?" (pedido de Jahnn, 28-jul-2026).
 *
 * El import lo fija solo al último día con movimientos (23:59 = día
 * completo). Esta pantalla existe para el caso real: Kelly cierra su
 * Excel un viernes a las 6:30 p.m. y ese mismo día siguen entrando
 * ventas — el dashboard debe decir "al 24/07 6:30 p.m.", no "hoy".
 *
 * Sede EXPLÍCITA (lección /grupo: la cookie ahí dice "grupo").
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { requireFullSession } from "@/lib/session-access";
import { buildCutoff, type DataCutoff } from "@/lib/data-cutoff";

const sql = neon(process.env.DATABASE_URL!);

export type SedeCutoff = {
  businessId: number;
  name: string;
  cutoff: DataCutoff;
  /** true = la columna aún no existe (migración pendiente). */
  columnMissing: boolean;
};

const NO_ACCESS = { ok: false as const, error: "Solo para la dirección." };

export async function listDataCutoffs(): Promise<
  { ok: true; sedes: SedeCutoff[] } | { ok: false; error: string }
> {
  if (!(await requireFullSession())) return NO_ACCESS;
  try {
    let stored: Record<number, string | null> = {};
    let columnMissing = false;
    try {
      const rows = (await sql`
        SELECT id, data_cutoff_at FROM businesses WHERE active = true
      `) as { id: number; data_cutoff_at: string | null }[];
      stored = Object.fromEntries(rows.map((r) => [r.id, r.data_cutoff_at]));
    } catch {
      columnMissing = true;
    }
    const rows = (await sql`
      SELECT b.id, b.name,
        GREATEST(
          (SELECT MAX(date) FROM bank_income_items WHERE business_id = b.id AND archived = false),
          (SELECT MAX(date) FROM expenses WHERE business_id = b.id AND archived = false)
        )::text AS last_mov
      FROM businesses b WHERE b.active = true ORDER BY b.id
    `) as { id: number; name: string; last_mov: string | null }[];

    return {
      ok: true,
      sedes: rows.map((r) => {
        const raw = stored[r.id] ?? null;
        return {
          businessId: r.id,
          name: r.name,
          cutoff: buildCutoff(raw ? new Date(raw) : null, r.last_mov),
          columnMissing,
        };
      }),
    };
  } catch (err) {
    console.error("[listDataCutoffs] failed:", err);
    return { ok: false, error: "No pude leer los cortes de datos." };
  }
}

/**
 * Fija el corte de una sede. `time` en formato HH:MM (hora de Lima);
 * vacío = día completo (23:59).
 */
export async function setDataCutoff(input: {
  sede: number;
  date: string;
  time: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return NO_ACCESS;
  if (![1, 2, 3].includes(input.sede)) return { ok: false, error: "Sede inválida." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Fecha inválida." };
  const time = input.time.trim() === "" ? "23:59" : input.time.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return { ok: false, error: "Hora inválida (usa formato 24h, ej. 18:30)." };
  }
  try {
    await sql`
      UPDATE businesses
      SET data_cutoff_at = (${`${input.date} ${time}`}::timestamp AT TIME ZONE 'America/Lima')
      WHERE id = ${input.sede}
    `;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[setDataCutoff] failed:", err);
    return { ok: false, error: "No pude guardar el corte (¿falta correr la migración?)." };
  }
}
