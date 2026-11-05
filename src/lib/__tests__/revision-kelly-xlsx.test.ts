import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("@/app/actions/por-definir", () => ({}));
vi.mock("@/app/actions/verificacion-kelly", () => ({}));

import { filaClasificacion, renderRevisionKellyXlsx } from "../revision-kelly-xlsx";
import type { ItemPorDefinir } from "@/app/actions/por-definir";
import type { VerificacionSedeMes } from "@/app/actions/verificacion-kelly";

const item = (p: Partial<ItemPorDefinir>): ItemPorDefinir => ({
  id: "1", businessId: 2, sede: "Fonavi", alcance: "categoria", motivo: "difiere", datos: {}, estado: "pendiente", decision: null,
  decididoPor: null, decididoEn: null, kellyPendiente: false, kellyCorregidoEn: null, ...p,
});

describe("fila para Kelly", () => {
  it("grupo: pide el tipo y dice lo que dice cada lado", () => {
    const f = filaClasificacion(item({ datos: { grupo: "LIMPIEZA", categoria: "INSUMOS", tipoKelly: "Fijo", grupoSistema: "variable", filas: 4, monto: 320 } }));
    expect(f.que).toBe("Grupo «LIMPIEZA» (4 gastos)");
    expect(f.excel).toBe("LIMPIEZA · Fijo");
    expect(f.sistema).toBe("INSUMOS · Variable");
    expect(f.monto).toBe(320);
    expect(f.pedido).toContain("Fijo, Variable o Excluido");
  });
  it("gasto dudoso: pregunta qué fue y trae la sugerencia", () => {
    const f = filaClasificacion(item({ alcance: "gasto", motivo: "conflicto", datos: { concepto: "PAGO LUIS", fecha: "2026-10-05", monto: 975, grupo: "OTROS", sugerencias: ["PLANILLA"] } }));
    expect(f.que).toBe("PAGO LUIS");
    expect(f.pedido).toContain("PLANILLA");
    expect(f.porque).toContain("No se entiende");
  });
});

describe("el Excel para Kelly", () => {
  it("trae las 4 hojas y una fila por cosa por revisar", async () => {
    const v = { estado: "alerta", alertas: [{ regla: "x", titulo: "Gastos distintos", detalle: "Faltan S/10" }], puenteIngresos: [{ etiqueta: "Excel", monto: 100 }], puenteGastos: [{ etiqueta: "Excel", monto: 50 }, { etiqueta: "Sin explicar", monto: 10 }], sede: "Fonavi", month: "2026-10" } as unknown as VerificacionSedeMes;
    const { blob, filename } = await renderRevisionKellyXlsx({
      pendientes: [item({ datos: { grupo: "A", categoria: "B" } }), item({ id: "2", alcance: "gasto", datos: { concepto: "X", grupo: "OTROS" } })],
      paraKelly: [{ sede: "Fonavi", lineas: ["• Grupo A: cambiar a Variable."], reglas: [] }],
      verificaciones: [v], generado: "2026-11-05",
    });
    expect(filename).toBe("Revision-Excel-para-Kelly-2026-11-05.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Para empezar", "Clasificaciones", "Diferencias", "Correcciones decididas"]);
    expect(wb.getWorksheet("Clasificaciones")!.rowCount).toBe(5);
    expect(wb.getWorksheet("Correcciones decididas")!.getRow(4).getCell(2).value).toBe("Grupo A: cambiar a Variable.");
  });
});
