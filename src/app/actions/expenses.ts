"use server";

import { db } from "@/db";
import { expenses } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { recalcBankBalance } from "./daily-records";
import { validateAmount, validateMovementDate } from "@/lib/money-validation";

const ATELIER_ID = 1;
const FONAVI_ID = 2;
const CENTRO_ID = 3;

export async function createExpense(data: {
  date: string;
  category: string;
  concept: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  // Gastos compartidos solo aplican a Atelier (regla de negocio).
  // centroAmount opcional: 0/omitido = Centro no participa (2 vías histórico).
  shared?: {
    ruleId: string;
    atelierAmount: number;
    fonaviAmount: number;
    centroAmount?: number;
  };
}) {
  const bId = await activeBusinessId();

  // Validación server-side (no confiar en el cliente): monto y fecha.
  // Mismo criterio que loans/internal-transfers/bank-income.
  const amountError = validateAmount(data.amount);
  if (amountError) throw new Error(amountError);
  const dateError = validateMovementDate(data.date);
  if (dateError) throw new Error(dateError);

  // Cross-tenant guard: solo Atelier puede registrar gastos compartidos
  if (data.shared && bId !== ATELIER_ID) {
    throw new Error("Los gastos compartidos solo se registran desde Atelier");
  }
  if (data.shared) {
    const centroAmt = data.shared.centroAmount ?? 0;
    if (centroAmt < 0 || data.shared.fonaviAmount < 0 || data.shared.atelierAmount < 0) {
      throw new Error("Las partes del reparto no pueden ser negativas");
    }
    if (data.shared.fonaviAmount <= 0 && centroAmt <= 0) {
      throw new Error("Al menos una cafetería (Fonavi o Centro) debe tener una parte mayor a 0");
    }
    const totalSplit = Math.round((data.shared.atelierAmount + data.shared.fonaviAmount + centroAmt) * 100);
    if (totalSplit !== Math.round(data.amount * 100)) {
      throw new Error("La suma de las partes (Atelier + Fonavi + Centro) debe igualar el monto total");
    }
  }

  const paymentMethod = data.paymentMethod || "transferencia";

  // ───── CASO 1: gasto NO compartido — flujo simple ─────
  if (!data.shared) {
    await db.insert(expenses).values({
      businessId: bId,
      date: data.date,
      category: data.category,
      concept: data.concept,
      amount: data.amount.toFixed(2),
      paymentMethod,
      notes: data.notes || null,
      isShared: false,
      sharedRuleId: null,
      atelierAmount: null,
      fonaviAmount: null,
      centroAmount: null,
    });
    if (paymentMethod !== "efectivo") {
      await recalcBankBalance(data.date);
    }
    revalidatePath("/", "layout");
    return;
  }

  // ───── CASO 2: gasto compartido — espejos en Fonavi y/o Centro (atómico) ─────
  // Una sola statement con CTEs condicionales (INSERT … SELECT … WHERE parte > 0):
  // si falla cualquier parte, ROLLBACK implícito. Hasta 2 por-cobrar + 2 espejos.
  const fonaviAmt = data.shared.fonaviAmount;
  const centroAmt = data.shared.centroAmount ?? 0;
  const atelierAmt = data.shared.atelierAmount;
  const hasFonavi = fonaviAmt > 0;
  const hasCentro = centroAmt > 0;
  const result = await db.execute(sql`
    WITH atelier_ins AS (
      INSERT INTO expenses (
        business_id, date, category, concept, amount, payment_method,
        notes, is_shared, shared_rule_id, atelier_amount, fonavi_amount, centro_amount
      ) VALUES (
        ${ATELIER_ID}, ${data.date}, ${data.category}, ${data.concept}, ${data.amount.toFixed(2)},
        ${paymentMethod}, ${data.notes || null}, true, ${data.shared.ruleId},
        ${atelierAmt.toFixed(2)}, ${hasFonavi ? fonaviAmt.toFixed(2) : null}, ${hasCentro ? centroAmt.toFixed(2) : null}
      )
      RETURNING id
    ),
    receivable_f AS (
      INSERT INTO fonavi_receivables (expense_id, amount_due, status, debtor_business_id)
      SELECT id, ${fonaviAmt.toFixed(2)}, 'pending', ${FONAVI_ID} FROM atelier_ins WHERE ${hasFonavi}
      RETURNING id, expense_id
    ),
    receivable_c AS (
      INSERT INTO fonavi_receivables (expense_id, amount_due, status, debtor_business_id)
      SELECT id, ${centroAmt.toFixed(2)}, 'pending', ${CENTRO_ID} FROM atelier_ins WHERE ${hasCentro}
      RETURNING id, expense_id
    ),
    cat_f AS (
      SELECT COALESCE(
        (SELECT name FROM expense_categories
          WHERE business_id = ${FONAVI_ID} AND name = ${data.category} AND is_active = true),
        'Desconocido'
      ) AS cat
    ),
    cat_c AS (
      SELECT COALESCE(
        (SELECT name FROM expense_categories
          WHERE business_id = ${CENTRO_ID} AND name = ${data.category} AND is_active = true),
        'Desconocido'
      ) AS cat
    ),
    mirror_f AS (
      INSERT INTO expenses (
        business_id, date, category, concept, amount, payment_method,
        notes, is_shared, linked_atelier_expense_id, linked_receivable_id
      )
      SELECT
        ${FONAVI_ID}, ${data.date}, cf.cat,
        ${"[Compartido con Atelier] " + data.concept},
        ${fonaviAmt.toFixed(2)}, 'pendiente_atelier',
        'Auto-generado por gasto compartido en Atelier', false,
        a.id, r.id
      FROM atelier_ins a, receivable_f r, cat_f cf
      RETURNING id
    ),
    mirror_c AS (
      INSERT INTO expenses (
        business_id, date, category, concept, amount, payment_method,
        notes, is_shared, linked_atelier_expense_id, linked_receivable_id
      )
      SELECT
        ${CENTRO_ID}, ${data.date}, cc.cat,
        ${"[Compartido con Atelier] " + data.concept},
        ${centroAmt.toFixed(2)}, 'pendiente_atelier',
        'Auto-generado por gasto compartido en Atelier', false,
        a.id, r.id
      FROM atelier_ins a, receivable_c r, cat_c cc
      RETURNING id
    )
    SELECT
      (SELECT id FROM atelier_ins) AS atelier_expense_id,
      (SELECT COUNT(*) FROM receivable_f) + (SELECT COUNT(*) FROM receivable_c) AS receivables_creadas,
      (SELECT cat FROM cat_f) AS fonavi_category_used,
      (SELECT cat FROM cat_c) AS centro_category_used
  `);

  const row = result.rows[0] as { fonavi_category_used: string; centro_category_used: string };
  if (hasFonavi && row.fonavi_category_used === "Desconocido" && data.category !== "Desconocido") {
    console.warn(`[gasto compartido] Categoría '${data.category}' no existe activa en Fonavi → fallback 'Desconocido'.`);
  }
  if (hasCentro && row.centro_category_used === "Desconocido" && data.category !== "Desconocido") {
    console.warn(`[gasto compartido] Categoría '${data.category}' no existe activa en Centro → fallback 'Desconocido'.`);
  }

  // Recalcular saldo de Atelier (los espejos no afectan el banco del deudor: son 'pendiente_atelier')
  if (paymentMethod !== "efectivo") {
    await recalcBankBalance(data.date);
  }
  revalidatePath("/", "layout");
}

