import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { reporteDePrueba } from "./fixtures-reporte";
import { graficosDelReporte } from "../reporte-bonos-graficos";
import { renderBonosReportPdf } from "../bonos-report-pdf";
import { renderBonosReportXlsx } from "../bonos-report-xlsx";

const sinImagenes = { comparativo: null, porSede: {} };

describe("gráficos del reporte", () => {
  it("arma el comparativo y los gráficos de cada sede", () => {
    const g = graficosDelReporte(reporteDePrueba());
    expect(g.comparativo?.svg).toContain("Qué tan cerca está cada sede");
    expect(g.porSede[3].ticket?.svg).toContain("Nivel 2");
    expect(g.porSede[3].ventas?.svg).toContain("Meta S/40,800");
    expect(g.porSede[3].bonos?.svg).toContain("Teresa");
  });

  it("sin nivel no hay gráfico de bonos por persona", () => {
    const g = graficosDelReporte(reporteDePrueba({ conNivel: false }));
    expect(g.porSede[3].bonos).toBeNull();
  });
});

describe("PDF del reporte", () => {
  it("se genera, con varias páginas, sin imágenes y con ellas", async () => {
    const { blob, filename } = renderBonosReportPdf(reporteDePrueba(), sinImagenes);
    expect(filename).toBe("Bonos-Incentivos-Setiembre-2026.pdf");
    const bytes = Buffer.from(await blob.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const paginas = (bytes.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    // resumen + reglas + (resultado, día a día, pagos) + transferencias; sin ranking, el mejor vendedor cabe en la hoja de pagos
    expect(paginas).toBeGreaterThanOrEqual(6);
  });

  it("en modo rango no lleva pagos ni hoja de transferencias", async () => {
    const r = reporteDePrueba();
    const rango = { ...r, esRango: true, totalARepartir: null, llaves: [], sedes: r.sedes.map((s) => ({ ...s, pagos: null, ventas: null })) };
    const completo = Buffer.from(await renderBonosReportPdf(r, sinImagenes).blob.arrayBuffer());
    const corto = Buffer.from(await renderBonosReportPdf(rango, sinImagenes).blob.arrayBuffer());
    const n = (b: Buffer) => (b.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    expect(n(corto)).toBeLessThan(n(completo));
  });
});

describe("Excel del reporte", () => {
  it("lleva las hojas esperadas y los totales como fórmula", async () => {
    const { blob, filename } = await renderBonosReportXlsx(reporteDePrueba(), sinImagenes);
    expect(filename).toBe("Bonos-Incentivos-Setiembre-2026.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Transferencias", "Pagos", "Metas", "Centro día a día", "Mejor vendedor"]);

    const t = wb.getWorksheet("Transferencias")!;
    let totalFormula: unknown = null;
    t.eachRow((row) => { if (row.getCell(2).value === "Total Centro" || String(row.getCell(1).value) === "Total Centro") totalFormula = row.getCell(4).value; });
    expect(JSON.stringify(totalFormula)).toContain("SUM(D");
  });
});
