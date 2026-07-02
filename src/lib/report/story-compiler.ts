/**
 * EIRS · COMPILADOR: Facts → Intelligence → Narrative → ReportStory.
 *
 * Orquesta las tres capas manteniendo la separación estricta:
 *   - la inteligencia se calcula SOLO desde los hechos;
 *   - la narrativa se construye SOLO desde la inteligencia (buildNarrative
 *     ni siquiera recibe los hechos);
 *   - los renderers verán SOLO el Story.
 *
 * Reusa el Health Score canónico del Centro de Comando (mismas fórmulas
 * auditables que ve el dueño a diario — coherencia dashboard ↔ reporte).
 */

import {
  computeHealthScore,
  type BusinessFacts,
} from "@/lib/decision-intelligence";
import type {
  ReportFacts,
  ReportStory,
  UnitFacts,
  UnitIntelligence,
  ReportIntelligence,
} from "./types";
import { buildScorecard } from "./intelligence/scorecard";
import {
  detectStrengths,
  detectProblems,
  detectSurprises,
  detectWatchlist,
} from "./intelligence/findings";
import { detectRisks } from "./intelligence/risks";
import { detectOpportunities } from "./intelligence/opportunities";
import { buildProjections } from "./intelligence/projections";
import { buildDecisions } from "./intelligence/decisions";
import { buildBoardQuestions } from "./intelligence/board-questions";
import { buildNarrative } from "./narrative";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Adapta UnitFacts al contrato del Health Score canónico del dashboard. */
function toHealthFacts(f: UnitFacts): BusinessFacts {
  const prev = f.history.at(-1) ?? null;
  return {
    businessName: f.unit.name,
    today: `${f.month}-${String(f.daysInMonth).padStart(2, "0")}`,
    daysElapsed: f.daysInMonth, // mes cerrado: corte = mes completo
    daysInMonth: f.daysInMonth,
    bank: {
      balance: f.liquidity.bankEnd,
      hasDiscrepancy: f.reconciliation.hasDiscrepancy,
      discrepancyAmount: f.reconciliation.lastCheckDiff,
    },
    cash: f.liquidity.cashEnd,
    sales: { monthToDate: f.current.sales, prevMonthSameCut: prev?.sales ?? 0 },
    opExpenses: { monthToDate: f.current.opExpenses, prevMonthSameCut: prev?.opExpenses ?? 0 },
    avgDailyExpense8w: f.liquidity.avgDailyExpense,
    receivables: f.receivables
      ? {
          totalPending: f.receivables.totalPending,
          overdueAmount: f.receivables.overdueAmount,
          overdueCount: f.receivables.byDebtor.length,
          oldestDays: f.receivables.oldestDays,
          byDebtor: f.receivables.byDebtor.map((d) => ({ name: d.name, pending: d.pending })),
        }
      : { totalPending: 0, overdueAmount: 0, overdueCount: 0, oldestDays: 0, byDebtor: [] },
    partnerLoanPending: f.partnerLoanPending ?? 0,
    budgets: f.budget.map((b) => ({ category: b.category, budgetSoles: b.budgetSoles, spent: b.spent, color: b.color })),
    categoryTrends: f.categories.map((c) => ({
      category: c.category,
      monthToDate: c.amount,
      expectedToDate: c.avg3m,
      dailyAvg8w: r2(c.avg3m / 30),
      topMovements: c.topMovements,
    })),
  };
}

