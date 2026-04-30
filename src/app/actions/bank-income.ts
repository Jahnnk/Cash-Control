"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recalcBankBalance } from "./daily-records";

export async function saveBankIncomeItems(
  date: string,
  items: { amount: number; clientId: string | null; note: string }[]
) {
  // Delete existing items for this date and re-insert
  await db.execute(sql`DELETE FROM bank_income_items WHERE date = ${date}`);

  for (const item of items) {
    await db.execute(sql`
      INSERT INTO bank_income_items (date, amount, client_id, note)
      VALUES (${date}, ${item.amount}, ${item.clientId}, ${item.note || null})
    `);
  }

  // Also update the bank_income total in daily_records
  const total = items.reduce((s, i) => s + i.amount, 0);
  await db.execute(sql`
    UPDATE daily_records SET bank_income = ${total} WHERE date = ${date}
  `);

  // Recalcular bank_balance_real EN CADENA desde esta fecha hasta el último día
  await recalcBankBalance(date);

  revalidatePath("/dashboard");
  revalidatePath("/registro");
}

export async function updateBankIncomeItem(id: string, data: { amount?: number; clientId?: string | null; note?: string }) {
  if (data.amount !== undefined) await db.execute(sql`UPDATE bank_income_items SET amount = ${data.amount} WHERE id = ${id}`);
  if (data.clientId !== undefined) await db.execute(sql`UPDATE bank_income_items SET client_id = ${data.clientId} WHERE id = ${id}`);
  if (data.note !== undefined) await db.execute(sql`UPDATE bank_income_items SET note = ${data.note} WHERE id = ${id}`);

  // Si cambió el monto, propagar saldo en cadena desde la fecha del registro
  if (data.amount !== undefined) {
    const row = (await db.execute(sql`SELECT date::text as date FROM bank_income_items WHERE id = ${id}`)).rows[0] as { date: string } | undefined;
    if (row) await recalcBankBalance(row.date);
  }

  revalidatePath("/dashboard");
  revalidatePath("/registro");
}

export async function deleteBankIncomeItem(id: string) {
  // Capturar fecha antes de borrar para cascade
  const row = (await db.execute(sql`SELECT date::text as date FROM bank_income_items WHERE id = ${id}`)).rows[0] as { date: string } | undefined;
  await db.execute(sql`DELETE FROM bank_income_items WHERE id = ${id}`);
  if (row) await recalcBankBalance(row.date);
  revalidatePath("/dashboard");
  revalidatePath("/registro");
}

export async function getBankIncomeItems(date: string) {
  const result = await db.execute(sql`
    SELECT bi.*, c.name as client_name
    FROM bank_income_items bi
    LEFT JOIN clients c ON c.id = bi.client_id
    WHERE bi.date = ${date}
    ORDER BY bi.sort_order ASC, bi.created_at ASC
  `);
  return result.rows;
}

export async function reorderBankIncomeItems(items: { id: string; sortOrder: number }[]) {
  for (const item of items) {
    await db.execute(sql`UPDATE bank_income_items SET sort_order = ${item.sortOrder} WHERE id = ${item.id}`);
  }
}
