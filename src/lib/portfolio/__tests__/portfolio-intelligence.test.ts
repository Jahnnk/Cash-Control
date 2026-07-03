/**
 * Tests del cerebro PIC (Fase 1): clasificaciones, síntesis de veredicto
 * único, Health Score auditable, recomendaciones y honestidad estructural.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PortfolioFacts, ProductFacts } from "../types";
import { compilePortfolioStory } from "../story-compiler";
import { classifyAbc, classifyMenuEng, computeBaseMetrics } from "../intelligence";

const mk = (over: Partial<ProductFacts>): ProductFacts => ({
  productId: "p-" + (over.name ?? "x"),
  key: "p-" + (over.name ?? "x"),
  name: over.name ?? "Producto",
  category: "Cat",
  units: 100,
  revenue: 1000,
  avgPrice: 10,
  unitCogs: 4,
  listPrice: 10,
  targetMarginPct: 0.6,
  ...over,
});

/** Portafolio fixture: estrella, plow horse bajo objetivo, puzzle, dog, sin costo. */
function facts(): PortfolioFacts {
  return {
    scope: { businessId: 3, businessName: "Yayi's Centro" },
    month: "2026-06",
    monthLabel: "Junio 2026",
    generatedAt: "2026-07-02T12:00:00Z",
    historyMonths: ["2026-06"],
    products: [
      // Estrella: popular y rentable (margen 60% = objetivo)
      mk({ name: "Estrella", units: 500, revenue: 5000, avgPrice: 10, unitCogs: 4 }),
      // Plow horse: MUY popular, margen 20% (objetivo 60%) → ajustar precio
      mk({ name: "Caballito", units: 600, revenue: 3000, avgPrice: 5, unitCogs: 4 }),
      // Puzzle: margen altísimo, poca rotación
      mk({ name: "Joya", units: 20, revenue: 600, avgPrice: 30, unitCogs: 6 }),
      // Dog: poca rotación y poca contribución
      mk({ name: "Perrito", units: 10, revenue: 60, avgPrice: 6, unitCogs: 5 }),
      // Sin costo: vende fuerte pero sin receta
      mk({ name: "Misterio", units: 300, revenue: 2900, avgPrice: 9.67, unitCogs: null, targetMarginPct: null }),
    ],
  };
}

describe("cerebro PIC — clasificaciones", () => {
  it("ABC por Pareto de venta (incluye los sin costo)", () => {
    const metrics = computeBaseMetrics(facts());
    const abc = classifyAbc(metrics);
    expect(abc.get("p-Estrella")).toBe("A");
    // Misterio (sin costo) entra al Pareto igual: su venta es real.
    // 3° por venta → acumulado 94.3% → clase B.
    expect(abc.get("p-Misterio")).toBe("B");
    expect(abc.get("p-Perrito")).toBe("C");
  });

  it("Menu Engineering clasifica solo costeados, con umbrales Kasavana-Smith", () => {
    const metrics = computeBaseMetrics(facts());
    const { quadrants } = classifyMenuEng(metrics);
    expect(quadrants.get("p-Estrella")?.q).toBe("star");
    expect(quadrants.get("p-Caballito")?.q).toBe("plow_horse");
    expect(quadrants.get("p-Joya")?.q).toBe("puzzle");
    expect(quadrants.get("p-Perrito")?.q).toBe("dog");
    expect(quadrants.has("p-Misterio")).toBe(false); // sin costo: no clasificable
  });
});

