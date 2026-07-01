"use server";

/**
 * Panel Ejecutivo de Liquidez (sección Saldos del Dashboard).
 *
 * Junta, para el negocio activo y AL DÍA DE HOY:
 *  - Liquidez disponible (banco + caja) con serie de 14 días y variaciones
 *    vs ayer / vs hace 7 días / vs inicio de mes.
 *  - Días de cobertura (runway): liquidez / gasto operativo diario real
 *    (promedio de las 8 semanas previas al mes — misma definición que el
 *    Centro de Comando).
 *  - Confianza en los números: último cuadre contra el BCP real
 *    (bank_real_checks) + % de movimientos del mes verificados contra BCP.
 *  - Por cobrar: cuentas a los locales (con vencidas) — liquidez futura.
 *
 * Solo lectura. La serie del banco usa bank_balance_real (forward-fill de
 * días sin registro); la de caja, el acumulado de netos en efectivo.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { activeBusinessId } from "@/lib/active-business";
import { getUnifiedBankBalance, getCashBalance } from "./bank-balance";
import { getLatestBankRealCheck } from "./bank-real-checks";
import { opExpensesInRange } from "./command-center";
import {
  dateRange,
  forwardFill,
  cumulate,
  runwayDays,
  seriesDeltas,
  liquidityLevel,
  type DayPoint,
} from "@/lib/liquidity";
import { OVERDUE_DAYS } from "@/lib/decision-intelligence";

const SERIES_DAYS = 14;
/** Objetivo mínimo recomendado de cobertura (días de gasto operativo). */
const MIN_RUNWAY_DAYS = 15;

function limaToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}
function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type LiquidityPanelData = {
  today: string;
  bank: number;
  cash: number;
  liquid: number;
  deltaDay: number | null;
  deltaWeek: number | null;
  deltaMonth: number | null;   // vs liquidez al cierre del mes anterior
  series: DayPoint[];          // liquidez (banco+caja) últimos 14 días
  runway: {
    days: number | null;
    level: "verde" | "ambar" | "rojo" | "sin-datos";
    dailyExpense: number;      // gasto operativo diario (8 semanas)
    minDays: number;           // objetivo recomendado
    minSoles: number;          // objetivo en soles (minDays × diario)
  };
  trust: {
    lastCheckDate: string | null;
    lastCheckDiff: number | null;  // banco real − sistema en ese check
    hasDiscrepancy: boolean;       // inconsistencia interna de la cadena
    verifiedPct: number | null;    // % movimientos del mes verificados vs BCP
    verifiedCount: number;
    totalCount: number;
  };
  receivables: {
    total: number;
    overdue: number;
    oldestDays: number;
    byDebtor: { name: string; pending: number; oldestDays: number }[];
  } | null; // null en Fonavi/Centro (no tienen CxC a locales)
  /** Copiloto: proyección de cierre y simulaciones. */
  projection: {
    netDaily8w: number;     // (liquidez hoy − hace 56 días) / 56
    daysRemaining: number;  // días que faltan del mes (sin contar hoy)
  } | null;                 // null si no hay historial de 8 semanas
  /** ¿Por qué cambió la liquidez? Desglose de los últimos 7 días. */
  why: {
    totalIn: number;        // todo lo que entró (banco + caja)
    totalOut: number;       // todo lo que salió
    topOut: { concept: string; amount: number; date: string }[]; // top 3 salidas
  };
};

