"use server";

/**
 * EIRS · CAPA 1 — Recolector de HECHOS (solo lectura, genérico por unidad).
 *
 * Reúne el mes del reporte + 3 meses históricos para cualquier unidad de
 * negocio (o el grupo completo), reutilizando las definiciones canónicas:
 * ventas (salesInRange) y gasto operativo (opExpensesInRange) del Centro
 * de Comando — el reporte y el dashboard nunca discrepan en definición.
 *
 * Capacidades DETECTADAS por datos (no por IDs): una unidad "tiene CxC" si
 * existen filas suyas, "tiene presupuesto" si hay semáforos configurados, etc.
 * Única atadura del modelo de datos actual: las CxC (fonavi_receivables)
 * pertenecen a la unidad productora (ver RECEIVABLES_OWNER_UNIT).
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { activeBusinessId } from "@/lib/active-business";
import { salesInRange, opExpensesInRange } from "./command-center";
import type {
  ReportFacts,
  ReportScope,
  BusinessUnitRef,
  UnitFacts,
  MonthlyBasics,
  CategoryMonth,
  BudgetFact,
} from "@/lib/report/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Restricción del modelo de datos actual: fonavi_receivables no tiene
 *  columna de unidad acreedora — pertenecen a la unidad productora (id 1).
 *  Si el modelo algún día la agrega, solo cambia esta constante. */
