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
  costApproximated: false,
  isAccompaniment: false,
  history: [],
  ...over,
});

/** Portafolio fixture: estrella, plow horse bajo objetivo, puzzle, dog, sin costo, acompañamiento. */
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
      // Acompañamiento: CON costo, poca rotación (como un "dog" cualquiera
      // en los números) — pero marcado como extra, no como plato final.
      mk({ name: "Huevo", units: 8, revenue: 24, avgPrice: 3, unitCogs: 1.5, isAccompaniment: true }),
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

  it("un acompañamiento con costo TAMPOCO entra al cuadrante (caso Jahnn, 27-ago-2026)", () => {
    const metrics = computeBaseMetrics(facts());
    const { quadrants } = classifyMenuEng(metrics);
    // "Huevo" tiene costo y poca rotación — en números sería un dog
    // más — pero está marcado como acompañamiento y queda sin cuadrante,
    // igual que un producto sin costo.
    expect(quadrants.has("p-Huevo")).toBe(false);
  });

  it("el acompañamiento no distorsiona el umbral de los demás productos", () => {
    // Sin la exclusión, "Huevo" (8 und, muy por debajo del resto) entra
    // al cálculo de popularidad y de margen promedio y podría mover a
    // qué lado cae cada producto real. Con la exclusión, el resto
    // clasifica exactamente igual que en el fixture sin acompañamiento.
    const metrics = computeBaseMetrics(facts());
    const { quadrants } = classifyMenuEng(metrics);
    expect(quadrants.get("p-Estrella")?.q).toBe("star");
    expect(quadrants.get("p-Caballito")?.q).toBe("plow_horse");
    expect(quadrants.get("p-Joya")?.q).toBe("puzzle");
    expect(quadrants.get("p-Perrito")?.q).toBe("dog");
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

  it("acompañamiento → observar con el motivo, nunca 'candidato a reemplazo'", () => {
    // El caso que reportó Jahnn: el huevo sancochado salía como dog
    // ("revisar") solo por tener poca rotación, cuando su rotación baja
    // es normal — acompaña, no se pide solo.
    const p = byName("Huevo");
    expect(p.verdict).toBe("observar");
    expect(p.menuEng).toBeNull();
    expect(p.verdictReason).toMatch(/acompañamiento/);
    expect(p.verdictReason).not.toMatch(/revisar|reemplazo/i);
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

describe("cerebro PIC — Fase 2: historia, tendencias y BCG interna", () => {
  /** 4 meses × 4 productos: Cohete A+crece, Ancla A+cae, Base B estable,
   *  Nuevo apareció en abril (C, creciendo). Cubre los 4 cuadrantes BCG. */
  function factsWithHistory(): PortfolioFacts {
    const h = (m: string, units: number, revenue: number) => ({ month: m, units, revenue });
    return {
      scope: { businessId: 3, businessName: "Yayi's Centro" },
      month: "2026-06",
      monthLabel: "Junio 2026",
      generatedAt: "2026-07-02T12:00:00Z",
      historyMonths: ["2026-03", "2026-04", "2026-05", "2026-06"],
      products: [
        mk({ name: "Cohete", units: 300, revenue: 3000, avgPrice: 10, unitCogs: 4,
          history: [h("2026-03", 140, 1400), h("2026-04", 150, 1500), h("2026-05", 160, 1600), h("2026-06", 300, 3000)] }),
        mk({ name: "Ancla", units: 290, revenue: 2900, avgPrice: 10, unitCogs: 4,
          history: [h("2026-03", 410, 4100), h("2026-04", 400, 4000), h("2026-05", 390, 3900), h("2026-06", 290, 2900)] }),
        mk({ name: "Base", units: 100, revenue: 1000, avgPrice: 10, unitCogs: 4,
          history: [h("2026-03", 100, 1000), h("2026-04", 100, 1000), h("2026-05", 100, 1000), h("2026-06", 100, 1000)] }),
        mk({ name: "Nuevo", units: 60, revenue: 600, avgPrice: 10, unitCogs: 4,
          history: [h("2026-04", 20, 200), h("2026-05", 40, 400), h("2026-06", 60, 600)] }),
      ],
    };
  }
  const story = compilePortfolioStory(factsWithHistory());
  const byName = (n: string) => story.intelligence.products.find((p) => p.name === n)!;

  it("crecimiento = mes actual vs promedio 3m, con tendencia", () => {
    const cohete = byName("Cohete");
    expect(cohete.growthPct).toBeCloseTo(100, 0); // 3000 vs 1500 prom
    expect(cohete.trend).toBe("sube");
    expect(byName("Ancla").trend).toBe("baja");
    expect(byName("Base").trend).toBe("estable");
  });

  it("BCG interna se activa con ≥3 meses: ejes crecimiento × clase A", () => {
    expect(story.intelligence.bcgSummary).not.toBeNull();
    expect(byName("Cohete").bcg).toBe("estrella");    // A + creciendo
    expect(byName("Ancla").bcg).toBe("vaca");         // A + cayendo (aún pesa)
    expect(byName("Nuevo").bcg).toBe("interrogante"); // peso bajo + creciendo
    expect(byName("Base").bcg).toBe("perro");         // peso bajo, sin momentum
    expect(byName("Cohete").bcgReason).toMatch(/demanda \+100%/);
  });

  it("detecta productos nuevos (aparecieron después del primer mes cargado)", () => {
    expect(byName("Nuevo").isNew).toBe(true);
    expect(byName("Cohete").isNew).toBe(false);
  });

  it("los componentes Crecimiento y Vitalidad del score COBRAN VIDA", () => {
    const growth = story.intelligence.health.components.find((c) => c.id === "crecimiento")!;
    const vital = story.intelligence.health.components.find((c) => c.id === "vitalidad")!;
    expect(growth.score).not.toBeNull();
    expect(vital.score).not.toBeNull();
    expect(growth.formula).toMatch(/\d/);
  });

  it("emite señales de tendencia con impacto en soles y confianza media", () => {
    const up = story.intelligence.signals.find((s) => s.id === "sig-crece-p-Cohete")!;
    const down = story.intelligence.signals.find((s) => s.id === "sig-cae-p-Ancla")!;
    expect(up.impact).toBeCloseTo(1500, -1);  // 3000 − 1500 prom
    expect(down.impact).toBeCloseTo(1100, -1); // 4000 prom − 2900
    expect(up.confidence).toBe("media");
  });

  it("sin historia, BCG y tendencias quedan declaradas inactivas (honestidad)", () => {
    const single = compilePortfolioStory(facts());
    expect(single.intelligence.bcgSummary).toBeNull();
    expect(single.intelligence.inactiveMethodologies.some((m) => m.id === "bcg-interna")).toBe(true);
    expect(single.intelligence.products.every((p) => p.trend === null)).toBe(true);
  });

  it("costos aproximados (historia pre-snapshot) se declaran en la narrativa", () => {
    const f = factsWithHistory();
    f.products = f.products.map((p) => ({ ...p, costApproximated: true }));
    const s = compilePortfolioStory(f);
    expect(s.intelligence.dataQuality.costsAreApproximated).toBe(true);
    expect(s.narrative.dataCaveat?.text).toMatch(/aproximados/);
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