export async function getLiquidityPanel(): Promise<LiquidityPanelData> {
  const bId = await activeBusinessId();
  const today = limaToday();
  const monthStart = today.slice(0, 7) + "-01";
  const seriesStart = shiftDays(today, -(SERIES_DAYS - 1));

  const [bankSnap, cashSnap] = await Promise.all([getUnifiedBankBalance(), getCashBalance()]);

  // ── Serie del banco (forward-fill sobre bank_balance_real) ──
  const bankRows = (await db.execute(sql`
    SELECT date::text AS d, bank_balance_real::float AS b FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND archived = false
      AND date >= ${seriesStart} AND date <= ${today}
  `)).rows as { d: string; b: number }[];
  const seedRow = (await db.execute(sql`
    SELECT bank_balance_real::float AS b FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND archived = false
      AND date < ${seriesStart}
    ORDER BY date DESC LIMIT 1
  `)).rows[0] as { b: number } | undefined;

  const dates = dateRange(seriesStart, today);
  const bankSeries = forwardFill(
    dates,
    new Map(bankRows.map((r) => [r.d, Number(r.b)])),
    Number(seedRow?.b ?? 0),
  );

  // ── Serie de la caja (acumulado de netos en efectivo) ──
  const cashBaseRow = (await db.execute(sql`
    SELECT (
      COALESCE((SELECT initial_cash_balance FROM businesses WHERE id = ${bId}), 0)
      + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date < ${seriesStart}), 0)
      - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date < ${seriesStart}), 0)
    )::float AS base
  `)).rows[0] as { base: number };
  const cashNets = (await db.execute(sql`
    SELECT d::text AS d, SUM(n)::float AS n FROM (
      SELECT date AS d, amount AS n FROM bank_income_items
        WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date >= ${seriesStart} AND date <= ${today}
      UNION ALL
      SELECT date AS d, -amount AS n FROM expenses
        WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date >= ${seriesStart} AND date <= ${today}
    ) x GROUP BY d
  `)).rows as { d: string; n: number }[];
  const cashSeries = cumulate(
    dates,
    new Map(cashNets.map((r) => [r.d, Number(r.n)])),
    Number(cashBaseRow.base),
  );

  // Liquidez por día. El ÚLTIMO punto usa las fuentes canónicas en vivo
  // (getUnifiedBankBalance/getCashBalance) para que el número grande del
  // panel coincida EXACTO con el resto de la app.
  const series: DayPoint[] = dates.map((date, i) => ({
    date,
    value: Math.round((bankSeries[i] + cashSeries[i]) * 100) / 100,
  }));
  const liquid = Math.round((bankSnap.current + cashSnap.current) * 100) / 100;
  series[series.length - 1] = { date: today, value: liquid };

  const { day: deltaDay, week: deltaWeek } = seriesDeltas(series);

  // Liquidez al cierre del mes anterior (para "¿crece o baja este mes?").
  const prevMonthEnd = shiftDays(monthStart, -1);
  let deltaMonth: number | null = null;
  const bankPrevRow = (await db.execute(sql`
    SELECT bank_balance_real::float AS b FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND archived = false AND date <= ${prevMonthEnd}
    ORDER BY date DESC LIMIT 1
  `)).rows[0] as { b: number } | undefined;
  if (bankPrevRow) {
    const cashPrevRow = (await db.execute(sql`
      SELECT (
        COALESCE((SELECT initial_cash_balance FROM businesses WHERE id = ${bId}), 0)
        + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date <= ${prevMonthEnd}), 0)
        - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date <= ${prevMonthEnd}), 0)
      )::float AS c
    `)).rows[0] as { c: number };
    deltaMonth = Math.round((liquid - (Number(bankPrevRow.b) + Number(cashPrevRow.c))) * 100) / 100;
  }

  // ── Cobertura (misma definición de gasto operativo que el Centro de Comando) ──
  const [y, m] = today.split("-").map(Number);
  const ws = new Date(y, m - 1, 1);
  ws.setDate(ws.getDate() - 56);
  const we = new Date(y, m - 1, 1);
  we.setDate(we.getDate() - 1);
  const opWindow = await opExpensesInRange(
    bId,
    ws.toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
    we.toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
  );
  const dailyExpense = Math.round((opWindow / 56) * 100) / 100;
  const days = runwayDays(liquid, dailyExpense);

  // ── Confianza: último cuadre + % verificado del mes ──
  const lastCheck = await getLatestBankRealCheck().catch(() => null);
  const verifiedRow = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE bcp_verified_at IS NOT NULL)::int AS verified
    FROM (
      SELECT bcp_verified_at FROM bank_income_items
        WHERE business_id = ${bId} AND date >= ${monthStart} AND date <= ${today}
          AND payment_method <> 'efectivo' AND is_internal_transfer = false AND archived = false
          AND (is_special_loan = false OR loan_via_bank = true)
      UNION ALL
      SELECT bcp_verified_at FROM expenses
        WHERE business_id = ${bId} AND date >= ${monthStart} AND date <= ${today}
          AND payment_method NOT IN ('efectivo', 'pendiente_atelier') AND is_internal_transfer = false AND archived = false
          AND (is_special_loan = false OR loan_via_bank = true)
    ) x
  `)).rows[0] as { total: number; verified: number };

  // ── Por cobrar (solo Atelier) ──
  let receivables: LiquidityPanelData["receivables"] = null;
  if (bId === 1) {
    const rc = (await db.execute(sql`
      SELECT fr.debtor_business_id AS debtor,
             (fr.amount_due - fr.amount_collected)::float AS pending,
             (CURRENT_DATE - e.date::date)::int AS days_old
      FROM fonavi_receivables fr JOIN expenses e ON e.id = fr.expense_id
      WHERE fr.status <> 'collected'
    `)).rows as { debtor: number; pending: number; days_old: number }[];
    const byDebtor = new Map<string, { pending: number; oldestDays: number }>();
    let total = 0;
    let overdue = 0;
    let oldestDays = 0;
    for (const r of rc) {
      const name = r.debtor === 3 ? "Centro" : "Fonavi";
      const acc = byDebtor.get(name) ?? { pending: 0, oldestDays: 0 };
      acc.pending += Number(r.pending);
      acc.oldestDays = Math.max(acc.oldestDays, r.days_old);
      byDebtor.set(name, acc);
      total += Number(r.pending);
      oldestDays = Math.max(oldestDays, r.days_old);
      if (r.days_old > OVERDUE_DAYS) overdue += Number(r.pending);
    }
    receivables = {
      total: Math.round(total * 100) / 100,
      overdue: Math.round(overdue * 100) / 100,
      oldestDays,
      byDebtor: [...byDebtor.entries()].map(([name, v]) => ({
        name,
        pending: Math.round(v.pending * 100) / 100,
        oldestDays: v.oldestDays,
      })),
    };
  }

  // ── Copiloto: ritmo neto de 8 semanas (para proyectar el cierre) ──
  // Liquidez hace 56 días = último banco conocido a esa fecha + caja
  // acumulada a esa fecha. Si no hay historial tan atrás → sin proyección
  // (honesto: no se inventa un ritmo).
  const ago56 = shiftDays(today, -56);
  let projection: LiquidityPanelData["projection"] = null;
  const bank56 = (await db.execute(sql`
    SELECT bank_balance_real::float AS b FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND archived = false AND date <= ${ago56}
    ORDER BY date DESC LIMIT 1
  `)).rows[0] as { b: number } | undefined;
  if (bank56) {
    const cash56 = (await db.execute(sql`
      SELECT (
        COALESCE((SELECT initial_cash_balance FROM businesses WHERE id = ${bId}), 0)
        + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date <= ${ago56}), 0)
        - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date <= ${ago56}), 0)
      )::float AS c
    `)).rows[0] as { c: number };
    const liquid56 = Number(bank56.b) + Number(cash56.c);
    const [yy, mm, dd] = today.split("-").map(Number);
    projection = {
      netDaily8w: Math.round(((liquid - liquid56) / 56) * 100) / 100,
      daysRemaining: new Date(yy, mm, 0).getDate() - dd,
    };
  }

  // ── ¿Por qué cambió? Entradas/salidas reales de los últimos 7 días
  //    (banco + caja; excluye transferencias internas —netean a cero— y
  //    préstamos "fantasma" que no mueven cuentas). ──
  const whyStart = shiftDays(today, -6);
  const whyRow = (await db.execute(sql`
    SELECT
      COALESCE((SELECT SUM(amount) FROM bank_income_items
        WHERE business_id = ${bId} AND date >= ${whyStart} AND date <= ${today}
          AND is_internal_transfer = false AND archived = false
          AND (is_special_loan = false OR loan_via_bank = true OR payment_method = 'efectivo')), 0)::float AS total_in,
      COALESCE((SELECT SUM(amount) FROM expenses
        WHERE business_id = ${bId} AND date >= ${whyStart} AND date <= ${today}
          AND is_internal_transfer = false AND archived = false AND payment_method <> 'pendiente_atelier'
          AND (is_special_loan = false OR loan_via_bank = true OR payment_method = 'efectivo')), 0)::float AS total_out
  `)).rows[0] as { total_in: number; total_out: number };
  const topOut = (await db.execute(sql`
    SELECT concept, amount::float AS amount, date::text AS date FROM expenses
    WHERE business_id = ${bId} AND date >= ${whyStart} AND date <= ${today}
      AND is_internal_transfer = false AND archived = false AND payment_method <> 'pendiente_atelier'
      AND (is_special_loan = false OR loan_via_bank = true OR payment_method = 'efectivo')
    ORDER BY amount DESC LIMIT 3
  `)).rows as { concept: string; amount: number; date: string }[];

  return {
    today,
    bank: bankSnap.current,
    cash: cashSnap.current,
    liquid,
    deltaDay,
    deltaWeek,
    deltaMonth,
    series,
    runway: {
      days,
      level: liquidityLevel(days),
      dailyExpense,
      minDays: MIN_RUNWAY_DAYS,
      minSoles: Math.round(dailyExpense * MIN_RUNWAY_DAYS * 100) / 100,
    },
    trust: {
      lastCheckDate: lastCheck?.checkDate ?? null,
      lastCheckDiff: lastCheck ? Number(lastCheck.difference) : null,
      hasDiscrepancy: bankSnap.hasDiscrepancy,
      verifiedPct: verifiedRow.total > 0
        ? Math.round((verifiedRow.verified / verifiedRow.total) * 100)
        : null,
      verifiedCount: verifiedRow.verified,
      totalCount: verifiedRow.total,
    },
    receivables,
    projection,
    why: {
      totalIn: Math.round(Number(whyRow.total_in) * 100) / 100,
      totalOut: Math.round(Number(whyRow.total_out) * 100) / 100,
      topOut: topOut.map((t) => ({ concept: t.concept, amount: Number(t.amount), date: t.date })),
    },
  };
}
