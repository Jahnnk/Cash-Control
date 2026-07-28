import { describe, it, expect } from "vitest";
import {
  computeHealthScore,
  buildInsights,
  computeIntel,
  fmtS,
  type BusinessFacts,
} from "./decision-intelligence";

/** Negocio de referencia: sano, sin problemas. */
function healthyFacts(overrides: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Yayi's Atelier",
    today: "2026-07-15",
    daysElapsed: 15,
    daysInMonth: 31,
    // 20,000 + 300 de caja con gasto de 1,000/día = ~20 días de cobertura
    // (por encima del umbral de aviso de 15 días → de verdad "sano").
    bank: { balance: 20000, hasDiscrepancy: false, discrepancyAmount: null },
    cash: 300,
    sales: { monthToDate: 20000, prevMonthSameCut: 18000 },
    opExpenses: { monthToDate: 15000, prevMonthSameCut: 14500 },
    avgDailyExpense8w: 1000,
    receivables: { totalPending: 0, overdueAmount: 0, overdueCount: 0, oldestDays: 0, byDebtor: [] },
    partnerLoanPending: 0,
    budgets: [
      { category: "Insumos", budgetSoles: 8000, spent: 5000, color: "green" },
      { category: "Planilla", budgetSoles: 6000, spent: 3000, color: "green" },
    ],
    categoryTrends: [],
    ...overrides,
  };
}

