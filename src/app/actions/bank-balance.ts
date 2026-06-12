"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { activeBusinessId } from "@/lib/active-business";

export type BankBalanceSnapshot = {
  /** Saldo BCP HOY calculado dinámicamente (anchor + flujo posterior). */
  current: number;
  /** Timestamp ISO de cuándo se calculó este snapshot. */
  asOf: string;
  /** Última fecha con saldo bancario explícito guardado. */
  anchorDate: string | null;
  /** False si no hay ningún saldo registrado en daily_records. */
  hasAnchor: boolean;
  /** True si se detectó al menos una fila donde el saldo registrado
   *  diverge del esperado por la cadena (saldo previo + ingresos − egresos banco). */
  hasDiscrepancy: boolean;
  /** Fecha de la primera discrepancia detectada (la más antigua). */
  discrepancyDate: string | null;
  /** Diferencia (registrado − esperado) en la fecha de discrepancia. */
  discrepancyAmount: number | null;
};

const DISCREPANCY_TOLERANCE = 1; // S/1 — bajo este umbral consideramos cuadre.

/**
 * Único punto de verdad del saldo BCP. Lo consumen Dashboard, Registro y
 * Reportes/Conciliación a través del hook useBankBalance().
 *
 * "current" usa el método híbrido: último anchor manual + flujo de
 * ingresos/egresos bancarios posteriores hasta hoy. Esto evita que el
 * saldo "envejezca" si pasan días sin registrar el saldo del banco.
 *
 * "hasDiscrepancy" recorre los días con saldo registrado y compara cada
 * uno contra el saldo previo + bank_income − bank_expense (no efectivo).
 * Si alguna fila diverge en más de DISCREPANCY_TOLERANCE, marca el flag
 * con la fecha más antigua afectada.
 */
export async function getUnifiedBankBalance(): Promise<BankBalanceSnapshot> {
  const bId = await activeBusinessId();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const asOf = new Date().toISOString();

  // ── 0. Configuración inicial post-reset (Fonavi/Centro). Si el negocio
  // tiene system_start_date, los movimientos pre-reset están archivados
  // y el saldo inicial se inyecta como anchor virtual. Atelier no tiene
  // system_start_date — comportamiento legacy intacto.
  const cfgRes = await db.execute(sql`
    SELECT system_start_date::text AS start, initial_bcp_balance::float AS init_bcp,
           initial_balance_date::text AS init_date
    FROM businesses WHERE id = ${bId}
  `);
  const cfg = cfgRes.rows[0] as
    | { start: string | null; init_bcp: number; init_date: string | null }
    | undefined;
  const hasReset = !!(cfg?.start);

  // ── 1. Anchor: último saldo guardado ≤ hoy en filas NO archivadas
  const anchorRes = await db.execute(sql`
    SELECT bank_balance_real, date FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND date <= ${today}
      AND archived = false
    ORDER BY date DESC LIMIT 1
  `);

  let anchorBalance: number;
  let anchorDate: string;
  let hasAnchor: boolean;

  if (anchorRes.rows[0]) {
    anchorBalance = parseFloat(anchorRes.rows[0].bank_balance_real as string);
    anchorDate = anchorRes.rows[0].date as string;
    hasAnchor = true;
  } else if (hasReset && cfg?.init_date) {
    // Sin anchor real pero con config inicial: usar saldo inicial como anchor virtual.
    anchorBalance = cfg.init_bcp ?? 0;
    anchorDate = cfg.init_date;
    hasAnchor = true;
  } else {
    return {
      current: 0,
      asOf,
      anchorDate: null,
      hasAnchor: false,
      hasDiscrepancy: false,
      discrepancyDate: null,
      discrepancyAmount: null,
    };
  }

  // ── 2. Flujo bancario posterior al anchor hasta hoy (no archivado)
  const incRes = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM bank_income_items
    WHERE business_id = ${bId} AND date > ${anchorDate} AND date <= ${today}
      AND (is_special_loan = false OR loan_via_bank = true) AND payment_method <> 'efectivo' AND archived = false
  `);
  const expRes = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
    WHERE business_id = ${bId} AND date > ${anchorDate} AND date <= ${today}
      AND payment_method NOT IN ('efectivo','pendiente_atelier')
      AND (is_special_loan = false OR loan_via_bank = true) AND archived = false
  `);

  const incomePost = parseFloat(incRes.rows[0].total as string);
  const expensePost = parseFloat(expRes.rows[0].total as string);
  const current = Math.round((anchorBalance + incomePost - expensePost) * 100) / 100;

  // ── 3. Detección de discrepancia: cadena de saldos diarios
  // Para cada día con saldo registrado (excepto el primero), comparamos:
  //   esperado = saldo_dia_previo + bank_income(dia_actual) − bank_expense_no_efectivo(dia_actual)
  //   diff = registrado − esperado
  // Si |diff| ≥ tolerance, es discrepancia.
  const chainRes = await db.execute(sql`
    WITH days_with_balance AS (
      SELECT date, bank_balance_real::numeric AS balance
      FROM daily_records
      WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND archived = false
      ORDER BY date
    ),
    chain AS (
      SELECT
        date,
        balance,
        LAG(balance) OVER (ORDER BY date) AS prev_balance,
        LAG(date) OVER (ORDER BY date) AS prev_date
      FROM days_with_balance
    ),
    daily_inflow AS (
      SELECT date, COALESCE(SUM(amount), 0) AS inflow
      FROM bank_income_items
      WHERE business_id = ${bId} AND (is_special_loan = false OR loan_via_bank = true) AND payment_method <> 'efectivo' AND archived = false
      GROUP BY date
    ),
    daily_outflow AS (
      SELECT date, COALESCE(SUM(amount), 0) AS outflow
      FROM expenses
      WHERE business_id = ${bId} AND payment_method NOT IN ('efectivo','pendiente_atelier') AND (is_special_loan = false OR loan_via_bank = true) AND archived = false
      GROUP BY date
    )
    SELECT
      c.date,
      c.balance,
      c.prev_balance,
      COALESCE(i.inflow, 0) AS inflow,
      COALESCE(o.outflow, 0) AS outflow,
      (c.balance - (c.prev_balance + COALESCE(i.inflow, 0) - COALESCE(o.outflow, 0))) AS diff
    FROM chain c
    LEFT JOIN daily_inflow i ON i.date = c.date
    LEFT JOIN daily_outflow o ON o.date = c.date
    WHERE c.prev_balance IS NOT NULL
      AND ABS(c.balance - (c.prev_balance + COALESCE(i.inflow, 0) - COALESCE(o.outflow, 0))) >= ${DISCREPANCY_TOLERANCE}
    ORDER BY c.date ASC
    LIMIT 1
  `);

  if (chainRes.rows[0]) {
    const row = chainRes.rows[0];
    return {
      current,
      asOf,
      anchorDate,
      hasAnchor,
      hasDiscrepancy: true,
      discrepancyDate: row.date as string,
      discrepancyAmount: Math.round(parseFloat(row.diff as string) * 100) / 100,
    };
  }

  return {
    current,
    asOf,
    anchorDate,
    hasAnchor,
    hasDiscrepancy: false,
    discrepancyDate: null,
    discrepancyAmount: null,
  };
}

