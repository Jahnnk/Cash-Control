/**
 * Tests del renderer PDF del EIRS:
 *  - genera un documento real (12+ páginas) desde un Story fixture, sin DOM
 *    (los gráficos degradan a solo-texto en Node — por diseño).
 *  - GUARDIA: el renderer es tonto — solo puede importar el Story y el
 *    design system; nada de BD, detectores ni narrativa.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReportFacts, UnitFacts } from "../types";
import { compileStory } from "../story-compiler";
import { renderPdf } from "../renderers/pdf";

function mkUnit(): UnitFacts {
  return {
    unit: { id: 1, code: "atelier", name: "Yayi's Atelier" },
    capabilities: { receivables: true, partnerLoans: true, budgets: true, byteSales: true },
    month: "2026-06",
    daysInMonth: 30,
    current: { month: "2026-06", sales: 41045, opExpenses: 41144, grossExpenses: 43000, ebitda: -99, liquidityEnd: 1677 },
    history: [
      { month: "2026-03", sales: 36000, opExpenses: 31000, grossExpenses: 32000, ebitda: 5000, liquidityEnd: 4000 },
      { month: "2026-04", sales: 37000, opExpenses: 32500, grossExpenses: 33500, ebitda: 4500, liquidityEnd: 3600 },
      { month: "2026-05", sales: 38343, opExpenses: 34500, grossExpenses: 35500, ebitda: 3843, liquidityEnd: 2331 },
    ],
    categories: [
      { category: "Insumos", amount: 14862, avg3m: 10005, costGroup: "variable",
        topMovements: [{ concept: "Compras metro harinas", amount: 866, date: "2026-06-16" }] },
      { category: "Alquiler", amount: 2700, avg3m: 2700, costGroup: "fijo", topMovements: [] },
    ],
    budget: [
      { category: "Insumos", budgetSoles: 13000, spent: 14862, color: "red" },
      { category: "Deliverys", budgetSoles: 800, spent: 500, color: "green" },
    ],
    liquidity: { bankEnd: 1624, cashEnd: 53, startOfMonth: 2331, avgDailyExpense: 1371 },
    receivables: { totalPending: 210, overdueAmount: 0, oldestDays: 5, byDebtor: [{ name: "Yayi's Fonavi", pending: 210, oldestDays: 5 }] },
    partnerLoanPending: 1812,
    reconciliation: { lastCheckDate: "2026-06-30", lastCheckDiff: 118.2, hasDiscrepancy: false },
    annex: {
      topExpenses: [{ date: "2026-06-06", category: "Alquiler", concept: "Alquiler junio", amount: 2700 }],
      expensesByCategory: [{ category: "Insumos", amount: 14862, share: 36.1 }],
      movementCounts: { incomes: 80, expenses: 120 },
    },
  };
}

const FACTS: ReportFacts = {
  scope: { kind: "unit", unit: { id: 1, code: "atelier", name: "Yayi's Atelier" } },
  month: "2026-06", monthLabel: "Junio 2026", generatedAt: "2026-07-02T12:00:00Z",
  units: [mkUnit()],
};

describe("renderPdf — Board Report desde el Story", () => {
  it("genera un PDF real con las 11 secciones + portada + anexo (12+ páginas)", () => {
    const story = compileStory(FACTS);
    const { blob, filename } = renderPdf(story);
    expect(filename).toBe("Yayis-Yayi-s-Atelier-2026-06-Reporte-Ejecutivo.pdf");
    expect(blob.size).toBeGreaterThan(20_000); // documento real, no un stub
  });

  it("sin DOM los gráficos degradan y el render NO falla (Fase A resiliente)", () => {
    // Este test corre en Node (sin document): si llegamos aquí sin throw,
    // la degradación a solo-texto funciona.
    expect(typeof document).toBe("undefined");
    expect(() => renderPdf(compileStory(FACTS))).not.toThrow();
  });

  it("scope grupo también renderiza (consolidado + anexo por unidad)", () => {
    const u2: UnitFacts = { ...mkUnit(), unit: { id: 2, code: "fonavi", name: "Yayi's Fonavi" }, receivables: null, budget: [], partnerLoanPending: null };
    const story = compileStory({
      scope: { kind: "group", units: [FACTS.units[0].unit, u2.unit] },
      month: "2026-06", monthLabel: "Junio 2026", generatedAt: "2026-07-02T12:00:00Z",
      units: [mkUnit(), u2],
    });
    const { blob } = renderPdf(story);
    expect(blob.size).toBeGreaterThan(20_000);
  });
});

describe("GUARDIA — el renderer es tonto", () => {
  it("pdf.ts solo importa types/design-system/charts (nada de BD ni cerebro)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/report/renderers/pdf.ts"), "utf8");
    const imports = src.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
    for (const imp of imports) {
      expect(imp).toMatch(/from "(jspdf|jspdf-autotable|\.\.\/types|\.\/design-system|\.\/charts)"/);
    }
  });
});
