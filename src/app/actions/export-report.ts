"use server";

import { neon } from "@neondatabase/serverless";
import { splitExpenses, type ExpenseLike } from "@/lib/expense-split";
import { splitIncomes, type IncomeLike } from "@/lib/income-base";

const sql = neon(process.env.DATABASE_URL!);

export type ExportPeriod = { start: string; end: string; label: string; isMonth: boolean };

export type ReportData = {
  period: ExportPeriod;
  /** Local del reporte: "Grupo" (los 3) o el nombre del negocio elegido. */
  scopeLabel: string;
  generatedAt: string;
  hasData: boolean;
  // Resumen
  summary: {
    incomeGross: number;
    incomeAdjusted: number;       // sin reembolsos Fonavi ni no-operativos (base EBITDA)
    fonaviReimbursements: number;
    /** Ingresos no operativos (venta de activos, préstamos recibidos…).
     *  SÍ están en el flujo de caja y saldos; NO cuentan en ventas/EBITDA. */
    incomeNonOperative: number;
    expensesGross: number;         // desembolso total (montos completos)
    expensesOperative: number;     // sin financieras + atelier_amount en compartidos (base EBITDA)
    expensesFinancial: number;     // las excluidas del EBITDA
    /** Porción Fonavi de gastos compartidos (gross − porción Atelier). Línea
     *  de reconciliación: gross − fonaviShared − financial = operative. */
    expensesFonaviShared: number;
    ebitda: number;
    ebitdaMargin: number;          // %
    bankStart: number;
    bankEnd: number;
    bankDelta: number;
    /** Ingresos que van al banco (transferencia/yape/plin; excluye efectivo). */
    bankIncome: number;
    /** Egresos que salen del banco (excluye efectivo y pendiente_atelier). */
    bankExpense: number;
    fonaviReceivablesAtEnd: number;
    b2bReceivablesAtEnd: number;
  };
  // Detalles
  incomes: Array<{
    date: string; client: string; concept: string; amount: number; method: string;
    isReimbursement: boolean; nonOperativeCategory: string | null; notes: string;
  }>;
  expenses: Array<{
    date: string; category: string; concept: string; method: string;
    amount: number; isShared: boolean; atelierAmount: number; fonaviAmount: number;
    notes: string;
  }>;
  byCategory: Array<{
    category: string; totalGross: number; totalAtelier: number; pct: number; count: number; avg: number;
    excludeFromEbitda: boolean;
  }>;
  budgetVsReal: Array<{
    category: string; budgeted: number | null; real: number; diff: number; pct: number; status: "ok" | "near" | "over" | "no-budget";
  }>;
  cashFlow: Array<{
    date: string; bankStart: number; income: number; expense: number; bankEnd: number; delta: number;
  }>;
  topExpenses: Array<{
    date: string; category: string; concept: string; amount: number; method: string;
  }>;
  comparePrev: null | {
    prevLabel: string;
    metrics: Array<{ name: string; current: number; prev: number; delta: number; deltaPct: number }>;
  };
  fonaviAtEnd: Array<{
    date: string; category: string; concept: string; pending: number; collected: number; status: string; aging: number;
  }>;
  b2bAtEnd: Array<{
    client: string; date: string; total: number; collected: number; pending: number; aging: number;
  }>;
  /**
   * Posición de deudas y por cobrar — SALDOS DE BALANCE al cierre del período
   * (no son flujo del período; NO afectan EBITDA). Mismas fuentes que el
   * dashboard, acotadas por fecha de corte = fin del período.
   */
  debtPosition: {
    asOfDate: string;          // fecha de corte (= fin del período)
    partnerLoan: number;       // deuda con socio (préstamos personales pendientes) — Atelier
    fonaviReceivable: number;  // por cobrar gastos compartidos pendientes — Atelier
    b2bReceivable: number;     // cuentas por cobrar B2B (créditos Byte: Byte total − cobros)
  };
};

function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

