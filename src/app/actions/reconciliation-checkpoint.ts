"use server";

/**
 * Marcador "Cuadrado hasta [fecha]" por local.
 *
 * Guarda, por negocio, hasta qué día Jahnn confirmó que el banco real
 * coincide con el saldo del sistema. A partir de ahí:
 *   - el feed de Movimientos diarios colapsa los días ya cuadrados;
 *   - la detección de diferencias (getUnifiedBankBalance) solo mira lo
 *     posterior a esa fecha.
 *
 * Es solo un punto de partida para buscar diferencias: NO toca saldos.
 * Si después se modifica un movimiento con fecha <= al marcador, este
 * retrocede solo (ver recalcBankBalance en daily-records.ts).
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

/** Fecha "cuadrado hasta" del negocio activo (YYYY-MM-DD) o null. */
export async function getReconciledThrough(): Promise<string | null> {
  const bId = await activeBusinessId();
  const rows = (await db.execute(sql`
    SELECT reconciled_through_date::text AS d FROM businesses WHERE id = ${bId}
  `)).rows as { d: string | null }[];
  return rows[0]?.d ?? null;
}

/**
 * Fija (o limpia con null) el "cuadrado hasta" del negocio activo.
 * Valida formato y que no sea futura (zona Lima).
 */
export async function setReconciledThrough(
  date: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();

  if (date !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: "La fecha debe estar en formato YYYY-MM-DD" };
    }
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) {
      return { ok: false, error: "La fecha no puede ser futura" };
    }
  }

  await db.execute(sql`
    UPDATE businesses SET reconciled_through_date = ${date} WHERE id = ${bId}
  `);
  revalidatePath("/", "layout");
  return { ok: true };
}
