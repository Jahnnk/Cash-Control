"use server";

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export type ExportPeriod = { start: string; end: string; label: string; isMonth: boolean };

export type ReportData = {
  period: ExportPeriod;
  generatedAt: string;
  hasData: boolean;
  // Resumen
  summary: {
    incomeGross: number;
    incomeAdjusted: number;       // sin reembolsos Fonavi
    fonaviReimbursements: number;
    expensesGross: number;         // todos
    expensesOperative: number;     // sin financieras + atelier_amount en compartidos
    expensesFinancial: number;     // las excluidas del EBITDA
    ebitda: number;
    ebitdaMargin: number;          // %
    bankStart: number;
    bankEnd: number;
    bankDelta: number;
    fonaviReceivablesAtEnd: number;
    b2bReceivablesAtEnd: number;
  };
  // Detalles
  incomes: Array<{
    date: string; client: string; concept: string; amount: number; method: string;
    isReimbursement: boolean; notes: string;
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
};

function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

function startOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function endOfMonth(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export async function getReportData(period: ExportPeriod): Promise<ReportData> {
  const { start, end } = period;

  // Categorías excluidas del EBITDA
  const excluded = (await sql`SELECT name FROM expense_categories WHERE exclude_from_ebitda = true`) as { name: string }[];
  const excludedSet = new Set(excluded.map((r) => r.name));

  // Saldo inicial del período: último bank_balance_real con date < start (o 0)
  const bankStartRow = (await sql`
    SELECT bank_balance_real::float as bal FROM daily_records
    WHERE bank_balance_real IS NOT NULL AND date < ${start}
    ORDER BY date DESC LIMIT 1
  `) as { bal: number }[];
  const bankStart = bankStartRow[0]?.bal ?? 0;

  // Saldo final del período: último bank_balance_real con date <= end
  const bankEndRow = (await sql`
    SELECT bank_balance_real::float as bal FROM daily_records
    WHERE bank_balance_real IS NOT NULL AND date <= ${end}
    ORDER BY date DESC LIMIT 1
  `) as { bal: number }[];
  const bankEnd = bankEndRow[0]?.bal ?? 0;

  // Ingresos (todos)
  const incomesRows = (await sql`
    SELECT bi.date::text as date, bi.amount::float as amount, bi.note,
           bi.is_fonavi_reimbursement as is_reimbursement,
           c.name as client_name
    FROM bank_income_items bi
    LEFT JOIN clients c ON c.id = bi.client_id
    WHERE bi.date >= ${start} AND bi.date <= ${end}
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
    ORDER BY date DESC
  `) as Record<string, unknown>[];

  // Mapear ingresos
  const incomes = incomesRows.map((r) => ({
    date: r.date as string,
    client: (r.client_name as string) || "—",
    concept: (r.note as string) || "Ingreso",
    amount: parseNum(r.amount),
    method: "transferencia",
    isReimbursement: !!r.is_reimbursement,
    notes: "",
  }));

  // Mapear egresos
  const expenses = expensesRows.map((r) => ({
    date: r.date as string,
    category: r.category as string,
    concept: r.concept as string,
    method: r.method as string,
    amount: parseNum(r.amount),
    isShared: !!r.is_shared,
    atelierAmount: r.atelier_amount !== null ? parseNum(r.atelier_amount) : parseNum(r.amount),
    fonaviAmount: r.fonavi_amount !== null ? parseNum(r.fonavi_amount) : 0,
    notes: (r.notes as string) || "",
  }));

  // Resumen
  const incomeGross = incomes.reduce((s, x) => s + x.amount, 0);
  const fonaviReimbursements = incomes.filter((x) => x.isReimbursement).reduce((s, x) => s + x.amount, 0);
  const incomeAdjusted = incomeGross - fonaviReimbursements;
  const expensesGross = expenses.reduce((s, x) => s + x.amount, 0);
  let expensesOperative = 0;
  let expensesFinancial = 0;
  for (const x of expenses) {
    const atelier = x.isShared ? x.atelierAmount : x.amount;
    if (excludedSet.has(x.category)) expensesFinancial += atelier;
    else expensesOperative += atelier;
  }
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
  `) as { total_byte: number; total_collected: number }[];
  const b2bReceivablesAtEnd = Math.max(0, b2bAtEndRows[0].total_byte - b2bAtEndRows[0].total_collected);

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
  const budgetsRows = (await sql`
    SELECT b.category, b.amount::float as amount FROM budgets b
    WHERE b.month = ${start.substring(0, 7)}
  `) as { category: string; amount: number }[];
  const budgetMap = new Map(budgetsRows.map((b) => [b.category, b.amount]));
  const allCats = new Set([...catMap.keys(), ...budgetMap.keys()]);
  const budgetVsReal = Array.from(allCats).map((category) => {
    const budgeted = budgetMap.has(category) ? budgetMap.get(category)! : null;
    const real = catMap.get(category)?.atelier ?? 0;
    const diff = budgeted !== null ? real - budgeted : 0;
    const pct = budgeted !== null && budgeted > 0 ? (real / budgeted) * 100 : 0;
    let status: "ok" | "near" | "over" | "no-budget" = "no-budget";
    if (budgeted !== null) {
      if (real <= budgeted * 0.8) status = "ok";
      else if (real <= budgeted) status = "near";
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
      COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = d.date), 0)::float as income,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE date = d.date AND payment_method != 'efectivo'), 0)::float as expense
    FROM dates d
    LEFT JOIN daily_records dr ON dr.date = d.date
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

    const prevIncRows = (await sql`
      SELECT
        COALESCE(SUM(amount), 0)::float as gross,
        COALESCE(SUM(amount) FILTER (WHERE is_fonavi_reimbursement = false), 0)::float as adjusted
      FROM bank_income_items WHERE date >= ${prevStart} AND date <= ${prevEnd}
    `) as { gross: number; adjusted: number }[];
    const prevExpRows = (await sql`
      SELECT
        COALESCE(SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END), 0)::float as atelier,
        COUNT(*)::int as n
      FROM expenses WHERE date >= ${prevStart} AND date <= ${prevEnd}
    `) as { atelier: number; n: number }[];
    const prevExpFinRows = (await sql`
      SELECT COALESCE(SUM(CASE WHEN e.is_shared THEN COALESCE(e.atelier_amount, e.amount) ELSE e.amount END), 0)::float as fin
      FROM expenses e
      JOIN expense_categories ec ON ec.name = e.category
      WHERE e.date >= ${prevStart} AND e.date <= ${prevEnd} AND ec.exclude_from_ebitda = true
    `) as { fin: number }[];

    const prevIncomeAdj = prevIncRows[0].adjusted;
    const prevExpOp = prevExpRows[0].atelier - prevExpFinRows[0].fin;
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
        mk("# transacciones egreso", expenses.length, prevExpRows[0].n),
      ],
    };
  }

  // B2B aging por cliente (simplificado: usa datos agregados)
  const b2bAtEnd = [{ client: "B2B (agregado)", date: end, total: b2bAtEndRows[0].total_byte, collected: b2bAtEndRows[0].total_collected, pending: b2bReceivablesAtEnd, aging: 0 }];

  return {
    period,
    generatedAt: new Date().toISOString(),
    hasData: incomes.length > 0 || expenses.length > 0,
    summary: {
      incomeGross,
      incomeAdjusted,
      fonaviReimbursements,
      expensesGross,
      expensesOperative,
      expensesFinancial,
      ebitda,
      ebitdaMargin,
      bankStart,
      bankEnd,
      bankDelta: bankEnd - bankStart,
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
  };
}
