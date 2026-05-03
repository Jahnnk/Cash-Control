"use server";

import { db } from "@/db";
import { expenses } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { recalcBankBalance } from "./daily-records";

const ATELIER_ID = 1;

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

  const insertResult = await db.insert(expenses).values({
    businessId: bId,
    date: data.date,
    category: data.category,
    concept: data.concept,
    amount: data.amount.toFixed(2),
    paymentMethod: data.paymentMethod || "transferencia",
    notes: data.notes || null,
    isShared: !!data.shared,
    sharedRuleId: data.shared?.ruleId ?? null,
    atelierAmount: data.shared ? data.shared.atelierAmount.toFixed(2) : null,
    fonaviAmount: data.shared ? data.shared.fonaviAmount.toFixed(2) : null,
  }).returning({ id: expenses.id });

  const expenseId = insertResult[0].id;

  // Crear cuenta por cobrar (solo en flujo Atelier — guard de arriba lo asegura)
  if (data.shared && data.shared.fonaviAmount > 0) {
    await db.execute(sql`
      INSERT INTO fonavi_receivables (expense_id, amount_due, status)
      VALUES (${expenseId}, ${data.shared.fonaviAmount}, 'pending')
    `);
  }

  if ((data.paymentMethod || "transferencia") !== "efectivo") {
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
  const before = (await db.execute(sql`
    SELECT date::text as date, payment_method FROM expenses
    WHERE id = ${id} AND business_id = ${bId}
  `)).rows[0] as { date: string; payment_method: string } | undefined;

  if (!before) return; // No-op si no es del negocio activo

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
    SELECT date::text as date, payment_method, is_shared FROM expenses
    WHERE id = ${id} AND business_id = ${bId}
  `)).rows[0] as { date: string; payment_method: string; is_shared: boolean } | undefined;

  if (!before) return { success: false, error: "El registro no existe en este negocio" };

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
  const result = await db.execute(sql`
    SELECT * FROM expenses
    WHERE business_id = ${bId} AND date = ${date}
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
