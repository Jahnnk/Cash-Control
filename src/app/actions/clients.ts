"use server";

import { db } from "@/db";
import { clients, sales, collections } from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getClients(activeOnly = true) {
  const conditions = activeOnly ? eq(clients.isActive, true) : undefined;
  return db
    .select()
    .from(clients)
    .where(conditions)
    .orderBy(clients.name);
}

export async function getClientsWithBalance() {
  const result = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.type,
      c.payment_pattern,
      c.is_active,
      COALESCE(SUM(CASE WHEN s.is_collected = false THEN s.net_amount ELSE 0 END), 0) as pending_amount,
      MIN(CASE WHEN s.is_collected = false THEN s.date ELSE NULL END) as oldest_pending_date
    FROM clients c
    LEFT JOIN sales s ON s.client_id = c.id
    WHERE c.is_active = true
    GROUP BY c.id, c.name, c.type, c.payment_pattern, c.is_active
    ORDER BY pending_amount DESC
  `);
  return result.rows;
}

export async function getClientById(id: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, id));
  return client;
}

export async function getClientHistory(clientId: string) {
  const salesData = await db
    .select()
    .from(sales)
    .where(eq(sales.clientId, clientId))
    .orderBy(desc(sales.date));

  const collectionsData = await db
    .select()
    .from(collections)
    .where(eq(collections.clientId, clientId))
    .orderBy(desc(collections.date));

  // Calculate average payment days
  const paidSales = await db.execute(sql`
    SELECT s.date as sale_date, MIN(col.date) as collection_date
    FROM sales s
    JOIN collections col ON col.client_id = s.client_id AND col.date >= s.date
    WHERE s.client_id = ${clientId} AND s.is_collected = true
    GROUP BY s.id, s.date
    ORDER BY s.date DESC
    LIMIT 20
  `);

  let avgDays = 0;
  if (paidSales.rows.length > 0) {
    const totalDays = paidSales.rows.reduce((sum: number, row: Record<string, unknown>) => {
      const saleDate = new Date(row.sale_date as string);
      const collDate = new Date(row.collection_date as string);
      return sum + Math.round((collDate.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);
    avgDays = Math.round(totalDays / paidSales.rows.length);
  }

  return { sales: salesData, collections: collectionsData, avgPaymentDays: avgDays };
}

export async function createClient(data: {
  name: string;
  type: string;
  paymentPattern?: string;
}) {
  await db.insert(clients).values({
    name: data.name,
    type: data.type,
    paymentPattern: data.paymentPattern || null,
  });
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
}

export async function updateClient(
  id: string,
  data: { name?: string; type?: string; paymentPattern?: string; isActive?: boolean }
) {
  await db.update(clients).set(data).where(eq(clients.id, id));
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
}
