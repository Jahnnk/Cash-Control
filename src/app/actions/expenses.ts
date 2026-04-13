"use server";

import { db } from "@/db";
import { expenses } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createExpense(data: {
  date: string;
  category: string;
  concept: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
}) {
  await db.insert(expenses).values({
    date: data.date,
    category: data.category,
    concept: data.concept,
    amount: data.amount.toFixed(2),
    paymentMethod: data.paymentMethod || "transferencia",
    notes: data.notes || null,
  });
  revalidatePath("/registro");
  revalidatePath("/dashboard");
  revalidatePath("/presupuesto");
}

export async function updateExpense(id: string, data: {
  category?: string;
  concept?: string;
  amount?: number;
  paymentMethod?: string;
}) {
  if (data.category !== undefined) await db.execute(sql`UPDATE expenses SET category = ${data.category} WHERE id = ${id}`);
  if (data.concept !== undefined) await db.execute(sql`UPDATE expenses SET concept = ${data.concept} WHERE id = ${id}`);
  if (data.amount !== undefined) await db.execute(sql`UPDATE expenses SET amount = ${data.amount} WHERE id = ${id}`);
  if (data.paymentMethod !== undefined) await db.execute(sql`UPDATE expenses SET payment_method = ${data.paymentMethod} WHERE id = ${id}`);
  revalidatePath("/registro");
  revalidatePath("/dashboard");
  revalidatePath("/presupuesto");
}

export async function deleteExpense(id: string) {
  await db.delete(expenses).where(eq(expenses.id, id));
  revalidatePath("/registro");
  revalidatePath("/dashboard");
  revalidatePath("/presupuesto");
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
