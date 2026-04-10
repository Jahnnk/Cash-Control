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
      COALESCE((SELECT SUM(net_amount) FROM sales WHERE date = d.date), 0) as sales_total,
      COALESCE((SELECT SUM(amount) FROM collections WHERE date = d.date), 0) as collections_total,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date = d.date), 0) as expenses_total,
      (SELECT closing_balance FROM bank_balance WHERE date = d.date) as bank_balance
    FROM dates d
    ORDER BY d.date ASC
  `);

  return dailySummary.rows;
}

export async function getMonthlyReport(month: string) {
  const startDate = `${month}-01`;
  // Get last day of month
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  // Totals
  const totals = await db.execute(sql`
    SELECT
      COALESCE((SELECT SUM(net_amount) FROM sales WHERE date >= ${startDate} AND date <= ${endDate}), 0) as total_sales,
      COALESCE((SELECT SUM(amount) FROM collections WHERE date >= ${startDate} AND date <= ${endDate}), 0) as total_collections,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date >= ${startDate} AND date <= ${endDate}), 0) as total_expenses
  `);

  // Bank balance variation
  const bankStart = await db.execute(sql`
    SELECT closing_balance FROM bank_balance
    WHERE date <= ${startDate}
    ORDER BY date DESC LIMIT 1
  `);
  const bankEnd = await db.execute(sql`
    SELECT closing_balance FROM bank_balance
    WHERE date <= ${endDate}
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

  // Top 5 clients by sales
  const topBySales = await db.execute(sql`
    SELECT c.name, SUM(s.net_amount) as total
    FROM sales s JOIN clients c ON c.id = s.client_id
    WHERE s.date >= ${startDate} AND s.date <= ${endDate}
    GROUP BY c.name
    ORDER BY total DESC LIMIT 5
  `);

  // Top 5 clients by pending balance
  const topByPending = await db.execute(sql`
    SELECT c.name, SUM(s.net_amount) as total
    FROM sales s JOIN clients c ON c.id = s.client_id
    WHERE s.is_collected = false
    GROUP BY c.name
    ORDER BY total DESC LIMIT 5
  `);

  return {
    totals: totals.rows[0],
    bankStartBalance: bankStart.rows[0]
      ? parseFloat(bankStart.rows[0].closing_balance as string)
      : 0,
    bankEndBalance: bankEnd.rows[0]
      ? parseFloat(bankEnd.rows[0].closing_balance as string)
      : 0,
    byCategory: byCategory.rows,
    topBySales: topBySales.rows,
    topByPending: topByPending.rows,
  };
}

export async function getDebtAgingReport() {
  const result = await db.execute(sql`
    SELECT
      c.id as client_id,
      c.name as client_name,
      s.id as sale_id,
      s.date,
      s.net_amount,
      CURRENT_DATE - s.date::date as days_old
    FROM sales s
    JOIN clients c ON c.id = s.client_id
    WHERE s.is_collected = false
    ORDER BY s.date ASC
  `);

  // Group by ranges
  const ranges = {
    "0-7": { total: 0, clients: new Map<string, number>() },
    "8-15": { total: 0, clients: new Map<string, number>() },
    "16-30": { total: 0, clients: new Map<string, number>() },
    "31-60": { total: 0, clients: new Map<string, number>() },
    "60+": { total: 0, clients: new Map<string, number>() },
  };

  for (const row of result.rows) {
    const days = Number(row.days_old);
    const amount = parseFloat(row.net_amount as string);
    const clientName = row.client_name as string;

    let range: keyof typeof ranges;
    if (days <= 7) range = "0-7";
    else if (days <= 15) range = "8-15";
    else if (days <= 30) range = "16-30";
    else if (days <= 60) range = "31-60";
    else range = "60+";

    ranges[range].total += amount;
    const current = ranges[range].clients.get(clientName) || 0;
    ranges[range].clients.set(clientName, current + amount);
  }

  // Convert Maps to arrays for serialization
  const serializable = Object.entries(ranges).map(([range, data]) => ({
    range,
    total: data.total,
    clients: Array.from(data.clients.entries()).map(([name, amount]) => ({
      name,
      amount,
    })),
  }));

  return serializable;
}