export function compileUnitIntelligence(f: UnitFacts): UnitIntelligence {
  const health = computeHealthScore(toHealthFacts(f));
  const risks = detectRisks(f);
  const opportunities = detectOpportunities(f);
  const projections = buildProjections(f);

  const months = [...f.history.map((h) => h.month), f.month];
  const basics = [...f.history, f.current];

  // Presupuesto: exceso puntual (pico del mes) vs estructural (gasto ≈ su
  // promedio de 3m → el presupuesto está desalineado, no el mes).
  const reds = f.budget.filter((b) => b.color === "red");
  const budgetSummary = f.capabilities.budgets && f.budget.length > 0
    ? {
        greens: f.budget.filter((b) => b.color === "green").length,
        yellows: f.budget.filter((b) => b.color === "yellow").length,
        reds: reds.length,
        excessSoles: r2(reds.reduce((s, b) => s + Math.max(0, b.spent - b.budgetSoles), 0)),
        structuralReds: reds
          .filter((b) => {
            const cat = f.categories.find((c) => c.category === b.category);
            return cat !== undefined && cat.avg3m > 0 && b.spent <= cat.avg3m * 1.1;
          })
          .map((b) => b.category),
        punctualReds: reds
          .filter((b) => {
            const cat = f.categories.find((c) => c.category === b.category);
            return !(cat !== undefined && cat.avg3m > 0 && b.spent <= cat.avg3m * 1.1);
          })
          .map((b) => b.category),
      }
    : null;

  return {
    unit: f.unit,
    healthScore: {
      total: health.total,
      level: health.levelLabel,
      components: health.components.map((c) => ({
        label: c.label, score: c.score, weight: c.weight, formula: c.formula,
      })),
    },
    kpis: buildScorecard(f),
    series: {
      months,
      sales: basics.map((b) => r2(b.sales)),
      ebitda: basics.map((b) => r2(b.ebitda)),
      margin: basics.map((b) => (b.sales > 0 ? r2((b.ebitda / b.sales) * 100) : 0)),
      liquidity: basics.map((b) => b.liquidityEnd),
    },
    budgetSummary,
    strengths: detectStrengths(f),
    problems: detectProblems(f),
    risks,
    opportunities,
    surprises: detectSurprises(f),
    watchlist: detectWatchlist(f),
    projections,
    decisions: buildDecisions(risks, opportunities),
    boardQuestions: buildBoardQuestions(f, { risks, opportunities, projections, budgetSummary }),
  };
}

/** Consolidado del grupo: suma de unidades (sin presupuesto: es por unidad). */
export function consolidateFacts(units: UnitFacts[], groupName: string): UnitFacts {
  const first = units[0];
  const months = first.history.map((h) => h.month);
  const sumBasics = (idx: number | "current") =>
    units.reduce(
      (acc, u) => {
        const b = idx === "current" ? u.current : u.history[idx];
        if (!b) return acc;
        acc.sales += b.sales;
        acc.opExpenses += b.opExpenses;
        acc.grossExpenses += b.grossExpenses;
        acc.ebitda += b.ebitda;
        if (b.liquidityEnd === null) acc.liquidityNull = true;
        else acc.liquidity += b.liquidityEnd;
        return acc;
      },
      { sales: 0, opExpenses: 0, grossExpenses: 0, ebitda: 0, liquidity: 0, liquidityNull: false },
    );

  const mk = (month: string, idx: number | "current") => {
    const s = sumBasics(idx);
    return {
      month,
      sales: r2(s.sales),
      opExpenses: r2(s.opExpenses),
      grossExpenses: r2(s.grossExpenses),
      ebitda: r2(s.ebitda),
      liquidityEnd: s.liquidityNull ? null : r2(s.liquidity),
    };
  };

  // Categorías fusionadas por nombre
  const catMap = new Map<string, { amount: number; avg3m: number; costGroup: string | null; topMovements: { concept: string; amount: number; date: string }[] }>();
  for (const u of units) {
    for (const c of u.categories) {
      const acc = catMap.get(c.category) ?? { amount: 0, avg3m: 0, costGroup: c.costGroup, topMovements: [] };
      acc.amount = r2(acc.amount + c.amount);
      acc.avg3m = r2(acc.avg3m + c.avg3m);
      acc.topMovements = [...acc.topMovements, ...c.topMovements].sort((a, b) => b.amount - a.amount).slice(0, 3);
      catMap.set(c.category, acc);
    }
  }

  const withReceivables = units.filter((u) => u.receivables);
  const receivables = withReceivables.length > 0
    ? {
        totalPending: r2(withReceivables.reduce((s, u) => s + u.receivables!.totalPending, 0)),
        overdueAmount: r2(withReceivables.reduce((s, u) => s + u.receivables!.overdueAmount, 0)),
        oldestDays: Math.max(...withReceivables.map((u) => u.receivables!.oldestDays)),
        byDebtor: withReceivables.flatMap((u) => u.receivables!.byDebtor),
      }
    : null;

  return {
    unit: { id: 0, code: "grupo", name: groupName },
    capabilities: {
      receivables: receivables !== null,
      partnerLoans: units.some((u) => u.capabilities.partnerLoans),
      budgets: false, // el presupuesto es por unidad; el consolidado no lo mezcla
      byteSales: units.some((u) => u.capabilities.byteSales),
    },
    month: first.month,
    daysInMonth: first.daysInMonth,
    current: mk(first.month, "current"),
    history: months.map((m, i) => mk(m, i)),
    categories: [...catMap.entries()].map(([category, v]) => ({ category, ...v })),
    budget: [],
    liquidity: {
      bankEnd: r2(units.reduce((s, u) => s + u.liquidity.bankEnd, 0)),
      cashEnd: r2(units.reduce((s, u) => s + u.liquidity.cashEnd, 0)),
      startOfMonth: units.every((u) => u.liquidity.startOfMonth !== null)
        ? r2(units.reduce((s, u) => s + (u.liquidity.startOfMonth ?? 0), 0))
        : null,
      avgDailyExpense: r2(units.reduce((s, u) => s + u.liquidity.avgDailyExpense, 0)),
    },
    receivables,
    partnerLoanPending: units.some((u) => u.partnerLoanPending !== null)
      ? r2(units.reduce((s, u) => s + (u.partnerLoanPending ?? 0), 0))
      : null,
    reconciliation: {
      lastCheckDate: null,
      lastCheckDiff: null,
      hasDiscrepancy: units.some((u) => u.reconciliation.hasDiscrepancy),
    },
    annex: {
      topExpenses: units.flatMap((u) => u.annex.topExpenses).sort((a, b) => b.amount - a.amount).slice(0, 20),
      expensesByCategory: (() => {
        const total = units.reduce((s, u) => s + u.current.opExpenses, 0);
        return [...catMap.entries()]
          .map(([category, v]) => ({ category, amount: v.amount, share: total > 0 ? r2((v.amount / total) * 100) : 0 }))
          .sort((a, b) => b.amount - a.amount);
      })(),
      movementCounts: {
        incomes: units.reduce((s, u) => s + u.annex.movementCounts.incomes, 0),
        expenses: units.reduce((s, u) => s + u.annex.movementCounts.expenses, 0),
      },
    },
  };
}