export async function updateExpense(id: string, data: {
  category?: string;
  concept?: string;
  amount?: number;
  paymentMethod?: string;
}) {
  const bId = await activeBusinessId();

  // Validación server-side del monto editado (fecha no se edita aquí).
  if (data.amount !== undefined) {
    const amountError = validateAmount(data.amount);
    if (amountError) throw new Error(amountError);
  }

  const before = (await db.execute(sql`
    SELECT date::text as date, amount::float as amount, payment_method, is_internal_transfer,
           is_shared, linked_atelier_expense_id
    FROM expenses
    WHERE id = ${id} AND business_id = ${bId}
  `)).rows[0] as { date: string; amount: number; payment_method: string; is_internal_transfer: boolean; is_shared: boolean; linked_atelier_expense_id: string | null } | undefined;

  if (!before) return; // No-op si no es del negocio activo
  if (before.is_internal_transfer) {
    throw new Error(
      "No se puede editar una transferencia interna desde el feed de gastos. Usa el módulo de Transferencia Interna."
    );
  }
  if (before.linked_atelier_expense_id) {
    throw new Error(
      "Este gasto es el espejo automático de un gasto compartido de Atelier. Edítalo desde Atelier (el espejo se ajusta solo)."
    );
  }
  // El monto de un compartido se ajusta desde el editor de Movimientos
  // diarios (con la opción de compartido), que sincroniza por cobrar y espejo.
  if (before.is_shared && data.amount !== undefined && data.amount !== before.amount) {
    throw new Error(
      "Este gasto es compartido con Fonavi: edita su monto desde Reportes → Movimientos diarios para ajustar también el por cobrar."
    );
  }

  if (data.category !== undefined) await db.execute(sql`UPDATE expenses SET category = ${data.category} WHERE id = ${id} AND business_id = ${bId}`);
  if (data.concept !== undefined) await db.execute(sql`UPDATE expenses SET concept = ${data.concept} WHERE id = ${id} AND business_id = ${bId}`);
  if (data.amount !== undefined) await db.execute(sql`UPDATE expenses SET amount = ${data.amount} WHERE id = ${id} AND business_id = ${bId}`);
  if (data.paymentMethod !== undefined) await db.execute(sql`UPDATE expenses SET payment_method = ${data.paymentMethod} WHERE id = ${id} AND business_id = ${bId}`);

  if (data.amount !== undefined || data.paymentMethod !== undefined) {
    await recalcBankBalance(before.date);
  }
  revalidatePath("/", "layout");
}

