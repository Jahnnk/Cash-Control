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

  // ¿Hay datos importados en byte_sales_daily? Si sí, esa es la fuente
  // de verdad (ventas brutas de Control de VTAS). Si no, fallback al
  // cálculo legacy (cobros: byte_total Atelier + is_byte_sale=true B2C).
  const byteDailyExists = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM byte_sales_daily
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
  `)).rows[0] as { n: number };
  const byteSalesSource: "byte_sales_daily" | "legacy" =
    byteDailyExists.n > 0 ? "byte_sales_daily" : "legacy";

  const totals = await db.execute(sql`
    SELECT
      -- Ventas Byte: si hay byte_sales_daily, usa esa fuente (ventas
      -- brutas). Si no, fallback legacy (cobros).
      CASE WHEN ${byteSalesSource === "byte_sales_daily"} THEN
        COALESCE((SELECT SUM(efectivo + yape_plin + pos) FROM byte_sales_daily
          WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}), 0)
      ELSE
        (
          COALESCE((SELECT SUM(byte_total) FROM daily_records
            WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate} AND archived = false), 0)
          +
          COALESCE((SELECT SUM(amount) FROM bank_income_items
            WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
              AND is_byte_sale = true AND archived = false), 0)
        )
      END as total_byte,
      -- Ingresos Ctas. y Efectivo: TOTAL de movimientos a CTA CTE y
      -- caja del mes (J274 del Excel Ing&Gtos). NO filtra is_byte_sale
      -- — incluye tanto los cobros de Byte que entraron al banco como
      -- las devoluciones/sobrantes/reembolsos. Se compara CONTRA
      -- total_byte para conciliar (la diferencia = créditos pendientes
      -- + ajustes). Nombre SQL legacy (total_income) preservado para
      -- no romper consumidores y exports históricos.
      -- Atelier no tiene filas con is_byte_sale=true, así que el cambio
      -- de semántica solo afecta a Centro/Fonavi (Prompt 23).
      COALESCE((
        SELECT SUM(amount) FROM bank_income_items
        WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
          AND is_fonavi_reimbursement = false AND is_special_loan = false
          AND is_internal_transfer = false AND archived = false
          AND non_operative_category IS NULL
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

  // Variación saldo banco calculada por flujo BCP del mes (NO por
  // diff de bank_balance_real, que requiere registro manual diario
  // y queda S/0 si Kelly no lo lleva — bug histórico que afectaba
  // a Centro/Fonavi). "BCP" = todo lo que NO sea efectivo:
  // transferencia + pos + yape_plin van al banco; efectivo va a
  // caja física. Excluye special_loan e internal_transfer porque
  // no son flujo operativo del banco.
  // Ventas a crédito pendientes del mes: las captura el parser de
  // Control de VTAS en tips_pending con source_concept='Ventas al
  // Crédito' (decisión histórica del modelo de datos). Sumamos solo
  // las imported_from_excel para evitar contar propinas asignadas
  // manualmente. El monto es el que llegó a Cuentas (col G del
  // Excel) — la diferencia con QuipuPOS (col E) representa propinas
  // del cobrador y NO se modela actualmente.
  const creditSales = await db.execute(sql`
    SELECT COALESCE(SUM(amount),0)::float AS total
    FROM tips_pending
    WHERE business_id = ${bId}
      AND date BETWEEN ${startDate} AND ${endDate}
      AND source_concept IN ('Ventas al Crédito', 'Ventas al Credito')
      AND imported_from_excel = true
  `);
  const totalCreditSales = Number(
    (creditSales.rows[0] as { total: number }).total ?? 0,
  );

  const bcpFlow = await db.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(amount),0)::float FROM bank_income_items
       WHERE business_id = ${bId} AND archived = false
         AND date BETWEEN ${startDate} AND ${endDate}
         AND payment_method != 'efectivo'
         AND is_special_loan = false AND is_internal_transfer = false
      ) AS ingresos_bcp,
      (SELECT COALESCE(SUM(amount),0)::float FROM expenses
       WHERE business_id = ${bId} AND archived = false
         AND date BETWEEN ${startDate} AND ${endDate}
         AND payment_method != 'efectivo'
         AND is_special_loan = false AND is_internal_transfer = false
      ) AS egresos_bcp
  `);
  const bcpRow = bcpFlow.rows[0] as { ingresos_bcp: number; egresos_bcp: number };
  const bankIngresosBcp = Number(bcpRow.ingresos_bcp ?? 0);
  const bankEgresosBcp = Number(bcpRow.egresos_bcp ?? 0);
  const bankVariation = bankIngresosBcp - bankEgresosBcp;

  const byCategory = await db.execute(sql`
    SELECT category, SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END) as total
    FROM expenses
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate} AND is_special_loan = false AND is_internal_transfer = false AND archived = false
    GROUP BY category
    ORDER BY total DESC
  `);

  // Total ingresos del mes = Ventas Byte + Otros ingresos (no-ventas).
  // Se calcula acá (no en cliente) para que el componente reciba el
  // valor ya listo y los reportes/exports lo puedan consumir igual.
  const totalsRow = totals.rows[0] as Record<string, unknown>;
  const totalByteNum = parseFloat((totalsRow.total_byte as string) || "0");
  const totalIncomeNum = parseFloat((totalsRow.total_income as string) || "0");
  const totalIngresosDelMes = totalByteNum + totalIncomeNum;

  // Total Byte reportado por POS (Prompt 24). Solo aplicable cuando
  // hay datos en byte_sales_daily (Centro/Fonavi con Control de VTAS
  // importado). Si total_pos_excel está NULL en TODOS los días del mes
  // (re-import pendiente), devolvemos null y la UI hace fallback al
  // valor "Cobradas" tradicional sin desglose.
  let totalBytePos: number | null = null;
  if (byteSalesSource === "byte_sales_daily") {
    const tposRow = (await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE total_pos_excel IS NOT NULL)::int AS with_pos,
        COUNT(*)::int AS total_rows,
        COALESCE(SUM(total_pos_excel),0)::float AS sum_pos
      FROM byte_sales_daily
      WHERE business_id = ${bId} AND date BETWEEN ${startDate} AND ${endDate}
    `)).rows[0] as { with_pos: number; total_rows: number; sum_pos: number };
    // Solo exponemos total_byte_pos si TODOS los días tienen el valor.
    // Mezcla parcial daría números engañosos.
    if (tposRow.with_pos > 0 && tposRow.with_pos === tposRow.total_rows) {
      totalBytePos = Number(tposRow.sum_pos);
    }
  }

  return {
    totals: {
      ...totalsRow,
      total_ingresos_del_mes: totalIngresosDelMes,
      total_credit_sales: totalCreditSales,
      total_byte_pos: totalBytePos,  // null si no aplica (Atelier legacy / re-import pendiente)
    },
    bankStartBalance: bankStart.rows[0] ? parseFloat(bankStart.rows[0].bank_balance_real as string) : 0,
    bankEndBalance: bankEnd.rows[0] ? parseFloat(bankEnd.rows[0].bank_balance_real as string) : 0,
    bankIngresosBcp,    // flujo BCP del mes (excluye efectivo)
    bankEgresosBcp,
    bankVariation,      // = bankIngresosBcp - bankEgresosBcp
    byCategory: byCategory.rows,
    byteSalesSource, // "byte_sales_daily" (ventas brutas) | "legacy" (cobros)
  };
}