describe("cerebro PIC — síntesis de veredicto único", () => {
  const story = compilePortfolioStory(facts());
  const byName = (n: string) => story.intelligence.products.find((p) => p.name === n)!;

  it("cada producto recibe EXACTAMENTE un veredicto con razón numérica", () => {
    for (const p of story.intelligence.products) {
      expect(p.verdict).toBeTruthy();
      expect(p.verdictReason.length).toBeGreaterThan(20);
    }
  });

  it("estrella → proteger; puzzle → impulsar; plow horse bajo objetivo → ajustar precio", () => {
    expect(byName("Estrella").verdict).toBe("proteger");
    expect(byName("Joya").verdict).toBe("impulsar");
    expect(byName("Caballito").verdict).toBe("ajustar_precio");
  });

  it("dog clase C → revisión estratégica (nunca 'eliminar')", () => {
    const p = byName("Perrito");
    expect(p.verdict).toBe("revisar");
    expect(p.verdictReason).toMatch(/imagen|experiencia|cross-selling/);
    // Ni los veredictos ni las recomendaciones ORDENAN eliminar
    // (la narrativa sí menciona la palabra: para prohibirlo).
    for (const prod of story.intelligence.products) {
      expect(prod.verdictReason).not.toMatch(/eliminar/i);
    }
    for (const rec of story.intelligence.recommendations) {
      expect(rec.action + rec.why).not.toMatch(/eliminar/i);
    }
  });

  it("HONESTIDAD: sin costo → observar con el motivo, jamás margen inventado", () => {
    const p = byName("Misterio");
    expect(p.verdict).toBe("observar");
    expect(p.marginPct).toBeNull();
    expect(p.menuEng).toBeNull();
    expect(p.verdictReason).toMatch(/no conocemos su costo/);
  });
});

describe("cerebro PIC — señales y recomendaciones", () => {
  const story = compilePortfolioStory(facts());

  it("la señal de precio cuantifica llevar el margen al objetivo", () => {
    const sig = story.intelligence.signals.find((s) => s.id === "sig-precio-p-Caballito")!;
    expect(sig).toBeTruthy();
    // precio objetivo = 4/(1-0.6) = S/10; uplift = (10-5)×600 = 3000
    expect(sig.impact).toBeCloseTo(3000, 0);
    expect(sig.confidence).toBe("media"); // asume volumen constante — honesto
  });

  it("máximo 5 recomendaciones, ordenadas por impacto y con prioridad 1..n", () => {
    const recs = story.intelligence.recommendations;
    expect(recs.length).toBeLessThanOrEqual(5);
    expect(recs.map((r) => r.priority)).toEqual(recs.map((_, i) => i + 1));
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].expectedBenefit).toBeGreaterThanOrEqual(recs[i].expectedBenefit);
    }
  });

  it("venta grande sin costo genera recomendación de costear (calidad de datos)", () => {
    expect(story.intelligence.recommendations.some((r) => r.id === "rec-costear")).toBe(true);
  });
});

describe("cerebro PIC — Health Score auditable", () => {
  const story = compilePortfolioStory(facts());
  const h = story.intelligence.health;

  it("componentes sin datos quedan null con motivo (gris) y NO puntúan", () => {
    const growth = h.components.find((c) => c.id === "crecimiento")!;
    expect(growth.score).toBeNull();
    expect(growth.unavailableReason).toMatch(/3 meses/);
  });

  it("el total re-pondera solo lo medible y cada componente trae fórmula con números", () => {
    expect(h.total).toBeGreaterThan(0);
    expect(h.total).toBeLessThanOrEqual(100);
    for (const c of h.components.filter((c) => c.score !== null)) {
      expect(c.formula).toMatch(/\d/);
    }
  });

  it("expone la cobertura de costos (honestidad)", () => {
    // venta costeada = 8660 de 11560 → ~74.9%
    expect(h.costCoveragePct).toBeCloseTo(74.9, 0);
  });
});

describe("cerebro PIC — cierre para decisión", () => {
  const story = compilePortfolioStory(facts());

  it("≤3 decisiones (desde recomendaciones) y ≤3 preguntas de directorio", () => {
    expect(story.intelligence.boardDecisions.length).toBeLessThanOrEqual(3);
    expect(story.intelligence.boardQuestions.length).toBeLessThanOrEqual(3);
    expect(story.intelligence.boardQuestions.every((q) => q.question.endsWith("?"))).toBe(true);
  });

  it("con cobertura <80% existe la pregunta de datos al directorio", () => {
    expect(story.intelligence.boardQuestions.some((q) => q.id === "q-datos")).toBe(true);
  });
});

describe("GUARDIA — separación estructural (patrón EIRS)", () => {
  it("narrative.ts solo importa de ./types (nunca BD ni metodologías)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/portfolio/narrative.ts"), "utf8");
    const imports = src.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const imp of imports) expect(imp).toMatch(/from "\.\/types"/);
  });

  it("intelligence.ts es puro: sin imports de BD/next/acciones", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/portfolio/intelligence.ts"), "utf8");
    const imports = src.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
    for (const imp of imports) expect(imp).toMatch(/from "\.\/types"/);
  });
});