export async function deleteExpense(id: string): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  const before = (await db.execute(sql`
    SELECT date::text as date, payment_method, is_shared, is_internal_transfer, linked_atelier_expense_id
    FROM expenses
    WHERE id = ${id} AND business_id = ${bId}
  `)).rows[0] as { date: string; payment_method: string; is_shared: boolean; is_internal_transfer: boolean; linked_atelier_expense_id: string | null } | undefined;

  if (!before) return { success: false, error: "El registro no existe en este negocio" };
  if (before.is_internal_transfer) {
    return { success: false, error: "No se puede borrar una transferencia interna desde el feed de gastos. Usa el módulo de Transferencia Interna." };
  }
  if (before.linked_atelier_expense_id) {
    return { success: false, error: "Este gasto es el espejo automático de un gasto compartido de Atelier. Se elimina desde Atelier (borrando o des-compartiendo el gasto original)." };
  }

  if (before.is_shared) {
    const hasAllocations = (await db.execute(sql`
      SELECT COUNT(*)::int as n
      FROM fonavi_reimbursement_allocations a
      JOIN fonavi_receivables r ON r.id = a.receivable_id
      WHERE r.expense_id = ${id}
    `)).rows[0] as { n: number };
    if (hasAllocations.n > 0) {
      return { success: false, error: "No se puede eliminar este egreso porque ya tiene reembolsos registrados. Primero gestiona los reembolsos en 'Cuentas por cobrar Fonavi'." };
    }
  }

  if (before.is_shared) {
    // Borrar gasto + espejo + por cobrar en UNA statement (CTE atómica).
    // Antes solo se borraba el gasto de Atelier: el por cobrar quedaba
    // huérfano (inflaba el total del dashboard) y el espejo, eterno.
    await db.execute(sql`
      WITH mirror_del AS (
        -- Sin filtro de negocio: los espejos pueden vivir en Fonavi O Centro
        -- (linked_atelier_expense_id solo existe en espejos)
        DELETE FROM expenses
        WHERE linked_atelier_expense_id = ${id}::uuid
      ),
      receivable_del AS (
        DELETE FROM fonavi_receivables WHERE expense_id = ${id}::uuid
      )
      DELETE FROM expenses WHERE id = ${id} AND business_id = ${bId}
    `);
  } else {
    await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.businessId, bId)));
  }
  if (before.payment_method !== "efectivo") {
    await recalcBankBalance(before.date);
  }
  revalidatePath("/", "layout");
  return { success: true };
}