export type CashBalanceSnapshot = {
  /** Saldo de caja física en efectivo del negocio activo, acumulado histórico. */
  current: number;
  /** Timestamp ISO de cuándo se calculó. */
  asOf: string;
};

/**
 * Saldo de caja física en efectivo del negocio activo.
 * = SUM(bank_income_items.amount WHERE payment_method='efectivo')
 * − SUM(expenses.amount         WHERE payment_method='efectivo')
 *
 * IMPORTANTE: NO excluye is_special_loan=true. Los préstamos del socio
 * entregados en efectivo y las devoluciones en efectivo SON flujos de
 * caja física real (entra/sale dinero de la caja), aunque no formen
 * parte del resultado operativo. Diferencia con el saldo BCP:
 *   - saldo BCP: solo flujos operativos (excluye préstamos socio).
 *   - saldo efectivo: TODA la caja física, sin distinguir si es
 *     operativo o préstamo, porque el dinero físico no distingue.
 *
 * No usa daily_records — va directo a las tablas fuente.
 */
export async function getCashBalance(): Promise<CashBalanceSnapshot> {
  const bId = await activeBusinessId();
  const asOf = new Date().toISOString();

  // Saldo inicial post-reset (Fonavi/Centro). Atelier no tiene config inicial.
  const cfgRes = await db.execute(sql`
    SELECT initial_cash_balance::float AS init FROM businesses WHERE id = ${bId}
  `);
  const initialCash = (cfgRes.rows[0] as { init: number } | undefined)?.init ?? 0;

  const incRes = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM bank_income_items
    WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false
  `);
  const expRes = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
    WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false
  `);

  const income = parseFloat(incRes.rows[0].total as string);
  const expense = parseFloat(expRes.rows[0].total as string);
  const current = Math.round((initialCash + income - expense) * 100) / 100;

  return { current, asOf };
}
