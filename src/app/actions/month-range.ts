"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { activeBusinessId } from "@/lib/active-business";

const MIN_RANGE_MONTHS = 6;
const FUTURE_MONTHS = 3;

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(min: string, max: string): number {
  const [y1, m1] = min.split("-").map(Number);
  const [y2, m2] = max.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

/**
 * Rango de meses navegable, único punto de verdad para los selectores
 * de mes en Dashboard, Reportes Mensual y Presupuesto.
 *
 * - minMonth = primer mes con data en daily_records o expenses.
 *              Si no hay data, vale currentMonth.
 * - maxMonth = currentMonth + 3 meses (para planificar futuro).
 * - Si el rango resulta menor a 6 meses, se amplía minMonth hacia
 *   atrás hasta completar 6 meses (asegura algo útil para navegar).
 */
export async function getAvailableMonthRange(): Promise<{
  minMonth: string;
  maxMonth: string;
  currentMonth: string;
}> {
  const bId = await activeBusinessId();
  const today = new Date().toISOString().split("T")[0];
  const currentMonth = today.substring(0, 7);

  const res = await db.execute(sql`
    SELECT TO_CHAR(MIN(date), 'YYYY-MM') AS first_month
    FROM (
      SELECT date FROM daily_records WHERE business_id = ${bId}
      UNION ALL
      SELECT date FROM expenses WHERE business_id = ${bId}
    ) all_dates
  `);
  const firstWithData =
    (res.rows[0]?.first_month as string | null) ?? currentMonth;

  const maxMonth = shiftMonth(currentMonth, FUTURE_MONTHS);

  let minMonth = firstWithData;
  while (monthsBetween(minMonth, maxMonth) < MIN_RANGE_MONTHS) {
    minMonth = shiftMonth(minMonth, -1);
  }

  return { minMonth, maxMonth, currentMonth };
}
