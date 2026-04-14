"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function upsertDailyRecord(data: {
  date: string;
  byteCashPhysical: number;
  byteDigital: number;
  byteCreditDay: number;
  byteCreditCollected: number;
  byteCreditBalance: number;
  byteDiscounts: number;
  byteTotal: number;
  byteCashSale: number;
  byteCashSaleMethod: string;
  bankIncome: number;
  bankExpense: number;
  bankBalanceReal: number | null;
}) {
  await db.execute(sql`
    INSERT INTO daily_records (
      date, byte_cash_physical, byte_digital, byte_cash,
      byte_credit_day, byte_credit_collected,
      byte_credit_balance, byte_discounts, byte_total,
      byte_cash_sale, byte_cash_sale_method,
      bank_income, bank_expense, bank_balance_real
    ) VALUES (
      ${data.date}, ${data.byteCashPhysical}, ${data.byteDigital},
      ${data.byteCashPhysical + data.byteDigital},
      ${data.byteCreditDay}, ${data.byteCreditCollected},
      ${data.byteCreditBalance}, ${data.byteDiscounts}, ${data.byteTotal},
      ${data.byteCashSale}, ${data.byteCashSaleMethod},
      ${data.bankIncome}, ${data.bankExpense}, ${data.bankBalanceReal}
    )
    ON CONFLICT (date) DO UPDATE SET
      byte_cash_physical = ${data.byteCashPhysical},
      byte_digital = ${data.byteDigital},
      byte_cash = ${data.byteCashPhysical + data.byteDigital},
      byte_credit_day = ${data.byteCreditDay},
      byte_credit_collected = ${data.byteCreditCollected},
      byte_credit_balance = ${data.byteCreditBalance},
      byte_discounts = ${data.byteDiscounts},
      byte_total = ${data.byteTotal},
      byte_cash_sale = ${data.byteCashSale},
      byte_cash_sale_method = ${data.byteCashSaleMethod},
      bank_income = ${data.bankIncome},
      bank_expense = ${data.bankExpense},
      bank_balance_real = ${data.bankBalanceReal}
  `);
  revalidatePath("/dashboard");
  revalidatePath("/registro");
  revalidatePath("/reportes");
}

export async function updateBankBalance(date: string, balance: number) {
  // Ensure daily record exists, then update saldo
  await db.execute(sql`
    INSERT INTO daily_records (date, bank_balance_real)
    VALUES (${date}, ${balance})
    ON CONFLICT (date) DO UPDATE SET bank_balance_real = ${balance}
  `);
  revalidatePath("/dashboard");
  revalidatePath("/registro");
}

export async function updateDailyTotals(date: string, bankIncome: number | null, bankExpense: number | null) {
  if (bankIncome !== null) {
    await db.execute(sql`
      INSERT INTO daily_records (date, bank_income) VALUES (${date}, ${bankIncome})
      ON CONFLICT (date) DO UPDATE SET bank_income = ${bankIncome}
    `);
  }
  if (bankExpense !== null) {
    await db.execute(sql`
      INSERT INTO daily_records (date, bank_expense) VALUES (${date}, ${bankExpense})
      ON CONFLICT (date) DO UPDATE SET bank_expense = ${bankExpense}
    `);
  }
  revalidatePath("/dashboard");
  revalidatePath("/registro");
}

export async function getDailyRecord(date: string) {
  const result = await db.execute(sql`
    SELECT * FROM daily_records WHERE date = ${date}
  `);
  return result.rows[0] || null;
}

export async function getLastBankBalance(beforeDate: string) {
  const result = await db.execute(sql`
    SELECT bank_balance_real, date FROM daily_records
    WHERE bank_balance_real IS NOT NULL AND date < ${beforeDate}
    ORDER BY date DESC LIMIT 1
  `);
  return result.rows[0] || null;
}
