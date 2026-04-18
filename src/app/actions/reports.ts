"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function getLast7Days() {
  const rows = await db.execute(sql`
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
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date = d.date), 0) as expenses_total
    FROM dates d
    LEFT JOIN daily_records dr ON dr.date = d.date
    ORDER BY d.date ASC
  `);
  return rows.rows;
}

export async function getWeeklyReport(startDate: string, endDate: string) {
  const dailySummary = await db.execute(sql`
    WITH dates AS (
      SELECT generate_series(
        ${startDate}::date,
        ${endDate}::date,
        '1 day'
      )::date as date
    )
    SELECT
      d.date,
      COALESCE(dr.byte_total, 0) as byte_total,
      COALESCE(dr.byte_credit_day, 0) as byte_credit_day,
      COALESCE(dr.byte_credit_collected, 0) as byte_credit_collected,
      COALESCE(dr.byte_cash, 0) as byte_cash,
      COALESCE(dr.byte_discounts, 0) as byte_discounts,
      COALESCE(dr.bank_income, 0) as bank_income,
      COALESCE(dr.bank_expense, 0) as bank_expense,
      dr.bank_balance_real,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date = d.date), 0) as expenses_total
    FROM dates d
    LEFT JOIN daily_records dr ON dr.date = d.date
    ORDER BY d.date ASC
  `);

  return dailySummary.rows;
}

export async function getMonthlyReport(month: string) {
  const startDate = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  // Totals from daily_records
  const totals = await db.execute(sql`
    SELECT
      COALESCE(SUM(byte_total), 0) as total_byte,
      COALESCE(SUM(bank_income), 0) as total_income,
      COALESCE(SUM(bank_expense), 0) as total_bank_expense,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date >= ${startDate} AND date <= ${endDate}), 0) as total_expenses
    FROM daily_records
    WHERE date >= ${startDate} AND date <= ${endDate}
  `);

  // Bank balance variation
  const bankStart = await db.execute(sql`
    SELECT bank_balance_real FROM daily_records
    WHERE bank_balance_real IS NOT NULL AND date <= ${startDate}
    ORDER BY date DESC LIMIT 1
  `);
  const bankEnd = await db.execute(sql`
    SELECT bank_balance_real FROM daily_records
    WHERE bank_balance_real IS NOT NULL AND date <= ${endDate}
    ORDER BY date DESC LIMIT 1
  `);

  // Expenses by category
  const byCategory = await db.execute(sql`
    SELECT category, SUM(amount) as total
    FROM expenses
    WHERE date >= ${startDate} AND date <= ${endDate}
    GROUP BY category
    ORDER BY total DESC
  `);

  return {
    totals: totals.rows[0],
    bankStartBalance: bankStart.rows[0]
      ? parseFloat(bankStart.rows[0].bank_balance_real as string)
      : 0,
    bankEndBalance: bankEnd.rows[0]
      ? parseFloat(bankEnd.rows[0].bank_balance_real as string)
      : 0,
    byCategory: byCategory.rows,
  };
}

export async function getDebtAgingReport() {
  // With daily_records, CxC is global: total byte - total collected
  // We show it as a single summary, not per-client aging
  const result = await db.execute(sql`
    SELECT
      date,
      byte_total,
      bank_income,
      (COALESCE(byte_total, 0) - COALESCE(bank_income, 0)) as daily_gap
    FROM daily_records
    WHERE COALESCE(byte_total, 0) > 0 OR COALESCE(bank_income, 0) > 0
    ORDER BY date ASC
  `);

  const totals = await db.execute(sql`
    SELECT
      COALESCE(SUM(byte_total), 0) as total_byte,
      COALESCE(SUM(bank_income), 0) as total_collected
    FROM daily_records
  `);

  return {
    dailyData: result.rows,
    totalByte: parseFloat(totals.rows[0].total_byte as string),
    totalCollected: parseFloat(totals.rows[0].total_collected as string),
    totalPending: parseFloat(totals.rows[0].total_byte as string) - parseFloat(totals.rows[0].total_collected as string),
  };
}

export async function getDailyBreakdown(month: string, type: "byte" | "income") {
  const startDate = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  if (type === "byte") {
    const result = await db.execute(sql`
      SELECT date, byte_total, byte_credit_day, byte_cash_sale,
        COALESCE(byte_cash_physical, 0) as byte_cash_physical,
        COALESCE(byte_digital, 0) as byte_digital
      FROM daily_records
      WHERE date >= ${startDate} AND date <= ${endDate} AND COALESCE(byte_total, 0) > 0
      ORDER BY date ASC
    `);
    return result.rows;
  } else {
    // Individual income items per day
    const result = await db.execute(sql`
      SELECT bi.date, bi.amount, bi.note, c.name as client_name
      FROM bank_income_items bi
      LEFT JOIN clients c ON c.id = bi.client_id
      WHERE bi.date >= ${startDate} AND bi.date <= ${endDate}
      ORDER BY bi.date ASC, bi.sort_order ASC
    `);
    return result.rows;
  }
}
