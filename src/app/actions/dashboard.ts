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

  // Days of coverage
  const dayOfMonth = new Date().getDate();
  const avgDailyExpense = dayOfMonth > 0 ? monthlyExpenses / dayOfMonth : 0;
  const daysCovered = avgDailyExpense > 0 ? Math.floor(bankBalance / avgDailyExpense) : 999;

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

  return {
    bankBalance,
    bankDate,
    accountsReceivable,
    monthlyExpenses,
    daysCovered,
    avgDailyExpense,
    monthlyByte: monthlyByte.rows[0],
  };
}
