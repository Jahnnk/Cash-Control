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

// Propaga la cadena desde anchorDate+1 hasta MAX, dejando intacto anchorDate.
// Usa el bank_balance_real de anchorDate como punto fijo.
async function propagateFromDate(anchorDate: string) {
  await db.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT date, bank_balance_real::numeric AS calc_balance
      FROM daily_records
      WHERE date = ${anchorDate} AND bank_balance_real IS NOT NULL

      UNION ALL

      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = dr.date), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE date = dr.date AND payment_method != 'efectivo'), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = (c.date + INTERVAL '1 day')::date
      WHERE dr.date <= (SELECT MAX(date) FROM daily_records)
    )
    UPDATE daily_records dr
    SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.date = chain.date AND dr.date > ${anchorDate}
  `);
}

export async function updateBankBalance(date: string, balance: number) {
  await db.execute(sql`
    INSERT INTO daily_records (date, bank_balance_real)
    VALUES (${date}, ${balance})
    ON CONFLICT (date) DO UPDATE SET bank_balance_real = ${balance}
  `);
  // Propagar a días posteriores (si los hay) tomando el saldo manual como anclaje
  await propagateFromDate(date);
  revalidatePath("/dashboard");
  revalidatePath("/registro");
  revalidatePath("/reportes");
}

// Recalcula bank_balance_real desde `fromDate` en CADENA hasta el último día con datos.
// Cada día se calcula como: saldo_dia_previo + ingresos_dia − egresos_no_efectivo_dia.
// El anclaje es el último bank_balance_real registrado antes de fromDate (0 si no hay).
// También refresca cache bank_income / bank_expense (no-efectivo) por consistencia.
export async function recalcBankBalance(date: string) {
  // Refresca cache del día afectado primero
  await db.execute(sql`
    UPDATE daily_records dr SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = dr.date), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE date = dr.date AND payment_method != 'efectivo'), 0)
    WHERE dr.date = ${date}
  `);

  // Recalcula bank_balance_real en cadena desde `date` hasta MAX(date)
  await db.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT
        (${date}::date - INTERVAL '1 day')::date AS date,
        COALESCE((
          SELECT bank_balance_real::numeric FROM daily_records
          WHERE date < ${date} AND bank_balance_real IS NOT NULL
          ORDER BY date DESC LIMIT 1
        ), 0) AS calc_balance

      UNION ALL

      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = dr.date), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE date = dr.date AND payment_method != 'efectivo'), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = (c.date + INTERVAL '1 day')::date
      WHERE dr.date <= (SELECT MAX(date) FROM daily_records)
    )
    UPDATE daily_records dr
    SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.date = chain.date AND dr.date >= ${date}
  `);

  // Devolver el saldo del día afectado
  const result = await db.execute(sql`
    SELECT bank_balance_real::float as balance FROM daily_records WHERE date = ${date}
  `);
  const newBalance = result.rows[0] ? parseFloat(result.rows[0].balance as string) : 0;

  revalidatePath("/dashboard");
  revalidatePath("/registro");
  revalidatePath("/reportes");

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

// Editar el saldo BCP de "hoy real" (no de la fecha seleccionada).
export async function updateCurrentBankBalance(balance: number) {
  const today = new Date().toISOString().slice(0, 10);
  await db.execute(sql`
    INSERT INTO daily_records (date, bank_balance_real)
    VALUES (${today}, ${balance})
    ON CONFLICT (date) DO UPDATE SET bank_balance_real = ${balance}
  `);
  // Propagar a días posteriores (caso edge: si hubiera filas con fecha > hoy)
  await propagateFromDate(today);
  revalidatePath("/dashboard");
  revalidatePath("/registro");
  revalidatePath("/reportes");
  return today;
}