const RECEIVABLES_OWNER_UNIT = 1;

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(daysInMonth).padStart(2, "0")}`, daysInMonth };
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Liquidez (banco + caja) al cierre de una fecha. null si nunca hubo banco registrado. */
async function liquidityAt(bId: number, date: string): Promise<{ bank: number; cash: number } | null> {
  const bank = (await db.execute(sql`
    SELECT bank_balance_real::float AS b FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND archived = false AND date <= ${date}
    ORDER BY date DESC LIMIT 1
  `)).rows[0] as { b: number } | undefined;
  if (!bank) return null;
  const cash = (await db.execute(sql`
    SELECT (
      COALESCE((SELECT initial_cash_balance FROM businesses WHERE id = ${bId}), 0)
      + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date <= ${date}), 0)
      - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date <= ${date}), 0)
    )::float AS c
  `)).rows[0] as { c: number };
  return { bank: r2(Number(bank.b)), cash: r2(Number(cash.c)) };
}

/** Gasto bruto del rango (porción unidad; sin excluir categorías del EBITDA). */
async function grossExpensesInRange(bId: number, start: string, end: string): Promise<number> {
  const r = (await db.execute(sql`
    SELECT COALESCE(SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END), 0)::float AS t
    FROM expenses
    WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end}
      AND is_special_loan = false AND is_internal_transfer = false AND archived = false
      AND payment_method <> 'pendiente_atelier'
  `)).rows[0] as { t: number };
  return r2(Number(r.t));
}

async function monthlyBasics(bId: number, month: string): Promise<MonthlyBasics> {
  const { start, end } = monthBounds(month);
  const [sales, opExpenses, grossExpenses, liq] = await Promise.all([
    salesInRange(bId, start, end),
    opExpensesInRange(bId, start, end),
    grossExpensesInRange(bId, start, end),
    liquidityAt(bId, end),
  ]);
  return {
    month,
    sales: r2(sales),
    opExpenses: r2(opExpenses),
    grossExpenses,
    ebitda: r2(sales - opExpenses),
    liquidityEnd: liq ? r2(liq.bank + liq.cash) : null,
  };
}

/** Exportada también para el smoke-test de datos reales (scripts/). */
export async function collectUnitFacts(unit: BusinessUnitRef, month: string): Promise<UnitFacts> {
  const bId = unit.id;
  const { start, end, daysInMonth } = monthBounds(month);
  const m1 = prevMonth(month);
  const m2 = prevMonth(m1);
  const m3 = prevMonth(m2);
  const window3 = monthBounds(m3).start; // inicio de la ventana de 3 meses previos
  const window3End = monthBounds(m1).end;

  const [current, h3, h2, h1] = await Promise.all([
    monthlyBasics(bId, month),
    monthlyBasics(bId, m3),
    monthlyBasics(bId, m2),
    monthlyBasics(bId, m1),
  ]);

  // ── Categorías: mes + promedio de 3 meses previos + cost_group + top movs ──
  const catFilter = sql`
    e.business_id = ${bId} AND e.is_special_loan = false AND e.is_internal_transfer = false
    AND e.archived = false AND e.payment_method <> 'pendiente_atelier'
    AND e.category NOT IN (SELECT name FROM expense_categories WHERE business_id = ${bId} AND exclude_from_ebitda = true)
  `;
  const catMonth = (await db.execute(sql`
    SELECT e.category, COALESCE(SUM(CASE WHEN e.is_shared THEN COALESCE(e.atelier_amount, e.amount) ELSE e.amount END), 0)::float AS t
    FROM expenses e WHERE ${catFilter} AND e.date >= ${start} AND e.date <= ${end}
    GROUP BY e.category
  `)).rows as { category: string; t: number }[];
  const catWindow = (await db.execute(sql`
    SELECT e.category, COALESCE(SUM(CASE WHEN e.is_shared THEN COALESCE(e.atelier_amount, e.amount) ELSE e.amount END), 0)::float AS t
    FROM expenses e WHERE ${catFilter} AND e.date >= ${window3} AND e.date <= ${window3End}
    GROUP BY e.category
  `)).rows as { category: string; t: number }[];
  const costGroups = (await db.execute(sql`
    SELECT name, cost_group FROM expense_categories WHERE business_id = ${bId}
  `)).rows as { name: string; cost_group: string | null }[];
  const topMoves = (await db.execute(sql`
    SELECT category, concept, date::text AS date,
           (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS amount,
           ROW_NUMBER() OVER (PARTITION BY category ORDER BY (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END) DESC) AS rn
    FROM expenses e WHERE ${catFilter} AND e.date >= ${start} AND e.date <= ${end}
  `)).rows as { category: string; concept: string; date: string; amount: number; rn: string | number }[];

  const windowMap = new Map(catWindow.map((c) => [c.category, Number(c.t)]));
  const groupMap = new Map(costGroups.map((c) => [c.name, c.cost_group]));
  const topByCat = new Map<string, { concept: string; amount: number; date: string }[]>();
  for (const mv of topMoves) {
    if (Number(mv.rn) > 3) continue;
    if (!topByCat.has(mv.category)) topByCat.set(mv.category, []);
    topByCat.get(mv.category)!.push({ concept: mv.concept, amount: r2(Number(mv.amount)), date: mv.date });
  }
  const allCats = new Set([...catMonth.map((c) => c.category), ...windowMap.keys()]);
  const categories: CategoryMonth[] = [...allCats].map((cat) => ({
    category: cat,
    amount: r2(Number(catMonth.find((c) => c.category === cat)?.t ?? 0)),
    avg3m: r2((windowMap.get(cat) ?? 0) / 3),
    costGroup: groupMap.get(cat) ?? null,
    topMovements: topByCat.get(cat) ?? [],
  }));

  // ── Presupuesto del mes (inline, scoped a la unidad — no al negocio activo) ──
  const grossIncome = (await db.execute(sql`
    SELECT COALESCE(SUM(bank_income), 0)::float AS t FROM daily_records
    WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end} AND archived = false
  `)).rows[0] as { t: number };
  const budgetRows = (await db.execute(sql`
    SELECT category_name, budget_percentage::float AS pct, threshold_green, threshold_yellow
    FROM budgets WHERE business_id = ${bId} AND is_active = true AND has_traffic_light = true
  `)).rows as { category_name: string; pct: number | null; threshold_green: number; threshold_yellow: number }[];
  const spentByCat = new Map(catMonth.map((c) => [c.category, Number(c.t)]));
  const budget: BudgetFact[] = budgetRows.map((b) => {
    const budgetSoles = r2(Number(grossIncome.t) * ((b.pct ?? 0) / 100));
    const spent = r2(spentByCat.get(b.category_name) ?? 0);
    const consumed = budgetSoles > 0 ? (spent / budgetSoles) * 100 : spent > 0 ? 100 : 0;
    const color: BudgetFact["color"] =
      consumed >= b.threshold_yellow ? "red" : consumed >= b.threshold_green ? "yellow" : "green";
    return { category: b.category_name, budgetSoles, spent, color };
  });

  // ── CxC (solo la unidad propietaria del modelo actual) ──
  let receivables: UnitFacts["receivables"] = null;
  if (bId === RECEIVABLES_OWNER_UNIT) {
    const rc = (await db.execute(sql`
      SELECT fr.debtor_business_id AS debtor, (fr.amount_due - fr.amount_collected)::float AS pending,
             (CURRENT_DATE - e.date::date)::int AS days_old, b.name AS debtor_name
      FROM fonavi_receivables fr
      JOIN expenses e ON e.id = fr.expense_id
      JOIN businesses b ON b.id = fr.debtor_business_id
      WHERE fr.status <> 'collected'
    `)).rows as { debtor: number; pending: number; days_old: number; debtor_name: string }[];
    if (rc.length > 0) {
      const byDebtor = new Map<string, { pending: number; oldestDays: number }>();
      let total = 0, overdue = 0, oldest = 0;
      for (const row of rc) {
        const acc = byDebtor.get(row.debtor_name) ?? { pending: 0, oldestDays: 0 };
        acc.pending = r2(acc.pending + Number(row.pending));
        acc.oldestDays = Math.max(acc.oldestDays, row.days_old);
        byDebtor.set(row.debtor_name, acc);
        total += Number(row.pending);
        oldest = Math.max(oldest, row.days_old);
        if (row.days_old > 15) overdue += Number(row.pending);
      }
      receivables = {
        totalPending: r2(total), overdueAmount: r2(overdue), oldestDays: oldest,
        byDebtor: [...byDebtor.entries()].map(([name, v]) => ({ name, ...v })),
      };
    } else {
      receivables = { totalPending: 0, overdueAmount: 0, oldestDays: 0, byDebtor: [] };
    }
  }

  // ── Préstamos del socio (capacidad detectada por datos) ──
  const loan = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM bank_income_items WHERE business_id = ${bId} AND is_special_loan = true)::int AS n,
      (COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND is_special_loan = true), 0)
       - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND is_special_loan = true), 0))::float AS p
  `)).rows[0] as { n: number; p: number };
  const partnerLoanPending = loan.n > 0 ? Math.max(0, r2(Number(loan.p))) : null;

  // ── Conciliación: último cuadre hasta el fin de mes ──
  const check = (await db.execute(sql`
    SELECT check_date::text AS d, difference::float AS diff FROM bank_real_checks
    WHERE business_id = ${bId} AND check_date <= ${end}
    ORDER BY check_date DESC LIMIT 1
  `)).rows[0] as { d: string; diff: number } | undefined;

  // ── Byte sales disponible en el mes ──
  const byteDaily = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM byte_sales_daily
    WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end}
  `)).rows[0] as { n: number };

  // ── Anexo ──
  const topExpenses = (await db.execute(sql`
    SELECT date::text AS date, category, concept,
           (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS amount
    FROM expenses e WHERE ${catFilter} AND e.date >= ${start} AND e.date <= ${end}
    ORDER BY amount DESC LIMIT 20
  `)).rows as { date: string; category: string; concept: string; amount: number }[];
  const counts = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM bank_income_items WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end} AND archived = false)::int AS incomes,
      (SELECT COUNT(*) FROM expenses WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end} AND archived = false)::int AS expenses
  `)).rows[0] as { incomes: number; expenses: number };

  const liqEnd = await liquidityAt(bId, end);
  const liqPrevEnd = await liquidityAt(bId, monthBounds(m1).end);

  return {
    unit,
    capabilities: {
      receivables: receivables !== null,
      partnerLoans: partnerLoanPending !== null,
      budgets: budget.length > 0,
      byteSales: byteDaily.n > 0,
    },
    month,
    daysInMonth,
    current,
    history: [h3, h2, h1],
    categories,
    budget,
    liquidity: {
      bankEnd: liqEnd?.bank ?? 0,
      cashEnd: liqEnd?.cash ?? 0,
      startOfMonth: liqPrevEnd ? r2(liqPrevEnd.bank + liqPrevEnd.cash) : null,
      avgDailyExpense: r2(current.opExpenses / daysInMonth),
    },
    receivables,
    partnerLoanPending,
    reconciliation: {
      lastCheckDate: check?.d ?? null,
      lastCheckDiff: check ? r2(Number(check.diff)) : null,
      hasDiscrepancy: false, // la detección "en vivo" es del dashboard; aquí manda el último cuadre
    },
    annex: {
      topExpenses: topExpenses.map((t) => ({ ...t, amount: r2(Number(t.amount)) })),
      expensesByCategory: categories
        .filter((c) => c.amount > 0)
        .map((c) => ({ category: c.category, amount: c.amount, share: current.opExpenses > 0 ? r2((c.amount / current.opExpenses) * 100) : 0 }))
        .sort((a, b) => b.amount - a.amount),
      movementCounts: { incomes: counts.incomes, expenses: counts.expenses },
    },
  };
}

