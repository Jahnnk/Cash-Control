"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Datos consolidados para la vista /grupo/dashboard.
 *
 * Convenciones:
 * - Saldo BCP por negocio = método híbrido (último anchor + flujo).
 *   Reusamos la misma fórmula que getUnifiedBankBalance() pero ejecutada
 *   3 veces (una por negocio) y agregada.
 * - Ingresos del mes = SUM(bank_income_items.amount) por negocio.
 * - Gastos del mes = SUM(expenses) por negocio. **Para evitar contar
 *   doble los gastos compartidos**, se usa atelier_amount cuando
 *   is_shared=true; el lado Fonavi de la regla aún no genera fila
 *   propia en su tabla (CAMBIO 7.5 pendiente).
 */
export type BusinessSummary = {
  businessId: number;
  code: string;
  name: string;
  bankBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  margin: number;
};

export async function getGroupDashboard(monthInput?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.substring(0, 7);
  const month = monthInput && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput) ? monthInput : currentMonth;
  const startOfMonth = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const endOfMonth = `${month}-${String(lastDay).padStart(2, "0")}`;
  const isCurrentMonth = month === currentMonth;
  const monthEndDate = isCurrentMonth ? today : endOfMonth;

  const businesses = await db.execute(sql`
    SELECT id, code, name FROM businesses WHERE active = true ORDER BY id
  `);

  const summaries: BusinessSummary[] = [];
  for (const b of businesses.rows as Array<{ id: number; code: string; name: string }>) {
    // Saldo BCP — método híbrido por negocio
    const anchorRes = await db.execute(sql`
      SELECT bank_balance_real, date FROM daily_records
      WHERE business_id = ${b.id} AND bank_balance_real IS NOT NULL AND date <= ${today}
      ORDER BY date DESC LIMIT 1
    `);
    let bankBalance = 0;
    if (anchorRes.rows[0]) {
      const anchor = parseFloat(anchorRes.rows[0].bank_balance_real as string);
      const anchorDate = anchorRes.rows[0].date as string;
      const incRes = await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0) AS t FROM bank_income_items
        WHERE business_id = ${b.id} AND date > ${anchorDate} AND date <= ${today}
      `);
      const expRes = await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0) AS t FROM expenses
        WHERE business_id = ${b.id} AND date > ${anchorDate} AND date <= ${today} AND payment_method != 'efectivo'
      `);
      bankBalance = Math.round((anchor + parseFloat(incRes.rows[0].t as string) - parseFloat(expRes.rows[0].t as string)) * 100) / 100;
    }

    // Ingresos del mes (operativos: excluye reembolsos Fonavi)
    const incomeRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) AS t FROM bank_income_items
      WHERE business_id = ${b.id} AND date >= ${startOfMonth} AND date <= ${monthEndDate} AND is_fonavi_reimbursement = false
    `);
    const monthlyIncome = parseFloat(incomeRes.rows[0].t as string);

    // Gastos del mes — atelier_amount cuando es compartido (no contar la parte Fonavi)
    const expRes = await db.execute(sql`
      SELECT COALESCE(SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END), 0) AS t
      FROM expenses
      WHERE business_id = ${b.id} AND date >= ${startOfMonth} AND date <= ${monthEndDate}
    `);
    const monthlyExpenses = parseFloat(expRes.rows[0].t as string);

    summaries.push({
      businessId: b.id,
      code: b.code,
      name: b.name,
      bankBalance,
      monthlyIncome,
      monthlyExpenses,
      margin: monthlyIncome - monthlyExpenses,
    });
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      bankBalance: acc.bankBalance + s.bankBalance,
      monthlyIncome: acc.monthlyIncome + s.monthlyIncome,
      monthlyExpenses: acc.monthlyExpenses + s.monthlyExpenses,
      margin: acc.margin + s.margin,
    }),
    { bankBalance: 0, monthlyIncome: 0, monthlyExpenses: 0, margin: 0 }
  );

  return {
    selectedMonth: month,
    currentMonth,
    isCurrentMonth,
    summaries,
    totals,
  };
}
