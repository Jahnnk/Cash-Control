"use server";

/**
 * Recolector de HECHOS del Centro de Comando. Reúne las cifras del negocio
 * activo reutilizando las fuentes canónicas (saldo unificado, caja, ventas,
 * gastos operativos, presupuesto, CxC, préstamos) y las pasa por el motor
 * de Decision Intelligence (src/lib/decision-intelligence.ts).
 *
 * Reglas de cálculo (auditables):
 *  - Ventas: byte_sales_daily si hay datos del mes; si no, fallback legacy
 *    (byte_total de daily_records + is_byte_sale) — mismo criterio que el
 *    reporte mensual.
 *  - Gastos operativos: porción del negocio (compartidos → atelier_amount),
 *    excluyendo préstamos, transferencias internas, archivados y categorías
 *    marcadas exclude_from_ebitda (la exclusión canónica del EBITDA).
 *  - Comparación justa: mes anterior AL MISMO DÍA del mes (día 1..N).
 *  - Tendencia por categoría: promedio diario de las 8 semanas (56 días)
 *    anteriores al inicio del mes vs lo gastado al corte.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { activeBusinessId } from "@/lib/active-business";
import { getUnifiedBankBalance, getCashBalance } from "./bank-balance";
import { getBudgetDashboard } from "./budgets";
import {
  computeIntel,
  OVERDUE_DAYS,
  type BusinessFacts,
  type CommandCenterIntel,
  type BudgetStatus,
  type CategoryTrend,
} from "@/lib/decision-intelligence";

const BUSINESS_NAMES: Record<number, string> = {
  1: "Yayi's Atelier",
  2: "Yayi's Fonavi",
  3: "Yayi's Centro",
};

function todayLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** Suma de ventas del negocio en [start, end] (byte_sales_daily o legacy).
 *  Exportada: el EIRS usa EXACTAMENTE la misma definición de "ventas". */
