"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function getDashboardData() {
  const today = new Date().toISOString().split("T")[0];
  const currentMonth = today.substring(0, 7);
  const startOfMonth = `${currentMonth}-01`;

  // Latest bank balance from daily_records
  const bankResult = await db.execute(sql`
    SELECT bank_balance_real, date FROM daily_records
    WHERE bank_balance_real IS NOT NULL
    ORDER BY date DESC LIMIT 1
  `);
  const bankBalance = bankResult.rows[0]
    ? parseFloat(bankResult.rows[0].bank_balance_real as string)
    : 0;
  const bankDate = bankResult.rows[0]?.date as string | null;

  // CxC global: total Byte sold - total collected in bank
  const cxcResult = await db.execute(sql`
    SELECT
      COALESCE(SUM(byte_total), 0) as total_byte,
      COALESCE(SUM(bank_income), 0) as total_collected
    FROM daily_records
  `);
  const totalByte = parseFloat(cxcResult.rows[0].total_byte as string);
  const totalCollected = parseFloat(cxcResult.rows[0].total_collected as string);
  const accountsReceivable = Math.max(0, totalByte - totalCollected);

  // Monthly expenses total
  const expResult = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE date >= ${startOfMonth} AND date <= ${today}
  `);
  const monthlyExpenses = parseFloat(expResult.rows[0].total as string);

  // Monthly expenses by method (transferencia vs efectivo)
  const expByMethod = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN payment_method != 'efectivo' THEN amount ELSE 0 END), 0) as bank_expenses,
      COALESCE(SUM(CASE WHEN payment_method = 'efectivo' THEN amount ELSE 0 END), 0) as cash_expenses
    FROM expenses
    WHERE date >= ${startOfMonth} AND date <= ${today}
  `);

  // Days of coverage
  const dayOfMonth = new Date().getDate();
  const avgDailyExpense = dayOfMonth > 0 ? monthlyExpenses / dayOfMonth : 0;
  const daysCovered = avgDailyExpense > 0 ? Math.floor(bankBalance / avgDailyExpense) : 999;

  // Last 7 days from daily_records + expenses split by method
  const last7Days = await db.execute(sql`
    WITH dates AS (
      SELECT generate_series(
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        '1 day'
      )::date as date
    )
    SELECT
      d.date,
      COALESCE(dr.byte_total, 0) as byte_total,
      COALESCE(dr.bank_income, 0) as bank_income,
      dr.bank_balance_real,
      COALESCE(dr.byte_credit_day, 0) as byte_credit_day,
      COALESCE(dr.byte_credit_collected, 0) as byte_credit_collected,
      COALESCE(dr.byte_cash, 0) as byte_cash,
      COALESCE(dr.byte_discounts, 0) as byte_discounts,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date = d.date AND payment_method != 'efectivo'), 0) as bank_expenses,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date = d.date AND payment_method = 'efectivo'), 0) as cash_expenses,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date = d.date), 0) as expenses_total
    FROM dates d
    LEFT JOIN daily_records dr ON dr.date = d.date
    ORDER BY d.date ASC
  `);

  // Monthly Byte summary
  const monthlyByte = await db.execute(sql`
    SELECT
      COALESCE(SUM(byte_total), 0) as month_byte_total,
      COALESCE(SUM(bank_income), 0) as month_bank_income,
      COALESCE(SUM(byte_credit_day), 0) as month_credit_day,
      COALESCE(SUM(byte_credit_collected), 0) as month_credit_collected
    FROM daily_records
    WHERE date >= ${startOfMonth} AND date <= ${today}
  `);

  // Bank reconciliation: what Byte says should have entered bank vs what BCP shows
  // Expected bank income = Digital payments + Credit collections (NOT cash/efectivo)
  const reconciliation = await db.execute(sql`
    WITH daily AS (
      SELECT
        dr.date,
        COALESCE(dr.byte_digital, 0) as byte_digital,
        COALESCE(dr.byte_credit_collected, 0) as byte_credit_collected,
        (COALESCE(dr.byte_digital, 0) + COALESCE(dr.byte_credit_collected, 0)) as byte_expected_bank,
        COALESCE(dr.bank_income, 0) as bank_income,
        COALESCE((SELECT SUM(amount) FROM expenses WHERE date = dr.date AND payment_method != 'efectivo'), 0) as bank_expenses,
        dr.bank_balance_real
      FROM daily_records dr
      WHERE dr.date >= ${startOfMonth} AND dr.date <= ${today}
        AND (COALESCE(dr.byte_total, 0) > 0 OR COALESCE(dr.bank_income, 0) > 0)
    )
    SELECT
      date,
      byte_digital,
      byte_credit_collected,
      byte_expected_bank,
      bank_income,
      (byte_expected_bank - bank_income) as income_diff,
      bank_expenses,
      (bank_income - bank_expenses) as bank_net,
      bank_balance_real
    FROM daily
    ORDER BY date ASC
  `);

  const reconTotals = await db.execute(sql`
    SELECT
      COALESCE(SUM(bank_income), 0) as total_bank_income,
      COALESCE((
        SELECT SUM(amount) FROM expenses
        WHERE date >= ${startOfMonth} AND date <= ${today} AND payment_method != 'efectivo'
      ), 0) as total_bank_expenses
    FROM daily_records
    WHERE date >= ${startOfMonth} AND date <= ${today}
  `);

  // Cash summary (efectivo): Contado Byte + cobros efectivo vs egresos efectivo
  const cashSummary = await db.execute(sql`
    SELECT
      COALESCE(SUM(byte_cash), 0) as total_cash_income,
      COALESCE((
        SELECT SUM(amount) FROM expenses
        WHERE date >= ${startOfMonth} AND date <= ${today} AND payment_method = 'efectivo'
      ), 0) as total_cash_expenses
    FROM daily_records
    WHERE date >= ${startOfMonth} AND date <= ${today}
  `);

  return {
    bankBalance,
    bankDate,
    accountsReceivable,
    monthlyExpenses,
    daysCovered,
    avgDailyExpense,
    expByMethod: expByMethod.rows[0],
    last7Days: last7Days.rows,
    monthlyByte: monthlyByte.rows[0],
    reconciliation: reconciliation.rows,
    reconTotals: reconTotals.rows[0],
    cashSummary: cashSummary.rows[0],
  };
}