describe("computeHealthScore", () => {
  it("negocio sano → nivel sano y componentes altos", () => {
    const h = computeHealthScore(healthyFacts());
    expect(h.total).toBeGreaterThanOrEqual(80);
    expect(h.level).toBe("sano");
    expect(h.components).toHaveLength(5);
    for (const c of h.components) expect(c.score).toBeGreaterThanOrEqual(0);
    // pesos suman 1
    expect(h.components.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 5);
  });

  it("negocio en crisis → nivel crítico", () => {
    const h = computeHealthScore(
      healthyFacts({
        bank: { balance: 500, hasDiscrepancy: true, discrepancyAmount: 800 },
        cash: 0,
        sales: { monthToDate: 5000, prevMonthSameCut: 9000 },
        opExpenses: { monthToDate: 7000, prevMonthSameCut: 6000 },
        receivables: { totalPending: 2000, overdueAmount: 1800, overdueCount: 4, oldestDays: 70, byDebtor: [{ name: "Fonavi", pending: 1800 }] },
        budgets: [
          { category: "Insumos", budgetSoles: 3000, spent: 4500, color: "red" },
          { category: "Deliverys", budgetSoles: 500, spent: 700, color: "red" },
        ],
      }),
    );
    expect(h.total).toBeLessThan(40);
    expect(h.level).toBe("critico");
  });

  it("los puntajes quedan siempre entre 0 y 100", () => {
    const extreme = computeHealthScore(
      healthyFacts({
        bank: { balance: -5000, hasDiscrepancy: false, discrepancyAmount: null },
        cash: -1000,
        sales: { monthToDate: 0, prevMonthSameCut: 0 },
        opExpenses: { monthToDate: 99999, prevMonthSameCut: 0 },
      }),
    );
    for (const c of extreme.components) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("buildInsights — reglas", () => {
  it("negocio sano: sin críticos ni avisos", () => {
    const ins = buildInsights(healthyFacts());
    expect(ins.filter((i) => i.severity === "critico")).toHaveLength(0);
    expect(ins.filter((i) => i.severity === "aviso")).toHaveLength(0);
  });

  it("descuadre con el banco → crítico con acción a conciliación", () => {
    const ins = buildInsights(
      healthyFacts({ bank: { balance: 8000, hasDiscrepancy: true, discrepancyAmount: 118.2 } }),
    );
    const d = ins.find((i) => i.id === "descuadre-banco");
    expect(d?.severity).toBe("critico");
    expect(d?.impact).toBeCloseTo(118.2, 2);
    expect(d?.action?.href).toContain("conciliacion");
  });

  it("caja negativa → crítico (dato imposible)", () => {
    const ins = buildInsights(healthyFacts({ cash: -3464.59 }));
    expect(ins.find((i) => i.id === "caja-negativa")?.severity).toBe("critico");
  });

  it("categoría disparada: explica cuánto, por qué (top movimientos) y proyecta el impacto", () => {
    const ins = buildInsights(
      healthyFacts({
        categoryTrends: [{
          category: "Insumos",
          monthToDate: 3240,
          expectedToDate: 2000,
          dailyAvg8w: 133,
          topMovements: [
            { concept: "Compras metro harinas", amount: 865.77, date: "2026-07-10" },
            { concept: "Mantequilla 10kg", amount: 360.48, date: "2026-07-11" },
          ],
        }],
      }),
    );
    const c = ins.find((i) => i.id === "categoria-alta-Insumos");
    expect(c?.severity).toBe("aviso");
    expect(c?.impact).toBeCloseTo(1240, 0);           // S/1,240 sobre lo esperado
    expect(c?.why).toContain("Compras metro harinas"); // atribución
    expect(c?.consequence).toMatch(/margen|encima/);   // proyección
  });

  it("subida chica (menos de S/100 y <25%) NO genera ruido", () => {
    const ins = buildInsights(
      healthyFacts({
        categoryTrends: [{
          category: "Oficina", monthToDate: 260, expectedToDate: 220, dailyAvg8w: 15, topMovements: [],
        }],
      }),
    );
    expect(ins.find((i) => i.id === "categoria-alta-Oficina")).toBeUndefined();
  });

  it("categoría muy por debajo del promedio → oportunidad (ahorro)", () => {
    const ins = buildInsights(
      healthyFacts({
        categoryTrends: [{
          category: "Packaging", monthToDate: 100, expectedToDate: 400, dailyAvg8w: 27, topMovements: [],
        }],
      }),
    );
    expect(ins.find((i) => i.id === "categoria-baja-Packaging")?.severity).toBe("oportunidad");
  });

  it("ventas cayendo ≥10% al mismo corte → aviso con proyección de cierre", () => {
    const ins = buildInsights(
      healthyFacts({ sales: { monthToDate: 14000, prevMonthSameCut: 18000 } }),
    );
    const v = ins.find((i) => i.id === "ventas-cayendo");
    expect(v?.severity).toBe("aviso");
    expect(v?.consequence).toContain("cerraría");
  });

  // Auditoría de Jahnn (28-jul-2026): la alerta comparaba TODO el mes
  // actual contra el mes pasado hasta el mismo número de día, sin mirar
  // si ambos lados tenían la misma cantidad de días CON DATOS.
  it("caso Fonavi: usa los días emparejados, no el -22.7% de ventanas dispares", () => {
    const ins = buildInsights(
      healthyFacts({
        sales: {
          monthToDate: 25726.27,       // 24 días de julio (Kelly sube los viernes)
          prevMonthSameCut: 33291.41,  // 27 días de junio → el -22.7% mentiroso
          comparison: {
            sameDay: { current: 25726.27, previous: 30494.39, pct: -15.64, daysCompared: 24 },
            weekdayAligned: { current: 24825.87, previous: 28145.79, pct: -11.8, daysCompared: 21 },
            weekdayShift: 2, throughDay: 24, lowCoverage: false,
          },
        },
      }),
    );
    const v = ins.find((i) => i.id === "ventas-cayendo");
    expect(v?.title).toContain("-15.6");        // no -22.7
    expect(v?.what).toContain("24 días");        // dice cuántos comparó
    expect(v?.what).toContain("-11.8%");         // y la lectura por día de semana
    expect(v?.severity).toBe("aviso");
  });

  it("caso Centro: 24 días vs 7 no inventa un +167.8% de crecimiento", () => {
    const ins = buildInsights(
      healthyFacts({
        sales: {
          monthToDate: 23373.97,      // 24 días de julio
          prevMonthSameCut: 8727.99,  // solo 7 días de junio cargados
          comparison: {
            sameDay: { current: 7561.72, previous: 8727.99, pct: -13.36, daysCompared: 7 },
            weekdayAligned: { current: 7561.72, previous: 8727.99, pct: -13.36, daysCompared: 7 },
            weekdayShift: 2, throughDay: 24, lowCoverage: true,
          },
        },
      }),
    );
    expect(ins.find((i) => i.id === "ventas-subiendo")).toBeUndefined();
    const v = ins.find((i) => i.id === "ventas-cayendo");
    expect(v?.title).toContain("-13.4");
    expect(v?.severity).toBe("info");            // cobertura baja: no grita
    expect(v?.what).toContain("Solo 7 días comparables");
  });

  it("CxC al día → oportunidad de cobro; vencidas → aviso con mayor deudor", () => {
    const alDia = buildInsights(
      healthyFacts({
        receivables: { totalPending: 1097.71, overdueAmount: 0, overdueCount: 0, oldestDays: 5, byDebtor: [{ name: "Fonavi", pending: 997.71 }, { name: "Centro", pending: 100 }] },
      }),
    );
    expect(alDia.find((i) => i.id === "cxc-cobrable")?.severity).toBe("oportunidad");

    const vencidas = buildInsights(
      healthyFacts({
        receivables: { totalPending: 900, overdueAmount: 861.65, overdueCount: 1, oldestDays: 23, byDebtor: [{ name: "Fonavi", pending: 861.65 }] },
      }),
    );
    const v = vencidas.find((i) => i.id === "cxc-vencidas");
    expect(v?.severity).toBe("aviso");
    expect(v?.why).toContain("Fonavi");
  });

  it("orden: críticos primero, luego avisos, y por impacto descendente", () => {
    const ins = buildInsights(
      healthyFacts({
        cash: -500,
        bank: { balance: 20000, hasDiscrepancy: true, discrepancyAmount: 2000 },
        sales: { monthToDate: 14000, prevMonthSameCut: 18000 },
      }),
    );
    const sevs = ins.map((i) => i.severity);
    const firstAviso = sevs.indexOf("aviso");
    const lastCritico = sevs.lastIndexOf("critico");
    expect(lastCritico).toBeLessThan(firstAviso === -1 ? sevs.length : firstAviso);
    // dentro de críticos, el de mayor impacto (2000) va antes que la caja (500)
    expect(ins[0].id).toBe("descuadre-banco");
  });
});

describe("computeIntel / Executive Brief", () => {
  it("negocio sano: headline sano y sin temas urgentes", () => {
    const intel = computeIntel(healthyFacts());
    expect(intel.brief.headline).toContain("sano");
    expect(intel.brief.topIssues).toHaveLength(0);
    expect(intel.brief.summary).toContain("margen");
  });

  it("con problemas: máximo 3 temas del día, el primero es el más grave", () => {
    const intel = computeIntel(
      healthyFacts({
        cash: -500,
        bank: { balance: 20000, hasDiscrepancy: true, discrepancyAmount: 2000 },
        sales: { monthToDate: 14000, prevMonthSameCut: 18000 },
        receivables: { totalPending: 900, overdueAmount: 861, overdueCount: 1, oldestDays: 30, byDebtor: [{ name: "Fonavi", pending: 861 }] },
      }),
    );
    expect(intel.brief.topIssues.length).toBeLessThanOrEqual(3);
    expect(intel.brief.topIssues[0].id).toBe("descuadre-banco");
    // Pase CEO: el resumen NO repite el tema #1 (eso vive en "La acción de hoy")
    expect(intel.brief.summary).not.toContain("Lo más importante");
    expect(intel.brief.summary).toContain("margen");
  });

  it("'Hoy te recomiendo': hasta 3 acciones únicas, con consejo de conducta si la liquidez está corta", () => {
    const intel = computeIntel(
      healthyFacts({
        bank: { balance: 1500, hasDiscrepancy: true, discrepancyAmount: 118.2 },
        cash: 100,
        receivables: { totalPending: 209.99, overdueAmount: 0, overdueCount: 0, oldestDays: 4, byDebtor: [{ name: "Fonavi", pending: 209.99 }] },
      }),
    );
    const recs = intel.brief.recommendations;
    expect(recs.length).toBeGreaterThanOrEqual(2);
    expect(recs.length).toBeLessThanOrEqual(3);
    // sin duplicados
    expect(new Set(recs.map((r) => r.label)).size).toBe(recs.length);
    // liquidez corta → aparece el consejo de conducta (href null)
    expect(recs.some((r) => r.href === null && /gastos extraordinarios/.test(r.label))).toBe(true);
  });

  it("la acción #1 trae beneficio cuantificado, costo de no actuar y su porqué", () => {
    const intel = computeIntel(
      healthyFacts({
        bank: { balance: 20000, hasDiscrepancy: true, discrepancyAmount: 118.2 },
      }),
    );
    const top = intel.brief.recommendations[0];
    expect(top.label).toContain("cuadre");
    expect(top.benefit).toContain("118");            // beneficio cuantificado
    expect(top.inactionCost).toContain("inconsistente"); // costo de no actuar
    expect(intel.brief.topActionReason).toContain("#1");  // por qué es la primera
    expect(intel.brief.topActionReason).toContain("118"); // con el impacto en soles
  });

  it("el desglose del Health Score es auditable: toda componente tiene fórmula con sus datos", () => {
    const h = computeIntel(healthyFacts()).health;
    for (const c of h.components) {
      expect(c.formula.length).toBeGreaterThan(10);
    }
    const liq = h.components.find((c) => c.key === "liquidez")!;
    expect(liq.formula).toContain("÷");     // la operación
    expect(liq.formula).toContain("escala"); // y la escala de puntaje
  });

  it("negocio sano: recomendaciones vacías o solo cobrables (nada urgente)", () => {
    const intel = computeIntel(healthyFacts());
    expect(intel.brief.recommendations.every((r) => !/investigar|revisar/i.test(r.label))).toBe(true);
  });

  it("oportunidades limitadas a 2", () => {
    const intel = computeIntel(
      healthyFacts({
        sales: { monthToDate: 22000, prevMonthSameCut: 18000 },
        receivables: { totalPending: 500, overdueAmount: 0, overdueCount: 0, oldestDays: 3, byDebtor: [{ name: "Centro", pending: 500 }] },
        categoryTrends: [
          { category: "Packaging", monthToDate: 50, expectedToDate: 400, dailyAvg8w: 27, topMovements: [] },
          { category: "Fletes", monthToDate: 100, expectedToDate: 500, dailyAvg8w: 33, topMovements: [] },
        ],
      }),
    );
    expect(intel.brief.opportunities.length).toBeLessThanOrEqual(2);
  });
});

describe("inicio de mes (día 1–2): sin falsas alarmas", () => {
  it("día 1 con ventas 0 no dispara 'ventas cayendo' ni castiga crecimiento", () => {
    const f = healthyFacts({
      daysElapsed: 1,
      sales: { monthToDate: 0, prevMonthSameCut: 1944.13 },
      opExpenses: { monthToDate: 1051.65, prevMonthSameCut: 0 },
      categoryTrends: [{
        category: "Insumos", monthToDate: 661.65, expectedToDate: 40, dailyAvg8w: 40, topMovements: [],
      }],
    });
    const ins = buildInsights(f);
    expect(ins.find((i) => i.id === "ventas-cayendo")).toBeUndefined();
    expect(ins.find((i) => i.id === "categoria-alta-Insumos")).toBeUndefined();
    const h = computeHealthScore(f);
    const crecimiento = h.components.find((c) => c.key === "crecimiento")!;
    expect(crecimiento.score).toBe(60); // neutral, no 0
    expect(crecimiento.detail).toContain("temprano");
  });

  it("desde el día 5 las reglas de categoría sí evalúan", () => {
    const ins = buildInsights(
      healthyFacts({
        daysElapsed: 5,
        categoryTrends: [{
          category: "Insumos", monthToDate: 900, expectedToDate: 200, dailyAvg8w: 40, topMovements: [],
        }],
      }),
    );
    expect(ins.find((i) => i.id === "categoria-alta-Insumos")).toBeDefined();
  });
});

describe("fmtS", () => {
  it("formatea soles es-PE con signo", () => {
    expect(fmtS(1240)).toContain("1,240");
    expect(fmtS(-50.5)).toContain("−");
  });
});
