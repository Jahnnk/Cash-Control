"use server";

import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
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
