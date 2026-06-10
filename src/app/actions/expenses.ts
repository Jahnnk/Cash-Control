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

export async function createExpense(data: {
  date: string;
  category: string;
  concept: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  // Gastos compartidos solo aplican a Atelier (regla de negocio).
  shared?: {
    ruleId: string;
    atelierAmount: number;
    fonaviAmount: number;
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
    throw new Error("Los gastos compartidos con Fonavi solo se registran desde Atelier");
  }
  if (data.shared) {
    const totalSplit = Math.round((data.shared.atelierAmount + data.shared.fonaviAmount) * 100);
    if (totalSplit !== Math.round(data.amount * 100)) {
      throw new Error("La suma de las partes (Atelier + Fonavi) debe igualar el monto total");
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
    });
    if (paymentMethod !== "efectivo") {
      await recalcBankBalance(data.date);
    }
    revalidatePath("/", "layout");
    return;
  }

  // ───── CASO 2: gasto compartido — auto-mirror Atelier→Fonavi (atómico) ─────
  // Una sola statement con CTE: si falla cualquier parte, ROLLBACK implícito.
  const fonaviAmt = data.shared.fonaviAmount;
  const atelierAmt = data.shared.atelierAmount;
  const result = await db.execute(sql`
    WITH atelier_ins AS (
      INSERT INTO expenses (
        business_id, date, category, concept, amount, payment_method,
        notes, is_shared, shared_rule_id, atelier_amount, fonavi_amount
      ) VALUES (
        ${ATELIER_ID}, ${data.date}, ${data.category}, ${data.concept}, ${data.amount.toFixed(2)},
        ${paymentMethod}, ${data.notes || null}, true, ${data.shared.ruleId},
        ${atelierAmt.toFixed(2)}, ${fonaviAmt.toFixed(2)}
      )
      RETURNING id
    ),
    receivable_ins AS (
      INSERT INTO fonavi_receivables (expense_id, amount_due, status)
      SELECT id, ${fonaviAmt.toFixed(2)}, 'pending' FROM atelier_ins
      RETURNING id, expense_id
    ),
    fonavi_category_lookup AS (
      -- Si la categoría existe activa en Fonavi, úsala. Si no, fallback a 'Desconocido'.
      SELECT COALESCE(
        (SELECT name FROM expense_categories
          WHERE business_id = ${FONAVI_ID} AND name = ${data.category} AND is_active = true),
        'Desconocido'
      ) AS cat
    ),
    mirror_ins AS (
      INSERT INTO expenses (
        business_id, date, category, concept, amount, payment_method,
        notes, is_shared, linked_atelier_expense_id, linked_receivable_id
      )
      SELECT
        ${FONAVI_ID},
        ${data.date},
        fcl.cat,
        ${"[Compartido con Atelier] " + data.concept},
        ${fonaviAmt.toFixed(2)},
        'pendiente_atelier',
        'Auto-generado por gasto compartido en Atelier',
        false,
        a.id,
        r.id
      FROM atelier_ins a, receivable_ins r, fonavi_category_lookup fcl
      RETURNING id
    )
    SELECT
      (SELECT id FROM atelier_ins) AS atelier_expense_id,
      (SELECT id FROM receivable_ins) AS receivable_id,
      (SELECT id FROM mirror_ins) AS fonavi_expense_id,
      (SELECT cat FROM fonavi_category_lookup) AS fonavi_category_used
  `);

  const row = result.rows[0] as { fonavi_category_used: string };
  if (row.fonavi_category_used === "Desconocido" && data.category !== "Desconocido") {
    console.warn(
      `[gasto compartido] Categoría '${data.category}' no existe activa en Fonavi → usado fallback 'Desconocido'.`
    );
  }

  // Recalcular saldo de Atelier (el de Fonavi NO cambia: el gasto-espejo es 'pendiente_atelier')
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
    SELECT date::text as date, payment_method, is_internal_transfer FROM expenses
    WHERE id = ${id} AND business_id = ${bId}
  `)).rows[0] as { date: string; payment_method: string; is_internal_transfer: boolean } | undefined;

  if (!before) return; // No-op si no es del negocio activo
  if (before.is_internal_transfer) {
    throw new Error(
      "No se puede editar una transferencia interna desde el feed de gastos. Usa el módulo de Transferencia Interna."
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
    SELECT date::text as date, payment_method, is_shared, is_internal_transfer FROM expenses
    WHERE id = ${id} AND business_id = ${bId}
  `)).rows[0] as { date: string; payment_method: string; is_shared: boolean; is_internal_transfer: boolean } | undefined;

  if (!before) return { success: false, error: "El registro no existe en este negocio" };
  if (before.is_internal_transfer) {
    return { success: false, error: "No se puede borrar una transferencia interna desde el feed de gastos. Usa el módulo de Transferencia Interna." };
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

  await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.businessId, bId)));
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
