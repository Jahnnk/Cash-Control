/**
 * Tests del simulador de precio y del Board Package comercial:
 * los 3 formatos se renderizan desde EL MISMO PortfolioStory y el Excel
 * re-leído cuenta exactamente los números de la inteligencia.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import type { PortfolioFacts, ProductFacts } from "../types";
import { compilePortfolioStory } from "../story-compiler";
import { simulatePriceChange } from "../simulator";
import { renderPortfolioPdf } from "../renderers/pdf";
import { renderPortfolioPptx } from "../renderers/pptx";
import { renderPortfolioXlsx } from "../renderers/xlsx";

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
  history: [],
  ...over,
});

const FACTS: PortfolioFacts = {
  scope: { businessId: 3, businessName: "Yayi's Centro" },
  month: "2026-06",
  monthLabel: "Junio 2026",
  generatedAt: "2026-07-02T12:00:00Z",
  historyMonths: ["2026-06"],
  products: [
    mk({ name: "Estrella", units: 500, revenue: 5000, avgPrice: 10, unitCogs: 4 }),
    mk({ name: "Caballito", units: 600, revenue: 3000, avgPrice: 5, unitCogs: 4 }),
    mk({ name: "Joya", units: 20, revenue: 600, avgPrice: 30, unitCogs: 6 }),
    mk({ name: "Perrito", units: 10, revenue: 60, avgPrice: 6, unitCogs: 5 }),
    mk({ name: "Misterio", units: 300, revenue: 2900, avgPrice: 9.67, unitCogs: null, targetMarginPct: null }),
  ],
};

describe("simulador de precio — escenarios honestos", () => {
  const story = compilePortfolioStory(FACTS);
  const caballito = story.intelligence.products.find((p) => p.name === "Caballito")!;

  it("subida de precio: 3 escenarios de volumen + punto de equilibrio", () => {
    const sim = simulatePriceChange(caballito, 6); // 5 → 6
    expect(sim.ok).toBe(true);
    if (!sim.ok) return;
    expect(sim.scenarios).toHaveLength(3);
    // volumen igual: (6-4)×600 = 1200 vs actual (5-4)×600 = 600 → +600
    expect(sim.scenarios[0].contributionDelta).toBeCloseTo(600, 0);
    // equilibrio: puede perder hasta 50% del volumen (600→300 und)
    expect(sim.breakEvenVolumeDropPct).toBeCloseTo(50, 0);
    expect(sim.note).toMatch(/escenarios, no promesas/);
  });

  it("bajar el precio no promete nada: avisa que toda caída empeora", () => {
    const sim = simulatePriceChange(caballito, 4.5);
    expect(sim.ok).toBe(true);
    if (!sim.ok) return;
    expect(sim.breakEvenVolumeDropPct).toBeNull();
    expect(sim.note).toMatch(/BAJA/);
  });

  it("rechaza precio bajo el costo y productos sin costo", () => {
    expect(simulatePriceChange(caballito, 3).ok).toBe(false);
    const misterio = story.intelligence.products.find((p) => p.name === "Misterio")!;
    expect(simulatePriceChange(misterio, 12).ok).toBe(false);
  });
});

describe("Board Package comercial — coherencia entre formatos", () => {
  it("un solo Story alimenta los 3 renderers y todos producen artefactos reales", async () => {
    const story = compilePortfolioStory(FACTS);
    const pdf = renderPortfolioPdf(story);
    const pptx = await renderPortfolioPptx(story);
    const xlsx = await renderPortfolioXlsx(story);
    expect(pdf.blob.size).toBeGreaterThan(15_000);
    expect(pptx.blob.size).toBeGreaterThan(10_000);
    expect(xlsx.blob.size).toBeGreaterThan(8_000);
    expect(pdf.filename).toContain("Reporte-Comercial");
    expect(pptx.filename).toContain("2026-06");
  });

  it("el Excel re-leído cuenta EXACTAMENTE los números de la inteligencia", async () => {
    const story = compilePortfolioStory(FACTS);
    const { blob } = await renderPortfolioXlsx(story);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());

    // Veredictos: una fila por producto y la venta total coincide.
    const ver = wb.getWorksheet("Veredictos")!;
    let totalRevenue = 0;
    let rows = 0;
    ver.eachRow((row, n) => {
      if (n === 1) return;
      rows++;
      totalRevenue += Number(row.getCell(5).value) || 0; // col 5 = "Venta"
    });
    expect(rows).toBe(story.intelligence.products.length);
    const factTotal = FACTS.products.reduce((s, p) => s + p.revenue, 0);
    expect(totalRevenue).toBeCloseTo(factTotal, 1);

    // Salud: el total del Excel = el total del Story.
    const sal = wb.getWorksheet("Salud")!;
    let healthTotal: number | null = null;
    sal.eachRow((row) => {
      if (String(row.getCell(1).value) === "TOTAL") healthTotal = Number(row.getCell(2).value);
    });
    expect(healthTotal).toBe(story.intelligence.health.total);
  });

  it("sin DOM los renders NO fallan (client-side libs degradan)", async () => {
    expect(typeof document).toBe("undefined");
    const story = compilePortfolioStory(FACTS);
    expect(() => renderPortfolioPdf(story)).not.toThrow();
    await expect(renderPortfolioPptx(story)).resolves.toBeTruthy();
  });
});

describe("GUARDIAS — renderers comerciales tontos", () => {
  const ALLOWED = /from "(jspdf|jspdf-autotable|pptxgenjs|exceljs|\.\.\/types|\.\.\/\.\.\/report\/renderers\/design-system)"/;
  for (const file of ["pdf.ts", "pptx.ts", "xlsx.ts"]) {
    it(`renderers/${file} solo importa su lib + types + design-system compartido`, () => {
      const src = readFileSync(resolve(process.cwd(), `src/lib/portfolio/renderers/${file}`), "utf8");
      const imports = src.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
      expect(imports.length).toBeGreaterThan(0);
      for (const imp of imports) expect(imp).toMatch(ALLOWED);
    });
  }

  it("simulator.ts es puro (solo ./types)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/portfolio/simulator.ts"), "utf8");
    const imports = src.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
    for (const imp of imports) expect(imp).toMatch(/from "\.\/types"/);
  });
});