/**
 * Normaliza el nombre de categoría para que variantes por mayúsculas/
 * minúsculas ("ALQUILER" vs "Alquiler") se consoliden en una sola línea.
 * Title-case por palabra. Se aplica de forma consistente a egresos,
 * presupuestos y categorías excluidas para que los joins por nombre y los
 * agrupados no se fragmenten.
 */
function normalizeCategory(c: unknown): string {
  const t = String(c ?? "").trim();
  if (!t) return t;
  return t
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function startOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function endOfMonth(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/**
 * Genera la data del reporte. `businessId`:
 *   - null (default) → Grupo: agrega los 3 negocios (comportamiento histórico).
 *   - número         → solo ese negocio (Atelier=1, Fonavi=2, Centro=3).
 * El filtro por negocio se aplica con un predicado null-safe en cada query
 * (`businessId IS NULL OR business_id = businessId`), por lo que con null el
 * resultado es idéntico al anterior. NO toca la fórmula del saldo.
 */
export async function getReportData(
  period: ExportPeriod,
  businessId: number | null = null,
): Promise<ReportData> {
  const t0 = Date.now();
  const { start, end } = period;
  console.log(`[export] getReportData start=${start} end=${end} label="${period.label}" isMonth=${period.isMonth} businessId=${businessId ?? "grupo"}`);

  // Etiqueta del local (autoritativa desde la BD). Se usa en encabezados del
  // reporte y para el nombre de archivo.
  let scopeLabel = "Grupo";
  if (businessId !== null) {
    const bizRow = (await sql`SELECT name FROM businesses WHERE id = ${businessId}`) as { name: string }[];
    scopeLabel = (bizRow[0]?.name || "Negocio").replace(/^Yayi's\s*/i, "");
  }

  // Categorías excluidas del EBITDA
  const excluded = (await sql`SELECT name FROM expense_categories WHERE exclude_from_ebitda = true AND (${businessId}::int IS NULL OR business_id = ${businessId})`) as { name: string }[];
  const excludedSet = new Set(excluded.map((r) => normalizeCategory(r.name)));
  console.log(`[export] excluded categories: ${[...excludedSet].join(", ") || "(none)"}`);

  // Saldo inicial del período: último bank_balance_real con date < start (o 0)
  const bankStartRow = (await sql`
    SELECT bank_balance_real::float as bal FROM daily_records
    WHERE bank_balance_real IS NOT NULL AND date < ${start}
      AND (${businessId}::int IS NULL OR business_id = ${businessId})
      AND archived = false
    ORDER BY date DESC LIMIT 1
  `) as { bal: number }[];
  const bankStart = bankStartRow[0]?.bal ?? 0;

  // Saldo final del período: último bank_balance_real con date <= end
  const bankEndRow = (await sql`
    SELECT bank_balance_real::float as bal FROM daily_records
    WHERE bank_balance_real IS NOT NULL AND date <= ${end}
      AND (${businessId}::int IS NULL OR business_id = ${businessId})
      AND archived = false
    ORDER BY date DESC LIMIT 1
  `) as { bal: number }[];
  const bankEnd = bankEndRow[0]?.bal ?? 0;

  // Ingresos (todos)
  const incomesRows = (await sql`
    SELECT bi.date::text as date, bi.amount::float as amount, bi.note,
           bi.is_fonavi_reimbursement as is_reimbursement,
           bi.non_operative_category,
           bi.payment_method as method,
           c.name as client_name
    FROM bank_income_items bi
    LEFT JOIN clients c ON c.id = bi.client_id
    WHERE bi.date >= ${start} AND bi.date <= ${end}
      AND (${businessId}::int IS NULL OR bi.business_id = ${businessId})
      AND bi.is_special_loan = false AND bi.is_internal_transfer = false AND bi.archived = false
    ORDER BY bi.date DESC
  `) as Record<string, unknown>[];

  // Egresos (todos)
  const expensesRows = (await sql`
    SELECT date::text as date, category, concept, amount::float as amount,
           payment_method as method, is_shared,
           atelier_amount::float as atelier_amount, fonavi_amount::float as fonavi_amount,
           notes
    FROM expenses
    WHERE date >= ${start} AND date <= ${end}
      AND (${businessId}::int IS NULL OR business_id = ${businessId})
      AND is_special_loan = false AND is_internal_transfer = false AND archived = false
      AND payment_method <> 'pendiente_atelier'
    ORDER BY date DESC
  `) as Record<string, unknown>[];

  console.log(`[export] incomes rows: ${incomesRows.length}, expenses rows: ${expensesRows.length}`);

  // Mapear ingresos
  const incomes = incomesRows.map((r) => ({
    date: r.date as string,
    client: (r.client_name as string) || "—",
    concept: (r.note as string) || "Ingreso",
    amount: parseNum(r.amount),
    method: (r.method as string) || "transferencia",
    isReimbursement: !!r.is_reimbursement,
    nonOperativeCategory: (r.non_operative_category as string) || null,
    notes: "",
  }));

  // Mapear egresos
  const expenses = expensesRows.map((r) => ({
    date: r.date as string,
    category: normalizeCategory(r.category),
    concept: r.concept as string,
    method: r.method as string,
    amount: parseNum(r.amount),
    isShared: !!r.is_shared,
    atelierAmount: r.atelier_amount !== null ? parseNum(r.atelier_amount) : parseNum(r.amount),
    fonaviAmount: r.fonavi_amount !== null ? parseNum(r.fonavi_amount) : 0,
    notes: (r.notes as string) || "",
  }));

  // Resumen — base de ingresos vía la función pura canónica (única fuente de
  // verdad, compartida con el comparativo): adjusted = gross − reembolsos
  // Fonavi − ingresos no operativos. Los no-operativos siguen en `incomes`
  // (flujo de caja y saldos los ven), solo salen de la base EBITDA.
  const incSplit = splitIncomes(incomes);
  const incomeGross = incSplit.gross;
  const fonaviReimbursements = incSplit.fonaviReimbursements;
  const incomeNonOperative = incSplit.nonOperative;
  const incomeAdjusted = incSplit.adjusted;
  // Flujo BANCARIO (regla canónica del saldo): solo lo que entra/sale del
  // banco. Ingresos por transferencia/yape/plin (excluye efectivo); egresos
  // por método distinto de efectivo (pendiente_atelier ya excluido en query).
  const bankIncome = incomes.filter((x) => x.method !== "efectivo").reduce((s, x) => s + x.amount, 0);
  const bankExpense = expenses.filter((x) => x.method !== "efectivo").reduce((s, x) => s + x.amount, 0);
  // Desglose de egresos vía la función pura canónica (única fuente de verdad,
  // compartida con el comparativo). `excludedSet` es business-scoped → cada
  // egreso financiero se cuenta una sola vez.
  const expSplit = splitExpenses(expenses, (c) => excludedSet.has(c));
  const expensesGross = expSplit.gross;
  const expensesOperative = expSplit.operative;
  const expensesFinancial = expSplit.financial;
  const expensesFonaviShared = expSplit.fonaviShared;
  const ebitda = incomeAdjusted - expensesOperative;
  const ebitdaMargin = incomeAdjusted > 0 ? (ebitda / incomeAdjusted) * 100 : 0;

  // CxC al final del período
  const fonaviAtEndRows = (await sql`
    SELECT fr.id::text as id, e.date::text as date, e.category, e.concept,
           (fr.amount_due - fr.amount_collected)::float as pending,
           fr.amount_collected::float as collected,
           fr.status,
           (${end}::date - e.date::date) as aging
    FROM fonavi_receivables fr
    JOIN expenses e ON e.id = fr.expense_id
    WHERE e.date <= ${end} AND fr.status != 'collected'
      AND (${businessId}::int IS NULL OR e.business_id = ${businessId})
    ORDER BY e.date ASC
  `) as Record<string, unknown>[];
  const fonaviAtEnd = fonaviAtEndRows.map((r) => ({
    date: r.date as string, category: r.category as string, concept: r.concept as string,
    pending: parseNum(r.pending), collected: parseNum(r.collected), status: r.status as string, aging: parseNum(r.aging),
  })).filter((r) => r.pending > 0);
  const fonaviReceivablesAtEnd = fonaviAtEnd.reduce((s, x) => s + x.pending, 0);

  // CxC B2B (calculado como total Byte - cobros del banco hasta end, simplificado)
  const b2bAtEndRows = (await sql`
    SELECT
      COALESCE(SUM(byte_total), 0)::float as total_byte,
      COALESCE(SUM(bank_income), 0)::float as total_collected
    FROM daily_records WHERE date <= ${end}
      AND (${businessId}::int IS NULL OR business_id = ${businessId})
      AND archived = false
  `) as { total_byte: number; total_collected: number }[];
  const b2bReceivablesAtEnd = Math.max(0, b2bAtEndRows[0].total_byte - b2bAtEndRows[0].total_collected);

  // Deuda con socio al cierre del período (préstamos del socio pendientes).
  // Misma lógica que el dashboard (loaned − refunded sobre is_special_loan),
  // pero acotada por date <= end para que sea el saldo al cierre del mes del
  // reporte. Solo Atelier tiene préstamos-socio; en otros negocios da 0.
  const partnerLoanRows = (await sql`
    SELECT
      COALESCE((SELECT SUM(amount) FROM bank_income_items
        WHERE (${businessId}::int IS NULL OR business_id = ${businessId})
          AND is_special_loan = true AND date <= ${end}), 0)::float AS loaned,
      COALESCE((SELECT SUM(amount) FROM expenses
        WHERE (${businessId}::int IS NULL OR business_id = ${businessId})
          AND is_special_loan = true AND date <= ${end}), 0)::float AS refunded
  `) as { loaned: number; refunded: number }[];
  const partnerLoanAtEnd = Math.max(0, Math.round((partnerLoanRows[0].loaned - partnerLoanRows[0].refunded) * 100) / 100);

  // Por categoría
  const catMap = new Map<string, { gross: number; atelier: number; count: number; exclude: boolean }>();
  for (const x of expenses) {
    if (!catMap.has(x.category)) catMap.set(x.category, { gross: 0, atelier: 0, count: 0, exclude: excludedSet.has(x.category) });
    const e = catMap.get(x.category)!;
    e.gross += x.amount;
    e.atelier += x.isShared ? x.atelierAmount : x.amount;
    e.count++;
  }
  const totalAtelierAll = Array.from(catMap.values()).reduce((s, v) => s + v.atelier, 0);
  const byCategory = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      totalGross: v.gross,
      totalAtelier: v.atelier,
      pct: totalAtelierAll > 0 ? (v.atelier / totalAtelierAll) * 100 : 0,
      count: v.count,
      avg: v.count > 0 ? v.atelier / v.count : 0,
      excludeFromEbitda: v.exclude,
    }))
    .sort((a, b) => b.totalAtelier - a.totalAtelier);

  // Presupuesto vs Real
  // budgets.budget_percentage = % sobre ingresos ajustados; el monto presupuestado se calcula así
  const budgetsRows = (await sql`
    SELECT category_name, budget_percentage::float as pct,
           threshold_green::int as t_green, threshold_yellow::int as t_yellow
    FROM budgets WHERE is_active = true
      AND (${businessId}::int IS NULL OR business_id = ${businessId})
  `) as { category_name: string; pct: number; t_green: number; t_yellow: number }[];
  console.log(`[export] active budgets: ${budgetsRows.length}`);
  const budgetMap = new Map(budgetsRows.map((b) => [normalizeCategory(b.category_name), b]));
  const allCats = new Set([...catMap.keys(), ...budgetMap.keys()]);
  const budgetVsReal = Array.from(allCats).map((category) => {
    const b = budgetMap.get(category) ?? null;
    const budgeted = b ? Math.round((incomeAdjusted * b.pct) / 100 * 100) / 100 : null;
    const real = catMap.get(category)?.atelier ?? 0;
    const diff = budgeted !== null ? real - budgeted : 0;
    const pct = budgeted !== null && budgeted > 0 ? (real / budgeted) * 100 : 0;
    let status: "ok" | "near" | "over" | "no-budget" = "no-budget";
    if (b) {
      const tGreen = b.t_green ?? 70;
      const tYellow = b.t_yellow ?? 90;
      if (pct <= tGreen) status = "ok";
      else if (pct <= tYellow) status = "near";
      else status = "over";
    }
    return { category, budgeted, real, diff, pct, status };
  }).sort((a, b) => b.real - a.real);

  // Flujo de caja diario
  const flowRows = (await sql`
    WITH dates AS (
      SELECT generate_series(${start}::date, ${end}::date, '1 day')::date as date
    )
    SELECT
      d.date::text as date,
      COALESCE(dr.bank_balance_real::float, NULL) as bank_balance,
      COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = d.date AND (${businessId}::int IS NULL OR business_id = ${businessId}) AND is_special_loan = false AND is_internal_transfer = false AND archived = false AND payment_method <> 'efectivo'), 0)::float as income,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date = d.date AND payment_method NOT IN ('efectivo','pendiente_atelier') AND (${businessId}::int IS NULL OR business_id = ${businessId}) AND is_special_loan = false AND is_internal_transfer = false AND archived = false), 0)::float as expense
    FROM dates d
    LEFT JOIN daily_records dr ON dr.date = d.date AND (${businessId}::int IS NULL OR dr.business_id = ${businessId}) AND dr.archived = false
    ORDER BY d.date ASC
  `) as Record<string, unknown>[];
  let runningBalance = bankStart;
  const cashFlow = flowRows.map((r) => {
    const income = parseNum(r.income);
    const expense = parseNum(r.expense);
    const stored = r.bank_balance !== null ? parseNum(r.bank_balance) : null;
    const start_ = runningBalance;
    const end_ = stored !== null ? stored : Math.round((runningBalance + income - expense) * 100) / 100;
    const delta = end_ - start_;
    runningBalance = end_;
    return { date: r.date as string, bankStart: start_, income, expense, bankEnd: end_, delta };
  });

  // Top 10 egresos
  const topExpenses = [...expenses]
    .map((x) => ({
      date: x.date, category: x.category, concept: x.concept,
      amount: x.isShared ? x.atelierAmount : x.amount,
      method: x.method,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Comparativo mes anterior
  let comparePrev: ReportData["comparePrev"] = null;
  if (period.isMonth) {
    const startD = new Date(start + "T12:00:00");
    const prevMonth = new Date(startD.getFullYear(), startD.getMonth() - 1, 1);
    const prevStart = startOfMonth(prevMonth);
    const prevEnd = endOfMonth(prevMonth);

    // Ingresos del mes anterior: MISMAS filas (mismos filtros que el reporte
    // directo) pasadas por la MISMA función pura `splitIncomes`. Nada de
    // agregados SQL paralelos (mismo principio que splitExpenses abajo).
    const prevIncRows = (await sql`
      SELECT amount::float as amount, is_fonavi_reimbursement, non_operative_category
      FROM bank_income_items WHERE date >= ${prevStart} AND date <= ${prevEnd}
        AND (${businessId}::int IS NULL OR business_id = ${businessId})
        AND is_special_loan = false AND is_internal_transfer = false AND archived = false
    `) as Record<string, unknown>[];
    const prevIncomes: IncomeLike[] = prevIncRows.map((r) => ({
      amount: parseNum(r.amount),
      isReimbursement: !!r.is_fonavi_reimbursement,
      nonOperativeCategory: (r.non_operative_category as string) || null,
    }));
    const prevIncSplit = splitIncomes(prevIncomes);
    // Egresos del mes anterior: se traen las MISMAS filas (mismos filtros que
    // el reporte directo) y se pasan por la MISMA función pura `splitExpenses`
    // con el MISMO excludedSet business-scoped. Así el comparativo y el reporte
    // directo no pueden divergir (antes el comparativo usaba un JOIN sin scope
    // que multiplicaba los financieros ×N negocios). is_shared se castea a
    // boolean explícito para el tipado.
    const prevExpRows = (await sql`
      SELECT amount::float as amount, is_shared,
             atelier_amount::float as atelier_amount, category
      FROM expenses WHERE date >= ${prevStart} AND date <= ${prevEnd}
        AND (${businessId}::int IS NULL OR business_id = ${businessId})
        AND is_special_loan = false AND is_internal_transfer = false AND archived = false
        AND payment_method <> 'pendiente_atelier'
    `) as Record<string, unknown>[];
    const prevExpenses: ExpenseLike[] = prevExpRows.map((r) => ({
      amount: parseNum(r.amount),
      isShared: !!r.is_shared,
      atelierAmount: r.atelier_amount !== null ? parseNum(r.atelier_amount) : parseNum(r.amount),
      category: normalizeCategory(r.category),
    }));
    const prevSplit = splitExpenses(prevExpenses, (c) => excludedSet.has(c));

    const prevIncomeAdj = prevIncSplit.adjusted;
    const prevExpOp = prevSplit.operative;
    const prevEbitda = prevIncomeAdj - prevExpOp;
    const prevMargin = prevIncomeAdj > 0 ? (prevEbitda / prevIncomeAdj) * 100 : 0;

    const prevLabel = `${["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][prevMonth.getMonth()]} ${prevMonth.getFullYear()}`;

    const mk = (name: string, current: number, prev: number) => ({
      name, current, prev,
      delta: current - prev,
      deltaPct: prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : 0,
    });

    comparePrev = {
      prevLabel,
      metrics: [
        mk("Ingresos ajustados", incomeAdjusted, prevIncomeAdj),
        mk("Egresos operativos", expensesOperative, prevExpOp),
        mk("EBITDA", ebitda, prevEbitda),
        mk("Margen EBITDA %", ebitdaMargin, prevMargin),
        mk("# transacciones egreso", expenses.length, prevSplit.count),
      ],
    };
  }

  // B2B aging por cliente (simplificado: usa datos agregados)
  const b2bAtEnd = [{ client: "B2B (agregado)", date: end, total: b2bAtEndRows[0].total_byte, collected: b2bAtEndRows[0].total_collected, pending: b2bReceivablesAtEnd, aging: 0 }];

  console.log(`[export] EBITDA=${ebitda.toFixed(2)} margin=${ebitdaMargin.toFixed(2)}% byCategory=${byCategory.length} cashFlow=${cashFlow.length} comparePrev=${!!comparePrev}`);
  console.log(`[export] done in ${Date.now() - t0}ms`);

  return {
    period,
    scopeLabel,
    generatedAt: new Date().toISOString(),
    hasData: incomes.length > 0 || expenses.length > 0,
    summary: {
      incomeGross,
      incomeAdjusted,
      fonaviReimbursements,
      incomeNonOperative,
      expensesGross,
      expensesOperative,
      expensesFinancial,
      expensesFonaviShared,
      ebitda,
      ebitdaMargin,
      bankStart,
      bankEnd,
      bankDelta: bankEnd - bankStart,
      bankIncome,
      bankExpense,
      fonaviReceivablesAtEnd,
      b2bReceivablesAtEnd,
    },
    incomes,
    expenses,
    byCategory,
    budgetVsReal,
    cashFlow,
    topExpenses,
    comparePrev,
    fonaviAtEnd,
    b2bAtEnd,
    debtPosition: {
      asOfDate: end,
      partnerLoan: partnerLoanAtEnd,
      fonaviReceivable: fonaviReceivablesAtEnd,
      b2bReceivable: b2bReceivablesAtEnd,
    },
  };
}
