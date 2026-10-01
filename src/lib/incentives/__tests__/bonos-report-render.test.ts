import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { deflateSync } from "node:zlib";
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

/** Un PNG de color liso del tamaño que sale del navegador (880×330 al doble y medio), válido de verdad. */
function pngLiso(ancho: number, alto: number): string {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const trozo = (tipo: string, datos: Buffer) => {
    const t = Buffer.concat([Buffer.from(tipo), datos]);
    const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 2;
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(ancho * 3, 0xf0)]);
  const crudo = Buffer.concat(Array.from({ length: alto }, () => fila));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo("IHDR", ihdr), trozo("IDAT", deflateSync(crudo)), trozo("IEND", Buffer.alloc(0))]);
  return "data:image/png;base64," + png.toString("base64");
}

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

  it("las imágenes de los gráficos se comprimen: el PDF no pesa megas", async () => {
    const g = { dataUrl: pngLiso(2200, 825), width: 880, height: 330 };
    const grafs = { comparativo: g, porSede: { 3: { ticket: g, ventas: g, bonos: g } } };
    const { blob } = renderBonosReportPdf(reporteDePrueba(), grafs);
    // Sin compresión jsPDF guarda los píxeles crudos y el PDF pesa varios megas (con las imágenes distintas de verdad, decenas).
    expect(blob.size).toBeLessThan(1_500_000);
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
