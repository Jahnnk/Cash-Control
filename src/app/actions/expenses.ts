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
}

export async function deleteExpense(id: string) {
  await db.delete(expenses).where(eq(expenses.id, id));
  revalidatePath("/registro");
  revalidatePath("/dashboard");
}

export async function getExpensesByDateRange(startDate: string, endDate: string) {
  const result = await db.execute(sql`
    SELECT * FROM expenses
    WHERE date >= ${startDate} AND date <= ${endDate}
    ORDER BY date DESC, created_at DESC
  `);
  return result.rows;
}

export async function getExpensesByCategory(month: string) {
  // month format: 'YYYY-MM'
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
