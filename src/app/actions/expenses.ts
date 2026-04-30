"use server";

import { db } from "@/db";
import { expenses } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recalcBankBalance } from "./daily-records";

export async function createExpense(data: {
  date: string;
  category: string;
  concept: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  // Gastos compartidos (opcional). Si shared=true, los demás campos son obligatorios.
  shared?: {
    ruleId: string;
    atelierAmount: number;
    fonaviAmount: number;
  };
}) {
  // Validar partición compartida
  if (data.shared) {
    const totalSplit = Math.round((data.shared.atelierAmount + data.shared.fonaviAmount) * 100);
    if (totalSplit !== Math.round(data.amount * 100)) {
      throw new Error("La suma de las partes (Atelier + Fonavi) debe igualar el monto total");
    }
  }

  const insertResult = await db.insert(expenses).values({
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

  // Crear cuenta por cobrar a Fonavi si aplica
  if (data.shared && data.shared.fonaviAmount > 0) {
    await db.execute(sql`
      INSERT INTO fonavi_receivables (expense_id, amount_due, status)
      VALUES (${expenseId}, ${data.shared.fonaviAmount}, 'pending')
    `);
  }

  // Solo afecta saldo banco si NO es efectivo
  if ((data.paymentMethod || "transferencia") !== "efectivo") {
    await recalcBankBalance(data.date);
  }
  revalidatePath("/registro");
  revalidatePath("/dashboard");
  revalidatePath("/presupuesto");
  revalidatePath("/fonavi");
}

export async function updateExpense(id: string, data: {
  category?: string;
  concept?: string;
  amount?: number;
  paymentMethod?: string;
}) {
  // Capturar fecha antes para cascade
  const before = (await db.execute(sql`SELECT date::text as date, payment_method FROM expenses WHERE id = ${id}`)).rows[0] as { date: string; payment_method: string } | undefined;

  if (data.category !== undefined) await db.execute(sql`UPDATE expenses SET category = ${data.category} WHERE id = ${id}`);
  if (data.concept !== undefined) await db.execute(sql`UPDATE expenses SET concept = ${data.concept} WHERE id = ${id}`);
  if (data.amount !== undefined) await db.execute(sql`UPDATE expenses SET amount = ${data.amount} WHERE id = ${id}`);
  if (data.paymentMethod !== undefined) await db.execute(sql`UPDATE expenses SET payment_method = ${data.paymentMethod} WHERE id = ${id}`);

  // Recalcular si cambió el monto o el método (cualquiera de los dos puede afectar bank_balance)
  if (before && (data.amount !== undefined || data.paymentMethod !== undefined)) {
    await recalcBankBalance(before.date);
  }

  revalidatePath("/registro");
  revalidatePath("/dashboard");
  revalidatePath("/presupuesto");
}

export async function deleteExpense(id: string): Promise<{ success: true } | { success: false; error: string }> {
  const before = (await db.execute(sql`
    SELECT date::text as date, payment_method, is_shared FROM expenses WHERE id = ${id}
  `)).rows[0] as { date: string; payment_method: string; is_shared: boolean } | undefined;

  if (!before) return { success: false, error: "El registro no existe" };

  // Edge case #4 (gastos compartidos): bloquear si ya hay reembolsos asignados
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
    // Si está pendiente sin allocations: el ON DELETE CASCADE limpia la fonavi_receivable
  }

  await db.delete(expenses).where(eq(expenses.id, id));
  if (before.payment_method !== "efectivo") {
    await recalcBankBalance(before.date);
  }
  revalidatePath("/registro");
  revalidatePath("/dashboard");
  revalidatePath("/presupuesto");
  revalidatePath("/fonavi");
  return { success: true };
}

export async function getExpensesByDate(date: string) {
  const result = await db.execute(sql`
    SELECT * FROM expenses WHERE date = ${date} ORDER BY sort_order ASC, created_at ASC
  `);
  return result.rows;
}

export async function reorderExpenses(items: { id: string; sortOrder: number }[]) {
  for (const item of items) {
    await db.execute(sql`UPDATE expenses SET sort_order = ${item.sortOrder} WHERE id = ${item.id}`);
  }
  revalidatePath("/registro");
}

export async function getExpensesByDateRange(startDate: string, endDate: string) {
  const result = await db.execute(sql`
    SELECT
      e.*,
      c.name as client_name
    FROM expenses e
    LEFT JOIN clients c ON false
    WHERE e.date >= ${startDate} AND e.date <= ${endDate}
    ORDER BY e.date DESC, e.created_at DESC
  `);
  return result.rows;
}

export async function getExpensesByCategory(month: string) {
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;
  const result = await db.execute(sql`
    SELECT
      category,
      SUM(amount) as total
    FROM expenses
    WHERE date >= ${startDate} AND date <= ${endDate}
    GROUP BY category
    ORDER BY total DESC
  `);
  return result.rows;
}

export async function getMonthlyExpensesTotal(month: string) {
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE date >= ${startDate} AND date <= ${endDate}
  `);
  return parseFloat(result.rows[0]?.total as string || "0");
}
