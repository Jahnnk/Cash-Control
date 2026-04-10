"use server";

import { db } from "@/db";
import { collections, sales } from "@/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createCollection(data: {
  clientId: string;
  date: string;
  amount: number;
  notes?: string;
}) {
  // Insert the collection
  await db.insert(collections).values({
    clientId: data.clientId,
    date: data.date,
    amount: data.amount.toFixed(2),
    notes: data.notes || null,
  });

  // FIFO: Mark oldest uncollected sales as collected
  await applyFIFO(data.clientId, data.amount);

  revalidatePath("/registro");
  revalidatePath("/dashboard");
}

async function applyFIFO(clientId: string, collectionAmount: number) {
  // Get uncollected sales ordered by date (oldest first)
  const uncollectedSales = await db
    .select()
    .from(sales)
    .where(and(eq(sales.clientId, clientId), eq(sales.isCollected, false)))
    .orderBy(asc(sales.date));

  let remaining = collectionAmount;

  for (const sale of uncollectedSales) {
    if (remaining <= 0) break;

    const saleNet = parseFloat(sale.netAmount);
    if (remaining >= saleNet) {
      // Fully covers this sale
      await db
        .update(sales)
        .set({ isCollected: true })
        .where(eq(sales.id, sale.id));
      remaining -= saleNet;
    }
    // If partial, don't mark as collected (stays pending)
    // The remaining amount carries over
  }
}

export async function deleteCollection(id: string) {
  await db.delete(collections).where(eq(collections.id, id));
  revalidatePath("/registro");
  revalidatePath("/dashboard");
}

export async function getCollectionsByDateRange(startDate: string, endDate: string) {
  const result = await db.execute(sql`
    SELECT
      col.*,
      c.name as client_name
    FROM collections col
    JOIN clients c ON c.id = col.client_id
    WHERE col.date >= ${startDate} AND col.date <= ${endDate}
    ORDER BY col.date DESC, col.created_at DESC
  `);
  return result.rows;
}