export async function getExpensesByDate(date: string) {
  const bId = await activeBusinessId();
  // Excluye transferencias internas y archivados.
  const result = await db.execute(sql`
    SELECT * FROM expenses
    WHERE business_id = ${bId} AND date = ${date} AND is_internal_transfer = false AND archived = false
    ORDER BY sort_order ASC, created_at ASC
  `);
  return result.rows;
}

export async function reorderExpenses(items: { id: string; sortOrder: number }[]) {
  const bId = await activeBusinessId();
  for (const item of items) {
    await db.execute(sql`
      UPDATE expenses SET sort_order = ${item.sortOrder}
      WHERE id = ${item.id} AND business_id = ${bId}
    `);
  }
  revalidatePath("/", "layout");
}

/**
 * Mueve un egreso por drag & drop en "Movimientos diarios":
 *  - Reordena dentro del mismo día (sort_order), O
 *  - Lo mueve a otro día (cambia la fecha) — re-fecha el egreso y recalcula
 *    el saldo del banco del día origen y del destino.
 *
 * Restricciones: solo egresos operativos normales. Los compartidos
 * (is_shared) y sus espejos (linked_atelier_expense_id) NO se pueden mover
 * a otro día desde aquí — su fecha está ligada a la receivable y al espejo
 * del otro local; para re-fecharlos se usa el editor (lápiz). Reordenar
 * dentro del mismo día sí se permite para todos.
 */
export async function moveExpenseItem(data: {
  id: string;
  toDate: string;
  orderedIds: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();

  const row = (await db.execute(sql`
    SELECT date::text AS date, is_special_loan, is_internal_transfer, archived,
           is_shared, linked_atelier_expense_id::text AS linked_atelier_expense_id
    FROM expenses WHERE id = ${data.id} AND business_id = ${bId}
  `)).rows[0] as
    | { date: string; is_special_loan: boolean; is_internal_transfer: boolean; archived: boolean; is_shared: boolean; linked_atelier_expense_id: string | null }
    | undefined;
  if (!row) return { ok: false, error: "Egreso no encontrado" };
  if (row.is_special_loan || row.is_internal_transfer || row.archived) {
    return { ok: false, error: "Este movimiento se gestiona en su propio módulo y no se puede mover desde aquí." };
  }

  const dateChanged = row.date !== data.toDate;
  if (dateChanged && (row.is_shared || row.linked_atelier_expense_id)) {
    return {
      ok: false,
      error: "Este gasto es compartido. Para cambiarle la fecha, edítalo con el lápiz.",
    };
  }
  if (dateChanged) {
    const dateErr = validateMovementDate(data.toDate);
    if (dateErr) return { ok: false, error: dateErr };
    await db.execute(sql`
      INSERT INTO daily_records (business_id, date) VALUES (${bId}, ${data.toDate})
      ON CONFLICT (business_id, date) DO NOTHING
    `);
    await db.execute(sql`
      UPDATE expenses SET date = ${data.toDate}
      WHERE id = ${data.id} AND business_id = ${bId}
    `);
  }

  let order = 0;
  for (const itemId of data.orderedIds) {
    await db.execute(sql`
      UPDATE expenses SET sort_order = ${order}
      WHERE id = ${itemId} AND business_id = ${bId}
    `);
    order++;
  }

  if (dateChanged) {
    await recalcBankBalance(row.date);
    await recalcBankBalance(data.toDate);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function getExpensesByDateRange(startDate: string, endDate: string) {
  const bId = await activeBusinessId();
  const result = await db.execute(sql`
    SELECT e.*, c.name as client_name
    FROM expenses e
    LEFT JOIN clients c ON false
    WHERE e.business_id = ${bId} AND e.date >= ${startDate} AND e.date <= ${endDate}
    ORDER BY e.date DESC, e.created_at DESC
  `);
  return result.rows;
}

export async function getExpensesByCategory(month: string) {
  const bId = await activeBusinessId();
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;
  const result = await db.execute(sql`
    SELECT category, SUM(amount) as total
    FROM expenses
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
    GROUP BY category
    ORDER BY total DESC
  `);
  return result.rows;
}

export async function getMonthlyExpensesTotal(month: string) {
  const bId = await activeBusinessId();
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
  `);
  return parseFloat(result.rows[0]?.total as string || "0");
}
