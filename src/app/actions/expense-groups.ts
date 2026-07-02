"use server";

/**
 * Grupos VISUALES de egresos — varios gastos del mismo día que en el
 * banco aparecen como UN solo cargo (ej. reposición de caja chica).
 *
 * Garantías (mismo espíritu que bcp-verification.ts):
 * - NO tocan montos, categorías, fechas ni ninguna columna financiera.
 * - NO disparan `recalcBankBalance` (agrupar no mueve dinero).
 * - Todos los saldos, reportes y presupuestos siguen sumando cada gasto
 *   individual: el grupo es solo cómo se pliega la vista.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Crea un grupo con los egresos indicados (mismo negocio y mismo día). */
export async function createExpenseGroup(input: {
  expenseIds: string[];
  label: string;
}): Promise<ActionResult> {
  const bId = await activeBusinessId();
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Ponle un nombre al grupo." };
  if (input.expenseIds.length < 2) {
    return { ok: false, error: "Selecciona al menos 2 egresos para agrupar." };
  }

  try {
    // Validación server-side: existen, son del negocio activo, no están
    // archivados ni ya agrupados, y todos comparten fecha.
    const rows = (await db.execute(sql`
      SELECT id::text, date::text, group_id::text AS group_id
      FROM expenses
      WHERE id = ANY(${input.expenseIds}::uuid[])
        AND business_id = ${bId} AND archived = false
    `)).rows as { id: string; date: string; group_id: string | null }[];

    if (rows.length !== input.expenseIds.length) {
      return { ok: false, error: "Alguno de los egresos ya no existe. Recarga la página." };
    }
    if (new Set(rows.map((r) => r.date)).size > 1) {
      return { ok: false, error: "Solo se pueden agrupar egresos del mismo día." };
    }
    if (rows.some((r) => r.group_id)) {
      return { ok: false, error: "Alguno de los egresos ya pertenece a un grupo." };
    }

    const created = (await db.execute(sql`
      INSERT INTO expense_groups (business_id, date, label)
      VALUES (${bId}, ${rows[0].date}, ${label})
      RETURNING id::text
    `)).rows as { id: string }[];

    await db.execute(sql`
      UPDATE expenses SET group_id = ${created[0].id}
      WHERE id = ANY(${input.expenseIds}::uuid[]) AND business_id = ${bId}
    `);

    revalidatePath("/[negocio]/reportes", "page");
    return { ok: true };
  } catch (err) {
    console.error("[createExpenseGroup] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al agrupar" };
  }
}

/** Deshace un grupo: los egresos vuelven a mostrarse sueltos (nada más cambia). */
export async function ungroupExpenseGroup(groupId: string): Promise<ActionResult> {
  const bId = await activeBusinessId();
  try {
    await db.execute(sql`
      UPDATE expenses SET group_id = NULL
      WHERE group_id = ${groupId} AND business_id = ${bId}
    `);
    await db.execute(sql`
      DELETE FROM expense_groups WHERE id = ${groupId} AND business_id = ${bId}
    `);
    revalidatePath("/[negocio]/reportes", "page");
    return { ok: true };
  } catch (err) {
    console.error("[ungroupExpenseGroup] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al desagrupar" };
  }
}

/**
 * Cuadre BCP del grupo completo con UN clic (el banco muestra un solo
 * cargo). Si queda alguno sin verificar → verifica todos; si ya están
 * todos verificados → los desmarca todos. Solo metadata visual.
 */
export async function toggleBcpVerifiedGroup(
  groupId: string,
): Promise<{ ok: true; verified: boolean } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  try {
    const rows = (await db.execute(sql`
      UPDATE expenses SET bcp_verified_at = CASE
        WHEN EXISTS (
          SELECT 1 FROM expenses p
          WHERE p.group_id = ${groupId} AND p.business_id = ${bId}
            AND p.archived = false AND p.bcp_verified_at IS NULL
        ) THEN NOW()
        ELSE NULL
      END
      WHERE group_id = ${groupId} AND business_id = ${bId} AND archived = false
      RETURNING bcp_verified_at IS NOT NULL AS verified
    `)).rows as { verified: boolean }[];
    if (rows.length === 0) return { ok: false, error: "Grupo no encontrado" };
    revalidatePath("/[negocio]/reportes", "page");
    return { ok: true, verified: rows[0].verified };
  } catch (err) {
    console.error("[toggleBcpVerifiedGroup] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al actualizar" };
  }
}
