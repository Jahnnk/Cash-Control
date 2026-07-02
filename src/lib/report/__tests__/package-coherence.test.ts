/**
 * Test de COHERENCIA del Board Meeting Package: los tres formatos
 * (PDF/PPTX/XLSX) se renderizan desde EL MISMO Story y cuentan los
 * mismos números.
 *  - Los tres producen artefactos reales (no stubs) desde un fixture.
 *  - El Excel se RE-LEE con exceljs y se verifica que las cifras clave
 *    (EBITDA, ingresos, liquidez del Scorecard; ventas de la serie)
 *    coinciden exactamente con la inteligencia del Story.
 *  - GUARDIAS: pptx.ts y xlsx.ts son renderers tontos (solo Story +
 *    design system; nada de BD, detectores ni narrativa).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import type { ReportFacts, ReportStory, UnitFacts } from "../types";
import { compileStory } from "../story-compiler";
import { renderPdf } from "../renderers/pdf";
import { renderPptx } from "../renderers/pptx";
import { renderXlsx } from "../renderers/xlsx";

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

/** Busca en una hoja la fila cuya primera columna coincide y devuelve la fila. */
function findRow(ws: ExcelJS.Worksheet, col1: string): ExcelJS.Row | null {
  let found: ExcelJS.Row | null = null;
  ws.eachRow((row) => {
    if (!found && String(row.getCell(1).value) === col1) found = row;
  });
  return found;
}

describe("Board Meeting Package — coherencia entre formatos", () => {
  let story: ReportStory;
  it("un solo Story alimenta los tres renderers y todos producen artefactos reales", async () => {
    story = compileStory(FACTS); // UNA sola compilación (un solo cerebro)

    const pdf = renderPdf(story);
    const pptx = await renderPptx(story);
    const xlsx = await renderXlsx(story);

    expect(pdf.blob.size).toBeGreaterThan(20_000);
    expect(pptx.blob.size).toBeGreaterThan(10_000);   // ≥9 slides con contenido
    expect(xlsx.blob.size).toBeGreaterThan(8_000);    // 9 hojas con datos

    expect(pdf.filename).toContain("2026-06");
    expect(pptx.filename).toBe("Yayis-Yayi-s-Atelier-2026-06-Presentacion.pptx");
    expect(xlsx.filename).toBe("Yayis-Yayi-s-Atelier-2026-06-Excel-Gerencial.xlsx");
  });

  it("el Excel re-leído contiene EXACTAMENTE las cifras de la inteligencia", async () => {
    story = story ?? compileStory(FACTS);
    const intel = story.intelligence.consolidated ?? story.intelligence.units[0];
    const { blob } = await renderXlsx(story);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());

    // Scorecard: cada KPI en soles coincide con la inteligencia.
    const sc = wb.getWorksheet("Scorecard")!;
    for (const id of ["ingresos", "ebitda", "liquidez"]) {
      const kpi = intel.kpis.find((k) => k.id === id)!;
      const row = findRow(sc, kpi.label)!;
      expect(row, `KPI ${id} debe estar en el Scorecard`).not.toBeNull();
      expect(Number(row.getCell(2).value)).toBeCloseTo(kpi.value, 2);
    }

    // Rentabilidad: la fila del mes del reporte trae las ventas del Story.
    const rent = wb.getWorksheet("Rentabilidad")!;
    const lastMonth = intel.series.months[intel.series.months.length - 1];
    const mRow = findRow(rent, lastMonth)!;
    expect(mRow).not.toBeNull();
    expect(Number(mRow.getCell(2).value)).toBeCloseTo(FACTS.units[0].current.sales, 2);
    expect(Number(mRow.getCell(4).value)).toBeCloseTo(FACTS.units[0].current.ebitda, 2);

    // Resumen: el cierre narrativo es el MISMO texto (no una segunda versión).
    const res = wb.getWorksheet("Resumen")!;
    const closing = findRow(res, "Cierre del mes")!;
    expect(String(closing.getCell(2).value)).toBe(story.narrative.executiveSummary.closing.text);

    // Plan y Preguntas: las preguntas del directorio son las del Story.
    const plan = wb.getWorksheet("Plan y Preguntas")!;
    const texts: string[] = [];
    plan.eachRow((row) => {
      if (String(row.getCell(2).value) === "Pregunta directorio") texts.push(String(row.getCell(3).value));
    });
    expect(texts).toEqual(intel.boardQuestions.map((q) => q.question));
  });

  it("sin DOM el PPTX degrada los gráficos a texto y NO falla (Fase A resiliente)", async () => {
    expect(typeof document).toBe("undefined");
    const { blob } = await renderPptx(compileStory(FACTS));
    expect(blob.size).toBeGreaterThan(10_000);
  });

  it("scope grupo también renderiza los tres formatos", async () => {
    const u2: UnitFacts = { ...mkUnit(), unit: { id: 2, code: "fonavi", name: "Yayi's Fonavi" }, receivables: null, budget: [], partnerLoanPending: null };
    const groupStory = compileStory({
      scope: { kind: "group", units: [FACTS.units[0].unit, u2.unit] },
      month: "2026-06", monthLabel: "Junio 2026", generatedAt: "2026-07-02T12:00:00Z",
      units: [mkUnit(), u2],
    });
    expect(renderPdf(groupStory).blob.size).toBeGreaterThan(20_000);
    expect((await renderPptx(groupStory)).blob.size).toBeGreaterThan(10_000);
    const x = await renderXlsx(groupStory);
    expect(x.blob.size).toBeGreaterThan(8_000);
    // El anexo del Excel trae AMBAS unidades (detalle por unidad, no solo consolidado).
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await x.blob.arrayBuffer());
    const units = new Set<string>();
    wb.getWorksheet("Anexo Top Gastos")!.eachRow((row, n) => {
      if (n > 1) units.add(String(row.getCell(1).value));
    });
    expect(units).toEqual(new Set(["Yayi's Atelier", "Yayi's Fonavi"]));
  });
});

describe("GUARDIAS — pptx.ts y xlsx.ts son renderers tontos", () => {
  const ALLOWED = /from "(pptxgenjs|exceljs|\.\.\/types|\.\/design-system|\.\/charts)"/;
  for (const file of ["pptx.ts", "xlsx.ts"]) {
    it(`${file} solo importa su librería + types/design-system/charts`, () => {
      const src = readFileSync(resolve(process.cwd(), `src/lib/report/renderers/${file}`), "utf8");
      const imports = src.match(/^import[\s\S]*?from\s+"[^"]+";/gm) ?? [];
      expect(imports.length).toBeGreaterThan(0);
      for (const imp of imports) expect(imp).toMatch(ALLOWED);
    });
  }
});
