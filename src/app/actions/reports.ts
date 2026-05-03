"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";

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

  // Totals
  // - total_income: ingresos OPERATIVOS (excluye reembolsos Fonavi, no son ventas)
  // - total_expenses: parte ATELIER de cada egreso (atelier_amount si es compartido, sino amount)
  const totals = await db.execute(sql`
    SELECT
      COALESCE(SUM(byte_total), 0) as total_byte,
      COALESCE((
        SELECT SUM(amount) FROM bank_income_items
        WHERE date >= ${startDate} AND date <= ${endDate} AND is_fonavi_reimbursement = false
      ), 0) as total_income,
      COALESCE(SUM(bank_expense), 0) as total_bank_expense,
      COALESCE((
        SELECT SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)
        FROM expenses WHERE date >= ${startDate} AND date <= ${endDate}
      ), 0) as total_expenses,
      COALESCE((
        SELECT SUM(amount) FROM bank_income_items
        WHERE date >= ${startDate} AND date <= ${endDate} AND is_fonavi_reimbursement = true
      ), 0) as total_fonavi_reimbursements
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

  // Expenses por categoría (parte Atelier)
  const byCategory = await db.execute(sql`
    SELECT category, SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END) as total
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

export async function getDailyBreakdown(month: string, type: "byte" | "income" | "expense") {
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
  } else if (type === "income") {
    // Individual income items per day, most recent day first
    const result = await db.execute(sql`
      SELECT bi.id, bi.date, bi.amount, bi.note, bi.client_id, c.name as client_name
      FROM bank_income_items bi
      LEFT JOIN clients c ON c.id = bi.client_id
      WHERE bi.date >= ${startDate} AND bi.date <= ${endDate}
      ORDER BY bi.date DESC, bi.sort_order ASC
    `);
    return result.rows;
  } else {
    // Individual expense items per day, most recent day first, mayor monto primero dentro del día
    const result = await db.execute(sql`
      SELECT id, date, amount, category, concept, notes, payment_method
      FROM expenses
      WHERE date >= ${startDate} AND date <= ${endDate}
      ORDER BY date DESC, amount DESC
    `);
    return result.rows;
  }
}
