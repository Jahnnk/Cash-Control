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
  await db.execute(sql`
    INSERT INTO daily_records (date, bank_balance_real)
    VALUES (${date}, ${balance})
    ON CONFLICT (date) DO UPDATE SET bank_balance_real = ${balance}
  `);
  revalidatePath("/dashboard");
  revalidatePath("/registro");
}

export async function recalcBankBalance(date: string) {
  // Get previous day's balance
  const prev = await db.execute(sql`
    SELECT bank_balance_real FROM daily_records
    WHERE bank_balance_real IS NOT NULL AND date < ${date}
    ORDER BY date DESC LIMIT 1
  `);
  const prevBal = prev.rows[0] ? parseFloat(prev.rows[0].bank_balance_real as string) : 0;

  // Get today's income total
  const incResult = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) as total FROM bank_income_items WHERE date = ${date}
  `);
  const totalIncome = parseFloat(incResult.rows[0].total as string);

  // Get today's bank expenses (non-cash only)
  const expResult = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) as total FROM expenses
    WHERE date = ${date} AND payment_method != 'efectivo'
  `);
  const totalBankExp = parseFloat(expResult.rows[0].total as string);

  // Calculate new balance
  const newBalance = Math.round((prevBal + totalIncome - totalBankExp) * 100) / 100;

  // Update
  await db.execute(sql`
    UPDATE daily_records SET bank_balance_real = ${newBalance} WHERE date = ${date}
  `);

  revalidatePath("/dashboard");
  revalidatePath("/registro");

  return newBalance;
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

// Saldo BCP "hoy real": último snapshot manual + flujo posterior hasta hoy.
// Híbrido: el snapshot ancla la verdad; los movimientos registrados después se aplican.
export async function getCurrentBankBalance() {
  const today = new Date().toISOString().slice(0, 10);

  const anchor = await db.execute(sql`
    SELECT bank_balance_real, date FROM daily_records
    WHERE bank_balance_real IS NOT NULL AND date <= ${today}
    ORDER BY date DESC LIMIT 1
  `);

  if (!anchor.rows[0]) {
    return { balance: 0, anchorDate: null as string | null, hasAnchor: false };
  }

  const anchorBalance = parseFloat(anchor.rows[0].bank_balance_real as string);
  const anchorDate = anchor.rows[0].date as string;

  const inc = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) as total FROM bank_income_items
    WHERE date > ${anchorDate} AND date <= ${today}
  `);
  const exp = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) as total FROM expenses
    WHERE date > ${anchorDate} AND date <= ${today} AND payment_method != 'efectivo'
  `);

  const incomePost = parseFloat(inc.rows[0].total as string);
  const expensePost = parseFloat(exp.rows[0].total as string);
  const balance = Math.round((anchorBalance + incomePost - expensePost) * 100) / 100;

  return { balance, anchorDate, hasAnchor: true };
}

// Editar el saldo BCP de "hoy real" (no de la fecha seleccionada).
export async function updateCurrentBankBalance(balance: number) {
  const today = new Date().toISOString().slice(0, 10);
  await db.execute(sql`
    INSERT INTO daily_records (date, bank_balance_real)
    VALUES (${today}, ${balance})
    ON CONFLICT (date) DO UPDATE SET bank_balance_real = ${balance}
  `);
  revalidatePath("/dashboard");
  revalidatePath("/registro");
  return today;
}
