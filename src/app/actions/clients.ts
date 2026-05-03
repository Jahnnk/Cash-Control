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
  // El cálculo de pending_amount usaba LEFT JOIN sales (tabla eliminada en
  // Ola 4). El sistema vivo no atribuye ingresos por cliente
  // (bank_income_items.client_id está siempre NULL), así que pending_amount
  // siempre era 0 para clientes activos. Devolvemos la lista plana.
  const result = await db.execute(sql`
    SELECT
      id,
      name,
      type,
      payment_pattern,
      is_active,
      0::numeric AS pending_amount,
      NULL::date AS oldest_pending_date
    FROM clients
    WHERE is_active = true
    ORDER BY name
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
