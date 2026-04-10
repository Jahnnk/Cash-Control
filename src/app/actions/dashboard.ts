"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function getDashboardData() {
  const today = new Date().toISOString().split("T")[0];
  const currentMonth = today.substring(0, 7);
  const startOfMonth = `${currentMonth}-01`;

  // Latest bank balance
  const bankResult = await db.execute(sql`
    SELECT closing_balance, date FROM bank_balance
    ORDER BY date DESC LIMIT 1
  `);
  const bankBalance = bankResult.rows[0]
    ? parseFloat(bankResult.rows[0].closing_balance as string)
    : 0;
  const bankDate = bankResult.rows[0]?.date as string | null;

  // Total accounts receivable
  const arResult = await db.execute(sql`
    SELECT COALESCE(SUM(net_amount), 0) as total
    FROM sales WHERE is_collected = false
  `);
  const accountsReceivable = parseFloat(arResult.rows[0].total as string);

  // Monthly expenses
  const expResult = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE date >= ${startOfMonth} AND date <= ${today}
  `);
  const monthlyExpenses = parseFloat(expResult.rows[0].total as string);

  // Days in month so far
  const dayOfMonth = new Date().getDate();
  const avgDailyExpense = dayOfMonth > 0 ? monthlyExpenses / dayOfMonth : 0;
  const daysCovered = avgDailyExpense > 0 ? Math.floor(bankBalance / avgDailyExpense) : 999;

  // Accounts receivable by client with aging
  const arByClient = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.type,
      c.payment_pattern,
      COALESCE(SUM(s.net_amount), 0) as pending_amount,
      MIN(s.date) as oldest_date
    FROM clients c
    LEFT JOIN sales s ON s.client_id = c.id AND s.is_collected = false
    WHERE c.is_active = true
    GROUP BY c.id, c.name, c.type, c.payment_pattern
    HAVING COALESCE(SUM(s.net_amount), 0) > 0
    ORDER BY pending_amount DESC
  `);

  // Last 7 days summary
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
      COALESCE((SELECT SUM(net_amount) FROM sales WHERE date = d.date), 0) as sales_total,
      COALESCE((SELECT SUM(amount) FROM collections WHERE date = d.date), 0) as collections_total,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date = d.date), 0) as expenses_total,
      (SELECT closing_balance FROM bank_balance WHERE date = d.date) as bank_balance
    FROM dates d
    ORDER BY d.date ASC
  `);

  return {
    bankBalance,
    bankDate,
    accountsReceivable,
    monthlyExpenses,
    daysCovered,
    avgDailyExpense,
    arByClient: arByClient.rows,
    last7Days: last7Days.rows,
  };
}
