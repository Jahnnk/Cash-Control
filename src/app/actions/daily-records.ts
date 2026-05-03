"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

/**
 * Todas las queries filtran por business_id (Ola 7). El INSERT/UPDATE en
 * daily_records usa el UNIQUE compuesto (business_id, date).
 */

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
  const bId = await activeBusinessId();
  await db.execute(sql`
    INSERT INTO daily_records (
      business_id,
      date, byte_cash_physical, byte_digital, byte_cash,
      byte_credit_day, byte_credit_collected,
      byte_credit_balance, byte_discounts, byte_total,
      byte_cash_sale, byte_cash_sale_method,
      bank_income, bank_expense, bank_balance_real
    ) VALUES (
      ${bId},
      ${data.date}, ${data.byteCashPhysical}, ${data.byteDigital},
      ${data.byteCashPhysical + data.byteDigital},
      ${data.byteCreditDay}, ${data.byteCreditCollected},
      ${data.byteCreditBalance}, ${data.byteDiscounts}, ${data.byteTotal},
      ${data.byteCashSale}, ${data.byteCashSaleMethod},
      ${data.bankIncome}, ${data.bankExpense}, ${data.bankBalanceReal}
    )
    ON CONFLICT (business_id, date) DO UPDATE SET
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
  revalidatePath("/", "layout");
}

/**
 * Propaga la cadena del saldo desde anchorDate+1 hasta MAX(date) del
 * negocio activo. Toda la cascada filtra por business_id para no
 * recalcular los saldos de otros negocios.
 */
async function propagateFromDate(bId: number, anchorDate: string) {
  await db.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT date, bank_balance_real::numeric AS calc_balance
      FROM daily_records
      WHERE business_id = ${bId} AND date = ${anchorDate} AND bank_balance_real IS NOT NULL

      UNION ALL

      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND date = dr.date), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND date = dr.date AND payment_method != 'efectivo'), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = (c.date + INTERVAL '1 day')::date
      WHERE dr.business_id = ${bId} AND dr.date <= (SELECT MAX(date) FROM daily_records WHERE business_id = ${bId})
    )
    UPDATE daily_records dr
    SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.business_id = ${bId} AND dr.date = chain.date AND dr.date > ${anchorDate}
  `);
}

export async function updateBankBalance(date: string, balance: number) {
  const bId = await activeBusinessId();
  await db.execute(sql`
    INSERT INTO daily_records (business_id, date, bank_balance_real)
    VALUES (${bId}, ${date}, ${balance})
    ON CONFLICT (business_id, date) DO UPDATE SET bank_balance_real = ${balance}
  `);
  await propagateFromDate(bId, date);
  revalidatePath("/", "layout");
}

export async function recalcBankBalance(date: string) {
  const bId = await activeBusinessId();

  // Refresca cache del día afectado primero (del negocio activo)
  await db.execute(sql`
    UPDATE daily_records dr SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND date = dr.date), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND date = dr.date AND payment_method != 'efectivo'), 0)
    WHERE dr.business_id = ${bId} AND dr.date = ${date}
  `);

  // Recalcula bank_balance_real en cadena desde `date` hasta MAX(date) del negocio
  await db.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT
        (${date}::date - INTERVAL '1 day')::date AS date,
        COALESCE((
          SELECT bank_balance_real::numeric FROM daily_records
          WHERE business_id = ${bId} AND date < ${date} AND bank_balance_real IS NOT NULL
          ORDER BY date DESC LIMIT 1
        ), 0) AS calc_balance

      UNION ALL

      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND date = dr.date), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND date = dr.date AND payment_method != 'efectivo'), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = (c.date + INTERVAL '1 day')::date
      WHERE dr.business_id = ${bId} AND dr.date <= (SELECT MAX(date) FROM daily_records WHERE business_id = ${bId})
    )
    UPDATE daily_records dr
    SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.business_id = ${bId} AND dr.date = chain.date AND dr.date >= ${date}
  `);

  const result = await db.execute(sql`
    SELECT bank_balance_real::float as balance FROM daily_records
    WHERE business_id = ${bId} AND date = ${date}
  `);
  const newBalance = result.rows[0] ? parseFloat(result.rows[0].balance as string) : 0;

  revalidatePath("/", "layout");
  return newBalance;
}

export async function updateDailyTotals(date: string, bankIncome: number | null, bankExpense: number | null) {
  const bId = await activeBusinessId();
  if (bankIncome !== null) {
    await db.execute(sql`
      INSERT INTO daily_records (business_id, date, bank_income) VALUES (${bId}, ${date}, ${bankIncome})
      ON CONFLICT (business_id, date) DO UPDATE SET bank_income = ${bankIncome}
    `);
  }
  if (bankExpense !== null) {
    await db.execute(sql`
      INSERT INTO daily_records (business_id, date, bank_expense) VALUES (${bId}, ${date}, ${bankExpense})
      ON CONFLICT (business_id, date) DO UPDATE SET bank_expense = ${bankExpense}
    `);
  }
  revalidatePath("/", "layout");
}

export async function getDailyRecord(date: string) {
  const bId = await activeBusinessId();
  const result = await db.execute(sql`
    SELECT * FROM daily_records WHERE business_id = ${bId} AND date = ${date}
  `);
  return result.rows[0] || null;
}

export async function getLastBankBalance(beforeDate: string) {
  const bId = await activeBusinessId();
  const result = await db.execute(sql`
    SELECT bank_balance_real, date FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND date < ${beforeDate}
    ORDER BY date DESC LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function updateCurrentBankBalance(balance: number) {
  const bId = await activeBusinessId();
  const today = new Date().toISOString().slice(0, 10);
  await db.execute(sql`
    INSERT INTO daily_records (business_id, date, bank_balance_real)
    VALUES (${bId}, ${today}, ${balance})
    ON CONFLICT (business_id, date) DO UPDATE SET bank_balance_real = ${balance}
  `);
  await propagateFromDate(bId, today);
  revalidatePath("/", "layout");
  return today;
}
