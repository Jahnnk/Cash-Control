"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { recalcBankBalance } from "./daily-records";

export async function saveBankIncomeItems(
  date: string,
  items: { amount: number; clientId: string | null; note: string }[]
) {
  const bId = await activeBusinessId();
  // Delete existing items for this date+business and re-insert
  await db.execute(sql`DELETE FROM bank_income_items WHERE business_id = ${bId} AND date = ${date}`);

  for (const item of items) {
    await db.execute(sql`
      INSERT INTO bank_income_items (business_id, date, amount, client_id, note)
      VALUES (${bId}, ${date}, ${item.amount}, ${item.clientId}, ${item.note || null})
    `);
  }

  // Cache total en daily_records (del mismo negocio)
  const total = items.reduce((s, i) => s + i.amount, 0);
  await db.execute(sql`
    UPDATE daily_records SET bank_income = ${total}
    WHERE business_id = ${bId} AND date = ${date}
  `);

  await recalcBankBalance(date);
  revalidatePath("/", "layout");
}

export async function updateBankIncomeItem(id: string, data: { amount?: number; clientId?: string | null; note?: string }) {
  const bId = await activeBusinessId();
  // Garantizar que el item pertenece al negocio activo (cross-tenant guard)
  if (data.amount !== undefined) await db.execute(sql`UPDATE bank_income_items SET amount = ${data.amount} WHERE id = ${id} AND business_id = ${bId}`);
  if (data.clientId !== undefined) await db.execute(sql`UPDATE bank_income_items SET client_id = ${data.clientId} WHERE id = ${id} AND business_id = ${bId}`);
  if (data.note !== undefined) await db.execute(sql`UPDATE bank_income_items SET note = ${data.note} WHERE id = ${id} AND business_id = ${bId}`);

  if (data.amount !== undefined) {
    const row = (await db.execute(sql`
      SELECT date::text as date FROM bank_income_items WHERE id = ${id} AND business_id = ${bId}
    `)).rows[0] as { date: string } | undefined;
    if (row) await recalcBankBalance(row.date);
  }
  revalidatePath("/", "layout");
}

export async function deleteBankIncomeItem(id: string) {
  const bId = await activeBusinessId();
  const row = (await db.execute(sql`
    SELECT date::text as date FROM bank_income_items WHERE id = ${id} AND business_id = ${bId}
  `)).rows[0] as { date: string } | undefined;
  await db.execute(sql`DELETE FROM bank_income_items WHERE id = ${id} AND business_id = ${bId}`);
  if (row) await recalcBankBalance(row.date);
  revalidatePath("/", "layout");
}

export async function getBankIncomeItems(date: string) {
  const bId = await activeBusinessId();
  const result = await db.execute(sql`
    SELECT bi.*, c.name as client_name
    FROM bank_income_items bi
    LEFT JOIN clients c ON c.id = bi.client_id
    WHERE bi.business_id = ${bId} AND bi.date = ${date}
    ORDER BY bi.sort_order ASC, bi.created_at ASC
  `);
  return result.rows;
}

export async function reorderBankIncomeItems(items: { id: string; sortOrder: number }[]) {
  const bId = await activeBusinessId();
  for (const item of items) {
    await db.execute(sql`
      UPDATE bank_income_items SET sort_order = ${item.sortOrder}
      WHERE id = ${item.id} AND business_id = ${bId}
    `);
  }
}
