"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getAvailableMonthRange } from "./month-range";

function isValidMonth(m: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

function getMonthBounds(month: string) {
  // Devuelve primer y último día del mes (YYYY-MM-DD)
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { first, last, daysInMonth: lastDay };
}

export async function getDashboardData(monthInput?: string) {
  const today = new Date().toISOString().split("T")[0];
  const currentMonth = today.substring(0, 7);

  // Valida y normaliza el mes; si es inválido, cae al actual
  const month =
    monthInput && isValidMonth(monthInput) ? monthInput : currentMonth;
  const isCurrentMonth = month === currentMonth;
  const isFuture = month > currentMonth;

  const { first: startOfMonth, last: endOfMonth, daysInMonth } =
    getMonthBounds(month);

  // En el mes actual cortamos hasta hoy; en meses pasados, hasta fin de mes
  const monthEndDate = isCurrentMonth ? today : endOfMonth;

  // ───── KPIs FIJOS (snapshot al día de hoy) ─────

  // Saldo bancario más reciente
  const bankResult = await db.execute(sql`
    SELECT bank_balance_real, date FROM daily_records
    WHERE bank_balance_real IS NOT NULL
    ORDER BY date DESC LIMIT 1
  `);
  const bankBalance = bankResult.rows[0]
    ? parseFloat(bankResult.rows[0].bank_balance_real as string)
    : 0;
  const bankDate = bankResult.rows[0]?.date as string | null;

  // Cuentas por cobrar B2B (acumulado histórico)
  const cxcResult = await db.execute(sql`
    SELECT
      COALESCE(SUM(byte_total), 0) as total_byte,
      COALESCE(SUM(bank_income), 0) as total_collected
    FROM daily_records
  `);
  const totalByte = parseFloat(cxcResult.rows[0].total_byte as string);
  const totalCollected = parseFloat(cxcResult.rows[0].total_collected as string);
  const accountsReceivable = Math.max(0, totalByte - totalCollected);

  // Por cobrar a Fonavi
  const fonaviResult = await db.execute(sql`
    SELECT COALESCE(SUM(amount_due - amount_collected), 0) as total
    FROM fonavi_receivables WHERE status != 'collected'
  `);
  const fonaviReceivables = parseFloat(fonaviResult.rows[0].total as string);

  // ───── KPIs ADAPTABLES al mes seleccionado ─────

  let monthlyExpenses = 0;
  let monthlyByte: Record<string, unknown> = {
    month_byte_total: "0",
    month_bank_income: "0",
    month_credit_day: "0",
    month_credit_collected: "0",
  };

  if (!isFuture) {
    const expResult = await db.execute(sql`
      SELECT COALESCE(SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END), 0) as total
      FROM expenses
      WHERE date >= ${startOfMonth} AND date <= ${monthEndDate}
    `);
    monthlyExpenses = parseFloat(expResult.rows[0].total as string);

    const monthlyByteRes = await db.execute(sql`
      SELECT
        COALESCE(SUM(byte_total), 0) as month_byte_total,
        COALESCE(SUM(bank_income), 0) as month_bank_income,
        COALESCE(SUM(byte_credit_day), 0) as month_credit_day,
        COALESCE(SUM(byte_credit_collected), 0) as month_credit_collected
      FROM daily_records
      WHERE date >= ${startOfMonth} AND date <= ${monthEndDate}
    `);
    monthlyByte = monthlyByteRes.rows[0] as Record<string, unknown>;
  }

  // Promedio diario y cobertura
  const daysElapsed = isCurrentMonth ? new Date().getDate() : daysInMonth;
  const avgDailyExpense = daysElapsed > 0 ? monthlyExpenses / daysElapsed : 0;
  const daysCovered =
    avgDailyExpense > 0 ? Math.floor(bankBalance / avgDailyExpense) : 999;

  // Rango navegable consistente con Reportes/Mensual y Presupuesto
  const { minMonth: firstMonth, maxMonth } = await getAvailableMonthRange();

  return {
    bankBalance,
    bankDate,
    accountsReceivable,
    monthlyExpenses,
    daysCovered,
    avgDailyExpense,
    monthlyByte,
    fonaviReceivables,
    // Metadatos del mes
    selectedMonth: month,
    currentMonth,
    isCurrentMonth,
    isPartial: isCurrentMonth,
    isFuture,
    firstMonth,
    maxMonth,
  };
}
