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
 *
 * Driver: neon() directo (NO db.execute de drizzle) porque las queries
 * usan `= ANY(${array}::uuid[])` y drizzle expande el array en params
 * sueltos `($1,$2,…)::uuid[]` — sintaxis inválida. El cliente neon pasa
 * el array como UN solo parámetro (mismo patrón que attachments.ts).
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

const sql = neon(process.env.DATABASE_URL!);

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
    const rows = (await sql`
      SELECT id::text, date::text, group_id::text AS group_id
      FROM expenses
      WHERE id = ANY(${input.expenseIds}::uuid[])
        AND business_id = ${bId} AND archived = false
    `) as { id: string; date: string; group_id: string | null }[];

    if (rows.length !== input.expenseIds.length) {
      return { ok: false, error: "Alguno de los egresos ya no existe. Recarga la página." };
    }
    if (new Set(rows.map((r) => r.date)).size > 1) {
      return { ok: false, error: "Solo se pueden agrupar egresos del mismo día." };
    }
    if (rows.some((r) => r.group_id)) {
      return { ok: false, error: "Alguno de los egresos ya pertenece a un grupo." };
    }

    // Grupo + membresía en UNA transacción (todo o nada).
    const groupId = crypto.randomUUID();
    await sql.transaction([
      sql`INSERT INTO expense_groups (id, business_id, date, label)
          VALUES (${groupId}, ${bId}, ${rows[0].date}, ${label})`,
      sql`UPDATE expenses SET group_id = ${groupId}
          WHERE id = ANY(${input.expenseIds}::uuid[]) AND business_id = ${bId}`,
    ]);

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
    await sql.transaction([
      sql`UPDATE expenses SET group_id = NULL
          WHERE group_id = ${groupId} AND business_id = ${bId}`,
      sql`DELETE FROM expense_groups WHERE id = ${groupId} AND business_id = ${bId}`,
    ]);
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
    const rows = (await sql`
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
    `) as { verified: boolean }[];
    if (rows.length === 0) return { ok: false, error: "Grupo no encontrado" };
    revalidatePath("/[negocio]/reportes", "page");
    return { ok: true, verified: rows[0].verified };
  } catch (err) {
    console.error("[toggleBcpVerifiedGroup] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al actualizar" };
  }
}
