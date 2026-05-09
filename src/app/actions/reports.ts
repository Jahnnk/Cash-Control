"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { activeBusinessId } from "@/lib/active-business";

export async function getWeeklyReport(startDate: string, endDate: string) {
  const bId = await activeBusinessId();
  const dailySummary = await db.execute(sql`
    WITH dates AS (
      SELECT generate_series(${startDate}::date, ${endDate}::date, '1 day')::date as date
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
      COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND date = d.date AND archived = false), 0) as expenses_total
    FROM dates d
    LEFT JOIN daily_records dr ON dr.date = d.date AND dr.business_id = ${bId}
    ORDER BY d.date ASC
  `);
  return dailySummary.rows;
}

export async function getMonthlyReport(month: string) {
  const bId = await activeBusinessId();
  const startDate = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const totals = await db.execute(sql`
    SELECT
      -- Ventas Byte: suma daily_records.byte_total (Atelier B2B) +
      -- bank_income_items con is_byte_sale=true (Fonavi/Centro B2C).
      -- En Atelier no hay rows con is_byte_sale=true; en Fonavi/Centro
      -- byte_total siempre es 0 → no hay doble conteo posible.
      (
        COALESCE((SELECT SUM(byte_total) FROM daily_records
          WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate} AND archived = false), 0)
        +
        COALESCE((SELECT SUM(amount) FROM bank_income_items
          WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
            AND is_byte_sale = true AND archived = false), 0)
      ) as total_byte,
      -- Ingresos BCP: excluye ventas Byte (ya contadas arriba) para no
      -- doble-contar en el reporte.
      COALESCE((
        SELECT SUM(amount) FROM bank_income_items
        WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
          AND is_fonavi_reimbursement = false AND is_special_loan = false
          AND is_internal_transfer = false AND is_byte_sale = false AND archived = false
      ), 0) as total_income,
      COALESCE((SELECT SUM(bank_expense) FROM daily_records
        WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate} AND archived = false), 0) as total_bank_expense,
      COALESCE((
        SELECT SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)
        FROM expenses WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate} AND is_special_loan = false AND is_internal_transfer = false AND archived = false
      ), 0) as total_expenses,
      COALESCE((
        SELECT SUM(amount) FROM bank_income_items
        WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate} AND is_fonavi_reimbursement = true
      ), 0) as total_fonavi_reimbursements
  `);

  const bankStart = await db.execute(sql`
    SELECT bank_balance_real FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND date <= ${startDate}
    ORDER BY date DESC LIMIT 1
  `);
  const bankEnd = await db.execute(sql`
    SELECT bank_balance_real FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND date <= ${endDate}
    ORDER BY date DESC LIMIT 1
  `);

  const byCategory = await db.execute(sql`
    SELECT category, SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END) as total
    FROM expenses
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate} AND is_special_loan = false AND is_internal_transfer = false AND archived = false
    GROUP BY category
    ORDER BY total DESC
  `);

  return {
    totals: totals.rows[0],
    bankStartBalance: bankStart.rows[0] ? parseFloat(bankStart.rows[0].bank_balance_real as string) : 0,
    bankEndBalance: bankEnd.rows[0] ? parseFloat(bankEnd.rows[0].bank_balance_real as string) : 0,
    byCategory: byCategory.rows,
  };
}

export type DailyBreakdownResult =
  | { format: "byte_atelier"; rows: Record<string, unknown>[] }
  | { format: "byte_b2c"; rows: Record<string, unknown>[] }
  | { format: "income"; rows: Record<string, unknown>[] }
  | { format: "expense"; rows: Record<string, unknown>[] };

export async function getDailyBreakdown(
  month: string,
  type: "byte" | "income" | "expense"
): Promise<DailyBreakdownResult> {
  const bId = await activeBusinessId();
  const startDate = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  if (type === "byte") {
    // ¿Hay ventas Byte B2C en el mes (Fonavi/Centro)?
    const b2cCheck = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM bank_income_items
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
        AND is_byte_sale = true AND archived = false
    `);
    const hasB2C = ((b2cCheck.rows[0] as { n: number } | undefined)?.n ?? 0) > 0;

    if (hasB2C) {
      // Formato B2C: agregado por fecha + breakdown por payment_method.
      const result = await db.execute(sql`
        SELECT
          date::text AS date,
          SUM(amount)::float AS total_dia,
          COALESCE(SUM(amount) FILTER (WHERE payment_method = 'efectivo'), 0)::float   AS efectivo,
          COALESCE(SUM(amount) FILTER (WHERE payment_method = 'yape_plin'), 0)::float  AS yape_plin,
          COALESCE(SUM(amount) FILTER (WHERE payment_method = 'pos'), 0)::float        AS pos,
          COALESCE(SUM(amount) FILTER (WHERE payment_method = 'transferencia'), 0)::float AS transferencia,
          COALESCE(SUM(amount) FILTER (WHERE payment_method NOT IN ('efectivo','yape_plin','pos','transferencia')), 0)::float AS otros
        FROM bank_income_items
        WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
          AND is_byte_sale = true AND archived = false
        GROUP BY date
        ORDER BY date ASC
      `);
      return { format: "byte_b2c", rows: result.rows };
    }

    // Atelier B2B legacy
    const result = await db.execute(sql`
      SELECT date, byte_total, byte_credit_day, byte_cash_sale,
        COALESCE(byte_cash_physical, 0) as byte_cash_physical,
        COALESCE(byte_digital, 0) as byte_digital
      FROM daily_records
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
        AND COALESCE(byte_total, 0) > 0 AND archived = false
      ORDER BY date ASC
    `);
    return { format: "byte_atelier", rows: result.rows };
  } else if (type === "income") {
    // Excluye Byte para que el desglose de "Ingresos BCP" no incluya ventas
    // (las ventas tienen su propio card "Ventas Byte" con desglose).
    const result = await db.execute(sql`
      SELECT bi.id, bi.date, bi.amount, bi.note, bi.client_id, c.name as client_name
      FROM bank_income_items bi
      LEFT JOIN clients c ON c.id = bi.client_id
      WHERE bi.business_id = ${bId} AND bi.date >= ${startDate} AND bi.date <= ${endDate}
        AND bi.is_special_loan = false AND bi.is_internal_transfer = false
        AND bi.is_byte_sale = false AND bi.archived = false
      ORDER BY bi.date DESC, bi.sort_order ASC
    `);
    return { format: "income", rows: result.rows };
  } else {
    const result = await db.execute(sql`
      SELECT id, date, amount, category, concept, notes, payment_method
      FROM expenses
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate} AND is_special_loan = false AND is_internal_transfer = false AND archived = false
      ORDER BY date DESC, amount DESC
    `);
    return { format: "expense", rows: result.rows };
  }
}
