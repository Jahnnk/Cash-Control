"use server";

import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath, updateTag, unstable_cache } from "next/cache";

// Cache: clientes cambian rara vez (alta/baja manual desde
// /clientes). TTL 2 min. Tag "clients" invalida en create/update.
// La tabla clients NO está particionada por business_id (es lista
// global compartida — solo Atelier la usa hoy), así que un solo
// tag global cubre todo.
const _clientsCached = unstable_cache(
  async (activeOnly: boolean) => {
    const conditions = activeOnly ? eq(clients.isActive, true) : undefined;
    return db.select().from(clients).where(conditions).orderBy(clients.name);
  },
  ["clients-list"],
  { revalidate: 120, tags: ["clients"] },
);

const _clientsWithBalanceCached = unstable_cache(
  async () => {
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
  },
  ["clients-with-balance"],
  { revalidate: 120, tags: ["clients"] },
);

export async function getClients(activeOnly = true) {
  return _clientsCached(activeOnly);
}

export async function getClientsWithBalance() {
  // El cálculo de pending_amount usaba LEFT JOIN sales (tabla eliminada en
  // Ola 4). El sistema vivo no atribuye ingresos por cliente
  // (bank_income_items.client_id está siempre NULL), así que pending_amount
  // siempre era 0 para clientes activos. Devolvemos la lista plana.
  return _clientsWithBalanceCached();
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
  updateTag("clients");
  revalidatePath("/", "layout");
}

export async function updateClient(
  id: string,
  data: { name?: string; type?: string; paymentPattern?: string; isActive?: boolean }
) {
  await db.update(clients).set(data).where(eq(clients.id, id));
  updateTag("clients");
  revalidatePath("/", "layout");
}
