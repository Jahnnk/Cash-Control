"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function getReconciliation(startDate: string, endDate: string) {
  const daily = await db.execute(sql`
    SELECT
      dr.date,
      COALESCE(dr.byte_digital, 0) as byte_digital,
      COALESCE(dr.byte_credit_collected, 0) as byte_credit_collected,
      (COALESCE(dr.byte_digital, 0) + COALESCE(dr.byte_credit_collected, 0)) as byte_expected_bank,
      COALESCE(dr.bank_income, 0) as bank_income,
      (COALESCE(dr.byte_digital, 0) + COALESCE(dr.byte_credit_collected, 0)) - COALESCE(dr.bank_income, 0) as income_diff,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date = dr.date AND payment_method != 'efectivo'), 0) as bank_expenses,
      COALESCE(dr.bank_income, 0) - COALESCE((SELECT SUM(amount) FROM expenses WHERE date = dr.date AND payment_method != 'efectivo'), 0) as bank_net,
      dr.bank_balance_real,
      COALESCE(dr.byte_total, 0) as byte_total
    FROM daily_records dr
    WHERE dr.date >= ${startDate} AND dr.date <= ${endDate}
      AND (COALESCE(dr.byte_total, 0) > 0 OR COALESCE(dr.bank_income, 0) > 0 OR dr.bank_balance_real IS NOT NULL)
    ORDER BY dr.date ASC
  `);

  // Summary totals
  const totals = await db.execute(sql`
    SELECT
      COALESCE(SUM(COALESCE(byte_digital, 0) + COALESCE(byte_credit_collected, 0)), 0) as total_byte_expected,
      COALESCE(SUM(bank_income), 0) as total_bank_income,
      COALESCE(SUM(byte_total), 0) as total_byte_sales,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date >= ${startDate} AND date <= ${endDate} AND payment_method != 'efectivo'), 0) as total_bank_expenses,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date >= ${startDate} AND date <= ${endDate} AND payment_method = 'efectivo'), 0) as total_cash_expenses,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date >= ${startDate} AND date <= ${endDate}), 0) as total_expenses,
      COALESCE(SUM(byte_cash_physical), 0) as total_cash_income
    FROM daily_records
    WHERE date >= ${startDate} AND date <= ${endDate}
  `);

  // First and last bank balance in range
  const firstBalance = await db.execute(sql`
    SELECT bank_balance_real FROM daily_records
    WHERE bank_balance_real IS NOT NULL AND date <= ${startDate}
    ORDER BY date DESC LIMIT 1
  `);
  const lastBalance = await db.execute(sql`
    SELECT bank_balance_real, date FROM daily_records
    WHERE bank_balance_real IS NOT NULL AND date <= ${endDate}
    ORDER BY date DESC LIMIT 1
  `);

  return {
    daily: daily.rows,
    totals: totals.rows[0],
    balanceStart: firstBalance.rows[0] ? parseFloat(firstBalance.rows[0].bank_balance_real as string) : 0,
    balanceEnd: lastBalance.rows[0] ? parseFloat(lastBalance.rows[0].bank_balance_real as string) : 0,
    balanceEndDate: lastBalance.rows[0]?.date as string || null,
  };
}
