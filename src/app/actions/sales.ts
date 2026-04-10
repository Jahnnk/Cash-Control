"use server";

import { db } from "@/db";
import { sales } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createSale(data: {
  clientId: string;
  date: string;
  amount: number;
  discount: number;
  notes?: string;
}) {
  const netAmount = data.amount - data.discount;
  await db.insert(sales).values({
    clientId: data.clientId,
    date: data.date,
    amount: data.amount.toFixed(2),
    discount: data.discount.toFixed(2),
    netAmount: netAmount.toFixed(2),
    notes: data.notes || null,
  });
  revalidatePath("/registro");
  revalidatePath("/dashboard");
}

export async function deleteSale(id: string) {
  await db.delete(sales).where(eq(sales.id, id));
  revalidatePath("/registro");
  revalidatePath("/dashboard");
}

export async function getUncollectedSalesByClient(clientId: string) {
  return db
    .select()
    .from(sales)
    .where(and(eq(sales.clientId, clientId), eq(sales.isCollected, false)))
    .orderBy(sales.date);
}

export async function getSalesByDateRange(startDate: string, endDate: string) {
  const result = await db.execute(sql`
    SELECT
      s.*,
      c.name as client_name
    FROM sales s
    JOIN clients c ON c.id = s.client_id
    WHERE s.date >= ${startDate} AND s.date <= ${endDate}
    ORDER BY s.date DESC, s.created_at DESC
  `);
  return result.rows;
}