export function compileStory(facts: ReportFacts): ReportStory {
  const unitsIntel = facts.units.map(compileUnitIntelligence);

  let consolidated: UnitIntelligence | null = null;
  let groupComparison: ReportIntelligence["groupComparison"] = null;
  if (facts.scope.kind === "group") {
    const groupFacts = consolidateFacts(facts.units, "Grupo Yayi's");
    consolidated = compileUnitIntelligence(groupFacts);
    const byUnit = facts.units.map((u) => ({
      unit: u.unit,
      sales: r2(u.current.sales),
      ebitda: r2(u.current.ebitda),
      margin: u.current.sales > 0 ? r2((u.current.ebitda / u.current.sales) * 100) : 0,
      liquidity: r2(u.liquidity.bankEnd + u.liquidity.cashEnd),
    }));
    const withSales = byUnit.filter((x) => x.sales > 0);
    groupComparison = {
      byUnit,
      bestMarginUnitId: withSales.length ? withSales.reduce((a, b) => (a.margin >= b.margin ? a : b)).unit.id : null,
      worstMarginUnitId: withSales.length ? withSales.reduce((a, b) => (a.margin <= b.margin ? a : b)).unit.id : null,
    };
  }

  const primary = consolidated ?? unitsIntel[0];
  const title = facts.scope.kind === "group" ? "Grupo Yayi's" : facts.scope.unit.name;

  // PRINCIPIO: la narrativa recibe SOLO inteligencia (nunca los hechos).
  const narrative = buildNarrative(primary, { monthLabel: facts.monthLabel, title });

  return {
    meta: {
      scopeKind: facts.scope.kind,
      title,
      month: facts.month,
      monthLabel: facts.monthLabel,
      generatedAt: facts.generatedAt,
      confidential: true,
    },
    facts,
    intelligence: { units: unitsIntel, consolidated, groupComparison },
    narrative,
  };
}