export type DailyBreakdownResult =
  | { format: "byte_daily"; rows: Record<string, unknown>[] }
  | { format: "byte_atelier"; rows: Record<string, unknown>[] }
  | { format: "byte_b2c"; rows: Record<string, unknown>[] }
  | { format: "income"; rows: Record<string, unknown>[] }
  | { format: "expense"; rows: Record<string, unknown>[] }
  | { format: "total_income"; rows: Record<string, unknown>[] }
  | { format: "bank_variation"; rows: Record<string, unknown>[] }
  | { format: "credit_sales"; rows: Record<string, unknown>[] };

export async function getDailyBreakdown(
  month: string,
  type: "byte" | "income" | "expense" | "total_income" | "bank_variation" | "credit_sales"
): Promise<DailyBreakdownResult> {
  const bId = await activeBusinessId();
  const startDate = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  if (type === "byte") {
    // PRIORIDAD 1: byte_sales_daily (Control de VTAS importado)
    const dailyCheck = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM byte_sales_daily
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
    `);
    if (((dailyCheck.rows[0] as { n: number } | undefined)?.n ?? 0) > 0) {
      // Devolvemos `transferencia: 0` explícito porque byte_sales_daily
      // no la modela (Control de VTAS solo trae Efectivo/Yape/POS), pero
      // el cliente comparte la tabla del formato byte_b2c que sí espera
      // esa columna. Sin el 0 explícito, formatCurrency(undefined)
      // crasheaba el render.
      const result = await db.execute(sql`
        SELECT date::text AS date,
               efectivo::float AS efectivo,
               yape_plin::float AS yape_plin,
               pos::float AS pos,
               0::float AS transferencia,
               total::float AS total_dia
        FROM byte_sales_daily
        WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
        ORDER BY date ASC
      `);
      return { format: "byte_daily", rows: result.rows };
    }

    // PRIORIDAD 2: bank_income_items con is_byte_sale=true (Fonavi/Centro pre-Control de VTAS)
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
    // Drilldown del card "Ingresos Ctas. y Efectivo": muestra TODAS las
    // filas (cobros Byte + devoluciones + sobrantes), porque el card
    // ahora suma el TOTAL del mes — no solo no-ventas. Se excluyen
    // transferencias internas, préstamos especiales, reembolsos Fonavi
    // e ingresos no operativos (no son flujo operativo; igual que el
    // card total_income). is_byte_sale ya NO se filtra.
    // Atelier: 0 filas con is_byte_sale=true así que el cambio solo
    // afecta a Centro/Fonavi visualmente.
    const result = await db.execute(sql`
      SELECT bi.id, bi.date, bi.amount, bi.note, bi.client_id, c.name as client_name,
             bi.is_byte_sale, bi.payment_method,
             bi.bcp_verified_at::text AS bcp_verified_at
      FROM bank_income_items bi
      LEFT JOIN clients c ON c.id = bi.client_id
      WHERE bi.business_id = ${bId} AND bi.date >= ${startDate} AND bi.date <= ${endDate}
        AND bi.is_special_loan = false AND bi.is_internal_transfer = false
        AND bi.is_fonavi_reimbursement = false AND bi.archived = false
        AND bi.non_operative_category IS NULL
      ORDER BY bi.date DESC, bi.sort_order ASC
    `);
    return { format: "income", rows: result.rows };
  } else if (type === "total_income") {
    // Drilldown del card "Total ingresos del mes": por día, suma de
    // Ventas Byte + Otros ingresos. Sigue la misma prioridad que el
    // card principal: byte_sales_daily si hay datos, fallback legacy
    // (daily_records.byte_total + bank_income_items con is_byte_sale)
    // si no hay nada en byte_sales_daily.
    const dailyCheck = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM byte_sales_daily
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
    `);
    const useByteDaily = ((dailyCheck.rows[0] as { n: number } | undefined)?.n ?? 0) > 0;

    const result = await db.execute(sql`
      WITH dates AS (
        SELECT generate_series(${startDate}::date, ${endDate}::date, '1 day')::date AS date
      ),
      byte_per_day AS (
        ${useByteDaily ? sql`
          SELECT date, (efectivo + yape_plin + pos)::float AS total
          FROM byte_sales_daily
          WHERE business_id = ${bId} AND date BETWEEN ${startDate} AND ${endDate}
        ` : sql`
          SELECT d.date,
            (
              COALESCE((SELECT byte_total FROM daily_records dr
                WHERE dr.business_id = ${bId} AND dr.date = d.date AND dr.archived = false), 0)
              +
              COALESCE((SELECT SUM(amount) FROM bank_income_items
                WHERE business_id = ${bId} AND date = d.date
                  AND is_byte_sale = true AND archived = false), 0)
            )::float AS total
          FROM dates d
        `}
      ),
      otros_per_day AS (
        SELECT date, COALESCE(SUM(amount),0)::float AS total
        FROM bank_income_items
        WHERE business_id = ${bId} AND date BETWEEN ${startDate} AND ${endDate}
          AND is_byte_sale = false AND is_special_loan = false
          AND is_internal_transfer = false AND is_fonavi_reimbursement = false
          AND archived = false AND non_operative_category IS NULL
        GROUP BY date
      )
      SELECT d.date::text AS date,
             COALESCE(bp.total, 0)::float AS ventas_byte,
             COALESCE(op.total, 0)::float AS otros_ingresos,
             (COALESCE(bp.total,0) + COALESCE(op.total,0))::float AS total_dia
      FROM dates d
      LEFT JOIN byte_per_day bp ON bp.date = d.date
      LEFT JOIN otros_per_day op ON op.date = d.date
      WHERE COALESCE(bp.total,0) + COALESCE(op.total,0) > 0
      ORDER BY d.date DESC
    `);
    return { format: "total_income", rows: result.rows };
  } else if (type === "bank_variation") {
    // Drilldown del card "Variación saldo banco": por día, ingresos
    // BCP - egresos BCP. "BCP" = todo lo que NO sea efectivo. Filas
    // con 0/0/0 se omiten.
    const result = await db.execute(sql`
      WITH dates AS (
        SELECT generate_series(${startDate}::date, ${endDate}::date, '1 day')::date AS date
      ),
      ing AS (
        SELECT date, COALESCE(SUM(amount),0)::float AS total
        FROM bank_income_items
        WHERE business_id = ${bId} AND date BETWEEN ${startDate} AND ${endDate}
          AND payment_method != 'efectivo'
          AND is_special_loan = false AND is_internal_transfer = false
          AND archived = false
        GROUP BY date
      ),
      egr AS (
        SELECT date, COALESCE(SUM(amount),0)::float AS total
        FROM expenses
        WHERE business_id = ${bId} AND date BETWEEN ${startDate} AND ${endDate}
          AND payment_method != 'efectivo'
          AND is_special_loan = false AND is_internal_transfer = false
          AND archived = false
        GROUP BY date
      )
      SELECT d.date::text AS date,
             COALESCE(ing.total, 0)::float AS ingresos_bcp,
             COALESCE(egr.total, 0)::float AS egresos_bcp,
             (COALESCE(ing.total,0) - COALESCE(egr.total,0))::float AS variacion_dia
      FROM dates d
      LEFT JOIN ing ON ing.date = d.date
      LEFT JOIN egr ON egr.date = d.date
      WHERE COALESCE(ing.total,0) > 0 OR COALESCE(egr.total,0) > 0
      ORDER BY d.date DESC
    `);
    return { format: "bank_variation", rows: result.rows };
  } else if (type === "credit_sales") {
    // Drilldown del card "Ventas a crédito": filas individuales de
    // tips_pending con source_concept='Ventas al Crédito' importadas
    // del Excel. Una fila por entrada del Excel (puede haber varias
    // por día). Ordenado descendente por fecha. Filas con monto = 0
    // se omiten por construcción (el parser no inserta importes 0).
    const result = await db.execute(sql`
      SELECT id::text, date::text, amount::float, note_text,
             source_concept, status
      FROM tips_pending
      WHERE business_id = ${bId}
        AND date BETWEEN ${startDate} AND ${endDate}
        AND source_concept IN ('Ventas al Crédito', 'Ventas al Credito')
        AND imported_from_excel = true
      ORDER BY date DESC, amount DESC
    `);
    return { format: "credit_sales", rows: result.rows };
  } else {
    const result = await db.execute(sql`
      SELECT id, date, amount, category, concept, notes, payment_method,
             bcp_verified_at::text AS bcp_verified_at,
             is_shared, shared_rule_id::text AS shared_rule_id,
             fonavi_amount::float AS fonavi_amount,
             centro_amount::float AS centro_amount,
             linked_atelier_expense_id::text AS linked_atelier_expense_id
      FROM expenses
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate} AND is_special_loan = false AND is_internal_transfer = false AND archived = false
      ORDER BY date DESC, amount DESC
    `);
    return { format: "expense", rows: result.rows };
  }
}
