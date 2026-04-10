"use server";

import { db } from "@/db";
import { bankBalance } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function upsertBankBalance(data: {
  date: string;
  closingBalance: number;
  notes?: string;
}) {
  // Upsert: insert or update on conflict
  await db.execute(sql`
    INSERT INTO bank_balance (date, closing_balance, notes)
    VALUES (${data.date}, ${data.closingBalance}, ${data.notes || null})
    ON CONFLICT (date)
    DO UPDATE SET closing_balance = ${data.closingBalance}, notes = ${data.notes || null}
  `);
  revalidatePath("/registro");
  revalidatePath("/dashboard");
}

export async function getLatestBankBalance() {
  const [result] = await db
    .select()
    .from(bankBalance)
    .orderBy(desc(bankBalance.date))
    .limit(1);
  return result;
}

export async function getBankBalanceByDate(date: string) {
  const [result] = await db
    .select()
    .from(bankBalance)
    .where(eq(bankBalance.date, date));
  return result;
}

export async function getBankBalanceRange(startDate: string, endDate: string) {
  const result = await db.execute(sql`
    SELECT * FROM bank_balance
    WHERE date >= ${startDate} AND date <= ${endDate}
    ORDER BY date ASC
  `);
  return result.rows;
}