export async function salesInRange(bId: number, start: string, end: string): Promise<number> {
  const hasDaily = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM byte_sales_daily
    WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end}
  `)).rows[0] as { n: number };
  if (hasDaily.n > 0) {
    const r = (await db.execute(sql`
      SELECT COALESCE(SUM(efectivo + yape_plin + pos), 0)::float AS t
      FROM byte_sales_daily WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end}
    `)).rows[0] as { t: number };
    return Number(r.t);
  }
  const r = (await db.execute(sql`
    SELECT (
      COALESCE((SELECT SUM(byte_total) FROM daily_records
        WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end} AND archived = false), 0)
      +
      COALESCE((SELECT SUM(amount) FROM bank_income_items
        WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end}
          AND is_byte_sale = true AND archived = false), 0)
    )::float AS t
  `)).rows[0] as { t: number };
  return Number(r.t);
}

/** Gasto OPERATIVO (porción negocio, sin categorías excluidas del EBITDA).
 *  Exportada: el Panel de Liquidez usa EXACTAMENTE el mismo cálculo para
 *  el gasto diario promedio (una sola definición de "gasto operativo"). */
export async function opExpensesInRange(bId: number, start: string, end: string): Promise<number> {
  const r = (await db.execute(sql`
    SELECT COALESCE(SUM(CASE WHEN e.is_shared THEN COALESCE(e.atelier_amount, e.amount) ELSE e.amount END), 0)::float AS t
    FROM expenses e
    WHERE e.business_id = ${bId} AND e.date >= ${start} AND e.date <= ${end}
      AND e.is_special_loan = false AND e.is_internal_transfer = false AND e.archived = false
      AND e.payment_method <> 'pendiente_atelier'
      AND e.category NOT IN (
        SELECT name FROM expense_categories
        WHERE business_id = ${bId} AND exclude_from_ebitda = true
      )
  `)).rows[0] as { t: number };
  return Number(r.t);
}

export type CommandCenterData = CommandCenterIntel & {
  facts: BusinessFacts;
  asOf: string;
};

export async function getCommandCenter(): Promise<CommandCenterData> {
  const bId = await activeBusinessId();
  const today = todayLima();
  const [y, m, d] = today.split("-").map(Number);
  const daysElapsed = d;
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthStart = `${today.slice(0, 7)}-01`;

  // Mes anterior al MISMO día (capado al último día de ese mes).
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevMonthDays = new Date(prevY, prevM, 0).getDate();
  const prevStart = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
  const prevCut = `${prevY}-${String(prevM).padStart(2, "0")}-${String(Math.min(d, prevMonthDays)).padStart(2, "0")}`;

  // Ventana de 8 semanas ANTERIORES al inicio del mes (para promedios).
  const windowStart = new Date(y, m - 1, 1);
  windowStart.setDate(windowStart.getDate() - 56);
  const win0 = windowStart.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const winEnd = new Date(y, m - 1, 1);
  winEnd.setDate(winEnd.getDate() - 1);
  const win1 = winEnd.toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  // ── Hechos base (en paralelo donde se puede) ──
  const [bankSnap, cashSnap, salesMTD, salesPrev, opMTD, opWindow] = await Promise.all([
    getUnifiedBankBalance(),
    getCashBalance(),
    salesInRange(bId, monthStart, today),
    salesInRange(bId, prevStart, prevCut),
    opExpensesInRange(bId, monthStart, today),
    opExpensesInRange(bId, win0, win1),
  ]);
  const avgDailyExpense8w = Math.round((opWindow / 56) * 100) / 100;
  const opPrev = await opExpensesInRange(bId, prevStart, prevCut);

  // ── CxC (solo Atelier tiene cuentas por cobrar a los locales) ──
  let receivables: BusinessFacts["receivables"] = {
    totalPending: 0, overdueAmount: 0, overdueCount: 0, oldestDays: 0, byDebtor: [],
  };
  let partnerLoanPending = 0;
  if (bId === 1) {
    const rc = (await db.execute(sql`
      SELECT fr.debtor_business_id AS debtor,
             (fr.amount_due - fr.amount_collected)::float AS pending,
             (CURRENT_DATE - e.date::date)::int AS days_old
      FROM fonavi_receivables fr JOIN expenses e ON e.id = fr.expense_id
      WHERE fr.status <> 'collected'
    `)).rows as { debtor: number; pending: number; days_old: number }[];
    const byDebtorMap = new Map<string, number>();
    for (const r of rc) {
      const name = r.debtor === 3 ? "Centro" : "Fonavi";
      byDebtorMap.set(name, (byDebtorMap.get(name) ?? 0) + Number(r.pending));
      receivables.totalPending += Number(r.pending);
      if (r.days_old > OVERDUE_DAYS) {
        receivables.overdueAmount += Number(r.pending);
        receivables.overdueCount++;
      }
      receivables.oldestDays = Math.max(receivables.oldestDays, r.days_old);
    }
    receivables = {
      ...receivables,
      totalPending: Math.round(receivables.totalPending * 100) / 100,
      overdueAmount: Math.round(receivables.overdueAmount * 100) / 100,
      byDebtor: [...byDebtorMap.entries()].map(([name, pending]) => ({
        name, pending: Math.round(pending * 100) / 100,
      })),
    };

    const loan = (await db.execute(sql`
      SELECT (
        COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = 1 AND is_special_loan = true), 0)
        - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = 1 AND is_special_loan = true), 0)
      )::float AS p
    `)).rows[0] as { p: number };
    partnerLoanPending = Math.max(0, Math.round(Number(loan.p) * 100) / 100);
  }

  // ── Presupuesto (reusa el dashboard de presupuesto: % del ingreso + semáforo) ──
  let budgets: BudgetStatus[] = [];
  try {
    const bd = await getBudgetDashboard(today.slice(0, 7));
    budgets = bd.operativos.map((c) => ({
      category: c.name,
      budgetSoles: c.budgetSoles,
      spent: c.spent,
      color: c.color,
    }));
  } catch {
    budgets = [];
  }

  // ── Tendencias por categoría (mes al corte vs promedio 8 semanas previas) ──
  const catMonth = (await db.execute(sql`
    SELECT e.category, COALESCE(SUM(CASE WHEN e.is_shared THEN COALESCE(e.atelier_amount, e.amount) ELSE e.amount END), 0)::float AS t
    FROM expenses e
    WHERE e.business_id = ${bId} AND e.date >= ${monthStart} AND e.date <= ${today}
      AND e.is_special_loan = false AND e.is_internal_transfer = false AND e.archived = false
      AND e.payment_method <> 'pendiente_atelier'
      AND e.category NOT IN (SELECT name FROM expense_categories WHERE business_id = ${bId} AND exclude_from_ebitda = true)
    GROUP BY e.category
  `)).rows as { category: string; t: number }[];
  const catWindow = (await db.execute(sql`
    SELECT e.category, COALESCE(SUM(CASE WHEN e.is_shared THEN COALESCE(e.atelier_amount, e.amount) ELSE e.amount END), 0)::float AS t
    FROM expenses e
    WHERE e.business_id = ${bId} AND e.date >= ${win0} AND e.date <= ${win1}
      AND e.is_special_loan = false AND e.is_internal_transfer = false AND e.archived = false
      AND e.payment_method <> 'pendiente_atelier'
      AND e.category NOT IN (SELECT name FROM expense_categories WHERE business_id = ${bId} AND exclude_from_ebitda = true)
    GROUP BY e.category
  `)).rows as { category: string; t: number }[];
  const windowMap = new Map(catWindow.map((c) => [c.category, Number(c.t)]));

  // Top movimientos del mes por categoría (para la atribución del "por qué").
  const topMoves = (await db.execute(sql`
    SELECT category, concept, date::text AS date,
           (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS amount,
           ROW_NUMBER() OVER (PARTITION BY category ORDER BY (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END) DESC) AS rn
    FROM expenses
    WHERE business_id = ${bId} AND date >= ${monthStart} AND date <= ${today}
      AND is_special_loan = false AND is_internal_transfer = false AND archived = false
      AND payment_method <> 'pendiente_atelier'
  `)).rows as { category: string; concept: string; date: string; amount: number; rn: string | number }[];
  const topByCat = new Map<string, { concept: string; amount: number; date: string }[]>();
  for (const mv of topMoves) {
    if (Number(mv.rn) > 3) continue;
    if (!topByCat.has(mv.category)) topByCat.set(mv.category, []);
    topByCat.get(mv.category)!.push({ concept: mv.concept, amount: Number(mv.amount), date: mv.date });
  }

  const categoryTrends: CategoryTrend[] = [];
  const allCats = new Set([...catMonth.map((c) => c.category), ...windowMap.keys()]);
  for (const cat of allCats) {
    const monthToDate = Number(catMonth.find((c) => c.category === cat)?.t ?? 0);
    const dailyAvg8w = Math.round(((windowMap.get(cat) ?? 0) / 56) * 100) / 100;
    categoryTrends.push({
      category: cat,
      monthToDate: Math.round(monthToDate * 100) / 100,
      expectedToDate: Math.round(dailyAvg8w * daysElapsed * 100) / 100,
      dailyAvg8w,
      topMovements: topByCat.get(cat) ?? [],
    });
  }

  const facts: BusinessFacts = {
    businessName: BUSINESS_NAMES[bId] ?? "Yayi's",
    today,
    daysElapsed,
    daysInMonth,
    bank: {
      balance: bankSnap.current,
      hasDiscrepancy: bankSnap.hasDiscrepancy,
      discrepancyAmount: bankSnap.discrepancyAmount,
    },
    cash: cashSnap.current,
    sales: {
      monthToDate: Math.round(salesMTD * 100) / 100,
      prevMonthSameCut: Math.round(salesPrev * 100) / 100,
    },
    opExpenses: {
      monthToDate: Math.round(opMTD * 100) / 100,
      prevMonthSameCut: Math.round(opPrev * 100) / 100,
    },
    avgDailyExpense8w,
    receivables,
    partnerLoanPending,
    budgets,
    categoryTrends,
  };

  return { ...computeIntel(facts), facts, asOf: new Date().toISOString() };
}
