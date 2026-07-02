/**
 * Tests del cerebro EIRS: inteligencia (detectores, proyecciones,
 * decisiones), narrativa (prosa desde inteligencia), compilador (unidad y
 * grupo) y la GUARDIA DE SEPARACIÓN de capas (principio aprobado).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { UnitFacts, ReportFacts } from "../types";
import { compileUnitIntelligence, consolidateFacts, compileStory } from "../story-compiler";
import { buildNarrative } from "../narrative";

// ── Fixture: unidad con mes movido (basada en números reales de Yayi's) ──
function mkUnit(overrides: Partial<UnitFacts> = {}): UnitFacts {
  return {
    unit: { id: 1, code: "atelier", name: "Yayi's Atelier" },
    capabilities: { receivables: true, partnerLoans: true, budgets: true, byteSales: true },
    month: "2026-06",
    daysInMonth: 30,
    current: { month: "2026-06", sales: 33938, opExpenses: 29477, grossExpenses: 31000, ebitda: 4461, liquidityEnd: 1607 },
    history: [
      { month: "2026-03", sales: 30000, opExpenses: 26000, grossExpenses: 27000, ebitda: 4000, liquidityEnd: 5200 },
      { month: "2026-04", sales: 31000, opExpenses: 27500, grossExpenses: 28500, ebitda: 3500, liquidityEnd: 4300 },
      { month: "2026-05", sales: 32000, opExpenses: 27000, grossExpenses: 28000, ebitda: 5000, liquidityEnd: 3900 },
    ],
    categories: [
      { category: "Insumos", amount: 15000, avg3m: 12000, costGroup: "variable",
        topMovements: [{ concept: "Compras metro harinas", amount: 865.77, date: "2026-06-16" }] },
      { category: "Alquiler", amount: 2700, avg3m: 2700, costGroup: "fijo", topMovements: [{ concept: "Alquiler junio", amount: 2700, date: "2026-06-06" }] },
      { category: "Packaging", amount: 100, avg3m: 400, costGroup: "variable", topMovements: [] },
    ],
    budget: [
      { category: "Insumos", budgetSoles: 13000, spent: 15000, color: "red" },
      { category: "Deliverys", budgetSoles: 800, spent: 500, color: "green" },
    ],
    liquidity: { bankEnd: 1554, cashEnd: 53, startOfMonth: 3900, avgDailyExpense: 982 },
    receivables: {
      totalPending: 1097.71, overdueAmount: 861.65, oldestDays: 23,
      byDebtor: [{ name: "Yayi's Fonavi", pending: 997.71, oldestDays: 23 }, { name: "Yayi's Centro", pending: 100, oldestDays: 5 }],
    },
    partnerLoanPending: 1812,
    reconciliation: { lastCheckDate: "2026-06-30", lastCheckDiff: 118.2, hasDiscrepancy: false },
    annex: {
      topExpenses: [{ date: "2026-06-06", category: "Alquiler", concept: "Alquiler junio", amount: 2700 }],
      expensesByCategory: [{ category: "Insumos", amount: 15000, share: 50.9 }],
      movementCounts: { incomes: 80, expenses: 120 },
    },
    ...overrides,
  };
}

describe("inteligencia — scorecard y hallazgos", () => {
  const intel = compileUnitIntelligence(mkUnit());

  it("scorecard: KPIs núcleo presentes con semáforo y variación", () => {
    const ids = intel.kpis.map((k) => k.id);
    for (const req of ["ingresos", "ebitda", "margen", "flujo", "liquidez", "banco", "caja", "presupuesto", "por-cobrar"]) {
      expect(ids).toContain(req);
    }
    const ventas = intel.kpis.find((k) => k.id === "ingresos")!;
    expect(ventas.deltaPct).toBeCloseTo(6.1, 1); // 33938 vs 32000
    expect(ventas.traffic).toBe("verde");
    const flujo = intel.kpis.find((k) => k.id === "flujo")!;
    expect(flujo.value).toBeCloseTo(1607 - 3900, 0);
    expect(flujo.traffic).toBe("rojo"); // cayó más del 25% del inicio
  });

  it("detecta logros (ventas +6%, ahorro en Packaging) y problemas (Insumos +25%)", () => {
    expect(intel.strengths.some((s) => s.id === "logro-ventas")).toBe(true);
    expect(intel.strengths.some((s) => s.id === "logro-ahorro-Packaging")).toBe(true);
    const insumos = intel.problems.find((p) => p.id === "problema-categoria-Insumos");
    expect(insumos?.impact).toBe(3000); // 15000 - 12000
  });

  it("riesgos ordenados por gravedad e impacto, con mitigación y consecuencia", () => {
    expect(intel.risks.length).toBeGreaterThanOrEqual(3); // liquidez, cxc, conciliación, presupuesto
    const liq = intel.risks.find((r) => r.id === "riesgo-liquidez")!;
    expect(liq.severity).toBe("alta"); // ~1.6 días de cobertura
    expect(liq.mitigationId).toBe("cobrar-y-frenar");
    const sevs = intel.risks.map((r) => r.severity);
    const firstMedia = sevs.indexOf("media");
    expect(sevs.lastIndexOf("alta")).toBeLessThan(firstMedia === -1 ? sevs.length : firstMedia);
  });

  it("oportunidades con impacto/prioridad/facilidad/plazo (cobrar #1 por vencidas)", () => {
    const cobrar = intel.opportunities.find((o) => o.id === "op-cobrar")!;
    expect(cobrar.priority).toBe(1);
    expect(cobrar.impact).toBeCloseTo(1097.71, 2);
    const reducir = intel.opportunities.find((o) => o.id === "op-reducir-Insumos")!;
    expect(reducir.impact).toBe(3000);
  });

  it("proyecciones: 3 escenarios desde flujos reales + confianza con base declarada", () => {
    const ps = intel.projections;
    expect(ps.scenarios.map((s) => s.scenario)).toEqual(["conservador", "esperado", "optimista"]);
    // Flujos: 4300-5200=-900, 3900-4300=-400, 1607-3900=-2293 → min -2293, max -400
    const cons = ps.scenarios[0], opt = ps.scenarios[2];
    expect(cons.liquidityEndNextMonth).toBeCloseTo(1607 - 2293, 0);
    expect(opt.liquidityEndNextMonth).toBeCloseTo(1607 - 400, 0);
    expect(["alta", "media"]).toContain(ps.confidence); // mismo signo (todo negativo)
    expect(ps.confidenceBasis.length).toBeGreaterThan(5);
    for (const s of ps.scenarios) expect(s.basis).toContain("flujo");
  });

  it("plan de acción: ≤5 decisiones, ordenadas por impacto, trazables y sin duplicados", () => {
    expect(intel.decisions.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < intel.decisions.length; i++) {
      expect(intel.decisions[i - 1].impact).toBeGreaterThanOrEqual(intel.decisions[i].impact);
    }
    expect(new Set(intel.decisions.map((d) => d.action)).size).toBe(intel.decisions.length);
    for (const d of intel.decisions) expect(d.sourceFindingId.length).toBeGreaterThan(0);
  });

  it("presupuesto: Insumos en rojo es PUNTUAL (gastó sobre su promedio), no estructural", () => {
    // spent 15000 > avg3m 12000 * 1.1 → pico del mes
    expect(intel.budgetSummary?.punctualReds).toContain("Insumos");
    expect(intel.budgetSummary?.structuralReds).not.toContain("Insumos");
    expect(intel.budgetSummary?.excessSoles).toBe(2000);
  });

  it("presupuesto ESTRUCTURAL cuando el gasto rojo ≈ su promedio histórico", () => {
    const f = mkUnit();
    f.categories[0] = { ...f.categories[0], avg3m: 14800 }; // gasto 15000 ≈ promedio
    const i2 = compileUnitIntelligence(f);
    expect(i2.budgetSummary?.structuralReds).toContain("Insumos");
  });
});

describe("narrativa — prosa ejecutiva desde la inteligencia", () => {
  const intel = compileUnitIntelligence(mkUnit());
  const n = buildNarrative(intel, { monthLabel: "Junio 2026", title: "Yayi's Atelier" });

  it("executive summary: cierre + logro + problema + riesgo + oportunidad + ≤3 decisiones", () => {
    expect(n.executiveSummary.closing.text).toContain("Junio 2026");
    expect(n.executiveSummary.closing.text).toContain("Salud del negocio");
    expect(n.executiveSummary.achievement?.text).toContain("logro");
    expect(n.executiveSummary.problem?.text.toLowerCase()).toContain("insumos");
    expect(n.executiveSummary.risk?.text).toContain("Gravedad");
    expect(n.executiveSummary.keyDecisions.length).toBeLessThanOrEqual(3);
  });

  it("toda la prosa lleva trazabilidad (derivedFrom) hacia la inteligencia", () => {
    const all = [
      n.executiveSummary.closing,
      ...(n.executiveSummary.achievement ? [n.executiveSummary.achievement] : []),
      ...Object.values(n.sections).flat(),
    ];
    for (const p of all.filter((x) => x.text !== "Mes sin desviaciones relevantes frente a su comportamiento histórico.")) {
      expect(Array.isArray(p.derivedFrom)).toBe(true);
    }
  });

  it("análisis del mes atribuye el empuje del gasto a las categorías responsables", () => {
    const texts = n.sections["month-analysis"].map((p) => p.text).join(" ");
    expect(texts).toContain("Insumos");
    expect(texts).toContain("promedio");
  });

  it("proyecciones: 3 escenarios + confianza + 'no es certeza'", () => {
    const t = n.sections.projections[0].text;
    expect(t).toContain("conservador");
    expect(t).toContain("esperado");
    expect(t).toContain("optimista");
    expect(t).toContain("Confianza");
    expect(t).toContain("no una certeza");
  });

  it("cada riesgo tiene su mitigación en el catálogo", () => {
    for (const r of intel.risks) {
      expect(n.mitigations[r.mitigationId]?.length).toBeGreaterThan(10);
    }
  });

  it("comentario de una línea por cada KPI del scorecard", () => {
    for (const k of intel.kpis) {
      expect(n.kpiComments[k.id]?.length).toBeGreaterThan(3);
    }
  });
});

describe("preguntas del directorio + cierre 'si actuamos'", () => {
  const intel = compileUnitIntelligence(mkUnit());

  it("máximo 3 preguntas, formuladas para RESOLVERSE, con contexto y trazables", () => {
    expect(intel.boardQuestions.length).toBeLessThanOrEqual(3);
    expect(intel.boardQuestions.length).toBeGreaterThan(0);
    for (const q of intel.boardQuestions) {
      expect(q.question).toMatch(/^¿.*\?$/);      // pregunta cerrada, decidible
      expect(q.context.length).toBeGreaterThan(10);
      expect(q.sourceFindingId.length).toBeGreaterThan(0);
    }
  });

  it("la deuda al socio sin calendario genera pregunta de directorio", () => {
    expect(intel.boardQuestions.some((q) => q.id === "q-deuda-socio" || q.id === "q-regimen-gasto")).toBe(true);
  });

  it("presupuesto ESTRUCTURAL genera la pregunta re-presupuestar vs reducir", () => {
    const f = mkUnit();
    f.categories[0] = { ...f.categories[0], avg3m: 14800 }; // rojo ≈ promedio → estructural
    const i2 = compileUnitIntelligence(f);
    expect(i2.boardQuestions.some((q) => q.id === "q-presupuesto-estructural")).toBe(true);
  });

  it("el cierre narra qué esperamos si actuamos (impacto combinado + honestidad)", () => {
    const n = buildNarrative(intel, { monthLabel: "Junio 2026", title: "Yayi's Atelier" });
    expect(n.boardClose.expectedOutcome.text).toContain("impacto combinado");
    expect(n.boardClose.expectedOutcome.text).toContain("no son perfectamente aditivos");
    expect(n.boardClose.questions.length).toBe(intel.boardQuestions.length);
  });
});

describe("GUARDIA DE SEPARACIÓN — la narrativa no puede ver los hechos", () => {
  it("narrative.ts no importa hechos, detectores ni BD (solo tipos de inteligencia)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/report/narrative.ts"), "utf8");
    const imports = src.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
    const flat = imports.join("\n");
    // No puede importar los tipos de hechos ni módulos con acceso a datos.
    expect(flat).not.toMatch(/\bReportFacts\b|\bUnitFacts\b|\bCategoryMonth\b|\bBudgetFact\b/);
    expect(flat).not.toMatch(/from "\.\/intelligence|@\/db|@neondatabase|\.\.\/\.\.\/app/);
    // Solo se permite importar de ./types.
    for (const imp of imports) {
      expect(imp).toContain('from "./types"');
    }
  });
});

describe("compilador — unidad y grupo", () => {
  it("scope unidad: story completo con meta confidencial", () => {
    const facts: ReportFacts = {
      scope: { kind: "unit", unit: { id: 1, code: "atelier", name: "Yayi's Atelier" } },
      month: "2026-06", monthLabel: "Junio 2026", generatedAt: "2026-07-01T12:00:00Z",
      units: [mkUnit()],
    };
    const story = compileStory(facts);
    expect(story.meta.confidential).toBe(true);
    expect(story.meta.title).toBe("Yayi's Atelier");
    expect(story.intelligence.consolidated).toBeNull();
    expect(story.narrative.executiveSummary.closing.text.length).toBeGreaterThan(40);
  });

  it("scope grupo: consolida unidades y compara márgenes", () => {
    const u1 = mkUnit();
    const u2 = mkUnit({
      unit: { id: 2, code: "fonavi", name: "Yayi's Fonavi" },
      capabilities: { receivables: false, partnerLoans: false, budgets: false, byteSales: true },
      current: { month: "2026-06", sales: 10000, opExpenses: 9500, grossExpenses: 9700, ebitda: 500, liquidityEnd: 800 },
      receivables: null, partnerLoanPending: null, budget: [],
    });
    const facts: ReportFacts = {
      scope: { kind: "group", units: [u1.unit, u2.unit] },
      month: "2026-06", monthLabel: "Junio 2026", generatedAt: "2026-07-01T12:00:00Z",
      units: [u1, u2],
    };
    const story = compileStory(facts);
    expect(story.meta.title).toBe("Grupo Yayi's");
    expect(story.intelligence.consolidated).not.toBeNull();
    expect(story.intelligence.consolidated!.kpis.find((k) => k.id === "ingresos")!.value).toBe(43938);
    const cmp = story.intelligence.groupComparison!;
    expect(cmp.byUnit).toHaveLength(2);
    expect(cmp.bestMarginUnitId).toBe(1);  // 13.1% vs 5%
    expect(cmp.worstMarginUnitId).toBe(2);
  });

  it("consolidateFacts: sin presupuesto mezclado y CxC solo de quien las tiene", () => {
    const g = consolidateFacts([mkUnit(), mkUnit({ unit: { id: 3, code: "centro", name: "Yayi's Centro" }, receivables: null, budget: [] })], "Grupo Yayi's");
    expect(g.capabilities.budgets).toBe(false);
    expect(g.receivables?.totalPending).toBeCloseTo(1097.71, 2);
    expect(g.current.sales).toBe(33938 * 2);
  });
});