export async function getReportFacts(input: {
  scope: "unit" | "group";
  unitId?: number;
  month: string; // YYYY-MM
}): Promise<ReportFacts> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) {
    throw new Error("Mes inválido (formato YYYY-MM)");
  }
  const activeId = await activeBusinessId();

  const allUnits = (await db.execute(sql`
    SELECT id, code, name FROM businesses WHERE active = true ORDER BY id
  `)).rows as BusinessUnitRef[];

  let scope: ReportScope;
  let unitRefs: BusinessUnitRef[];
  if (input.scope === "group") {
    // El grupo completo solo desde la unidad principal (rol del dueño).
    if (activeId !== 1) throw new Error("El reporte de grupo solo está disponible desde Atelier");
    scope = { kind: "group", units: allUnits };
    unitRefs = allUnits;
  } else {
    const unit = allUnits.find((u) => u.id === (input.unitId ?? activeId));
    if (!unit) throw new Error("Unidad de negocio no encontrada");
    if (activeId !== 1 && unit.id !== activeId) {
      throw new Error("Solo puedes generar reportes de tu unidad activa");
    }
    scope = { kind: "unit", unit };
    unitRefs = [unit];
  }

  const units = await Promise.all(unitRefs.map((u) => collectUnitFacts(u, input.month)));

  return {
    scope,
    month: input.month,
    monthLabel: monthLabelOf(input.month),
    generatedAt: new Date().toISOString(),
    units,
  };
}
