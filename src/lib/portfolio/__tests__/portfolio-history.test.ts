/**
 * Tests de la vista histórica: proyección por ritmo real, movers del
 * periodo y curva de Pareto 80/20 sobre la utilidad.
 */
import { describe, it, expect } from "vitest";
import {
  projectNextMonth,
  computeMovers,
  computeParetoCurve,
  type MonthSummary,
} from "../history";

const mkMonth = (month: string, revenue: number, contribution: number): MonthSummary => ({
  month,
  monthLabel: month,
  revenue,
  contribution,
  costCoveragePct: 50,
  health: 70,
  products: 100,
});

describe("projectNextMonth — escenarios por ritmo real", () => {
  it("con <3 meses no proyecta (honestidad)", () => {
    expect(projectNextMonth([mkMonth("2026-05", 100, 50), mkMonth("2026-06", 110, 55)])).toBeNull();
  });

  it("conservador/esperado/optimista salen de las variaciones reales", () => {
    // 40000 → 36000 (−10%) → 39600 (+10%)
    const p = projectNextMonth([
      mkMonth("2026-04", 40000, 20000),
      mkMonth("2026-05", 36000, 18000),
      mkMonth("2026-06", 39600, 19800),
    ])!;
    expect(p).not.toBeNull();
    const by = (s: string) => p.scenarios.find((x) => x.scenario === s)!;
    expect(by("conservador").revenue).toBeCloseTo(39600 * 0.9, 0);
    expect(by("optimista").revenue).toBeCloseTo(39600 * 1.1, 0);
    expect(by("esperado").revenue).toBeCloseTo(39600 * 1.0, 0);
    // utilidad proyectada con el margen del último mes (50%)
    expect(by("esperado").contribution).toBeCloseTo(by("esperado").revenue * 0.5, 0);
    expect(p.basis).toMatch(/variaciones reales/);
  });

  it("con 3 meses o alta volatilidad la confianza es baja — no se regala", () => {
    const p = projectNextMonth([
      mkMonth("2026-04", 40000, 20000),
      mkMonth("2026-05", 36000, 18000),
      mkMonth("2026-06", 39600, 19800),
    ])!;
    expect(p.confidence).toBe("baja");
  });
});

describe("computeMovers — subidas y caídas del periodo", () => {
  it("compara primera vs última aparición y filtra el ruido", () => {
    const series = new Map([
      ["a", { name: "Cohete", points: [{ month: "2026-03", revenue: 1000 }, { month: "2026-06", revenue: 1800 }] }],
      ["b", { name: "Ancla", points: [{ month: "2026-03", revenue: 2000 }, { month: "2026-06", revenue: 1200 }] }],
      ["c", { name: "Ruido", points: [{ month: "2026-03", revenue: 10 }, { month: "2026-06", revenue: 30 }] }],
      ["d", { name: "UnMes", points: [{ month: "2026-06", revenue: 900 }] }],
    ]);
    const { risers, fallers } = computeMovers(series);
    expect(risers.map((m) => m.name)).toEqual(["Cohete"]);
    expect(risers[0].changePct).toBe(80);
    expect(fallers.map((m) => m.name)).toEqual(["Ancla"]);
    expect(fallers[0].changePct).toBe(-40);
  });
});

describe("computeParetoCurve — el 80/20 de la utilidad", () => {
  it("marca cuántos productos generan el 80% (caso 20/80 clásico)", () => {
    // 2 productos concentran 8000 de 10000 (80%); 8 aportan el resto.
    const products = [
      { name: "P1", contribution: 5000 },
      { name: "P2", contribution: 3000 },
      ...Array.from({ length: 8 }, (_, i) => ({ name: `Cola${i}`, contribution: 250 })),
    ];
    const r = computeParetoCurve(products);
    expect(r.top80Count).toBe(2);
    expect(r.top80SharePct).toBe(20); // 2 de 10 = el 20% clásico
    expect(r.points[0].inTop80).toBe(true);
    expect(r.points[5].inTop80).toBe(false);
    expect(r.points[r.points.length - 1].cumulativePct).toBe(100);
  });

  it("ignora productos sin costo o sin utilidad (no inventa ganancias)", () => {
    const r = computeParetoCurve([
      { name: "Bueno", contribution: 100 },
      { name: "SinCosto", contribution: null },
      { name: "Perdida", contribution: -50 },
    ]);
    expect(r.totalCount).toBe(1);
    expect(r.points.map((p) => p.name)).toEqual(["Bueno"]);
  });
});
