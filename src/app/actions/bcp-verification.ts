"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

/**
 * Toggle de la marca "verificado contra app BCP" para ingresos y egresos
 * desde la pestaña Movimientos diarios de Reportes.
 *
 * El campo `bcp_verified_at` es **solo metadata visual**:
 * - NULL                 → pendiente de cuadrar contra el banco
 * - timestamp (NOT NULL) → cuadrado en esa fecha
 *
 * Las server actions de este módulo:
 * - NO disparan `recalcBankBalance` (no afectan saldos)
 * - NO modifican ninguna otra columna del registro
 * - NO afectan Dashboard, Reportes Mensual/Semanal, ni cualquier KPI
 *
 * El filtro multi-tenant via `business_id = bId` evita que un usuario
 * pueda alternar la verificación de filas de otro negocio incluso si
 * conoce el UUID (el SELECT/UPDATE descarta silenciosamente la fila).
 */

type ToggleResult =
  | { ok: true; verifiedAt: string | null }
  | { ok: false; error: string };

export async function toggleBcpVerifiedIncome(itemId: string): Promise<ToggleResult> {
  const bId = await activeBusinessId();
  try {
    const result = await db.execute(sql`
      UPDATE bank_income_items
      SET bcp_verified_at = CASE
        WHEN bcp_verified_at IS NULL THEN NOW()
        ELSE NULL
      END
      WHERE id = ${itemId} AND business_id = ${bId}
      RETURNING bcp_verified_at::text AS verified_at
    `);
    const row = result.rows[0] as { verified_at: string | null } | undefined;
    if (!row) {
      return { ok: false, error: "Movimiento no encontrado" };
    }
    revalidatePath("/[negocio]/reportes", "page");
    return { ok: true, verifiedAt: row.verified_at };
  } catch (err) {
    console.error("[toggleBcpVerifiedIncome] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al actualizar" };
  }
}

export async function toggleBcpVerifiedExpense(itemId: string): Promise<ToggleResult> {
  const bId = await activeBusinessId();
  try {
    const result = await db.execute(sql`
      UPDATE expenses
      SET bcp_verified_at = CASE
        WHEN bcp_verified_at IS NULL THEN NOW()
        ELSE NULL
      END
      WHERE id = ${itemId} AND business_id = ${bId}
      RETURNING bcp_verified_at::text AS verified_at
    `);
    const row = result.rows[0] as { verified_at: string | null } | undefined;
    if (!row) {
      return { ok: false, error: "Movimiento no encontrado" };
    }
    revalidatePath("/[negocio]/reportes", "page");
    return { ok: true, verifiedAt: row.verified_at };
  } catch (err) {
    console.error("[toggleBcpVerifiedExpense] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al actualizar" };
  }
}
