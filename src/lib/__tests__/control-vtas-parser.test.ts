/**
 * Parser de Control de VTAS — reglas de columnas de la auditoría
 * Jahnn + Kelly (27-jul-2026):
 *   - Efectivo: col E (QuipuPOS). La col G (Cuentas) da 0 porque el
 *     efectivo se deposita al banco cada día — leerla dejaba "Ventas
 *     Byte" del mes sin el efectivo (obs. #1).
 *   - Ventas al Crédito: col E, no col G (obs. #2).
 *   - Yape/POS: col G (lado Cuentas, confirmado contra el banco).
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseControlVtas, listControlVtasSheets } from "../control-vtas-parser";

/** Arma un workbook con la estructura REAL de la hoja de Kelly:
 * col B=Fecha, C=Día, D=concepto QuipuPOS, E=monto QuipuPOS,
 * F=concepto Cuentas, G=monto Cuentas, H=diferencia, J=nota. */
function buildSheet(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Control de VTAS-JUL26");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const HEADER = [null, "Fecha", "Día", "QuipuPOS", null, "Cuentas", null, "Comparativo", null, null];

describe("parseControlVtas — columnas E/G según la auditoría 27-jul", () => {
  const buffer = buildSheet([
    HEADER,
    // Día 01/07: efectivo E=521 (QuipuPOS) pero G=0 (ya depositado)
    [null, "2026-07-01", "Miércoles", null, null, null, null, null, null, null],
    [null, null, null, "Efectivo", 521, "Efectivo", 0, -521, null, "REVISAR"],
    [null, null, null, "Yape", 713.4, "Yape", 713.4, 0, null, "OK"],
    [null, null, null, "POS", 222.5, "POS", 222.5, 0, null, "OK"],
    [null, null, null, "Ventas al Crédito", 80.8, "Ventas al Crédito", 56, -24.8, null, "REVISAR"],
    [null, null, null, "Total", 1537.7, "Total", 991.9, null, null, null],
  ]);
  const r = parseControlVtas(buffer, "Control de VTAS-JUL26");

  it("efectivo sale de la col E (QuipuPOS), no de la G que da 0", () => {
    expect(r.errores).toEqual([]);
    expect(r.ventasDiarias).toHaveLength(1);
    const dia = r.ventasDiarias[0];
    expect(dia.date).toBe("2026-07-01");
    expect(dia.efectivo).toBe(521); // antes: 0 (col G) → mes sin efectivo
  });

  it("yape y POS siguen saliendo de la col G (lado Cuentas)", () => {
    const dia = r.ventasDiarias[0];
    expect(dia.yape_plin).toBe(713.4);
    expect(dia.pos).toBe(222.5);
    expect(dia.total).toBe(1456.9); // 521 + 713.40 + 222.50
  });

  it("ventas al crédito salen de la col E, no de la G", () => {
    const credito = r.propinas.find((p) => p.source_concept === "Ventas al Crédito");
    expect(credito?.amount).toBe(80.8); // antes: 56 (col G)
  });

  it("total_pos_excel = suma del lado QuipuPOS completo (con crédito)", () => {
    expect(r.ventasDiarias[0].total_pos_excel).toBe(1537.7);
  });
});

describe("listControlVtasSheets — reconoce la pestaña con o sin el año (reporte Jahnn ago-2026)", () => {
  function buildWorkbook(sheetNames: string[]): Buffer {
    const wb = XLSX.utils.book_new();
    for (const name of sheetNames) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[null]]), name);
    }
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  it("reconoce 'Control de VTAS-JUL26' (con año)", () => {
    const buf = buildWorkbook(["Control de VTAS-JUL26", "Resumen"]);
    expect(listControlVtasSheets(buf)).toEqual(["Control de VTAS-JUL26"]);
  });

  it("reconoce 'Control de VTAS-JUL' (Kelly sin el año) — antes se ignoraba en silencio", () => {
    const buf = buildWorkbook(["Control de VTAS-JUL", "Resumen"]);
    expect(listControlVtasSheets(buf)).toEqual(["Control de VTAS-JUL"]);
  });
});

describe("propinas: solo lo que sobró y lo que Kelly escribió (Centro, ago–set 2026)", () => {
  it("separarPropina con los casos reales", async () => {
    const { separarPropina } = await import("../control-vtas-parser");
    expect(separarPropina(10, "10 PROPINA")).toEqual({ propina: 10, resto: 0 });
    // 11-set: POS sin cuadrar (−605) con la nota "20 PROPINA": no es propina.
    expect(separarPropina(-605, "20 PROPINA")).toEqual({ propina: 0, resto: -605 });
    // 01-set: Yape −1 con la nota del POS copiada.
    expect(separarPropina(-1, "10 PROPINA")).toEqual({ propina: 0, resto: -1 });
    // 26-ago: la venta anulada queda como diferencia a revisar.
    expect(separarPropina(99, "10 PROPINA + 89 VENTA ANULADA (SE DEVOLCIÒ EL MISMO DIA POR YAPE)")).toEqual({ propina: 10, resto: 89 });
    expect(separarPropina(28.6, "28.5 PROPINAS")).toEqual({ propina: 28.5, resto: 0.1 });
    // Sin número pegado a "propina": se toma lo que sobró.
    expect(separarPropina(7.5, "según pos es 12 de propina")).toEqual({ propina: 7.5, resto: 0 });
    expect(separarPropina(4, "REVISAR")).toEqual({ propina: 0, resto: 4 });
  });

  it("en la hoja: la propina va a propinas y el resto a diferencias por revisar", () => {
    const buffer = buildSheet([
      HEADER,
      [null, "2026-07-11", "Sábado", null, null, null, null, null, null, null],
      [null, null, null, "Efectivo", 389.8, "Efectivo", 0, -389.8, null, "REVISAR"],
      [null, null, null, "Yape", 335.7, "Yape", 434.7, 99, null, "10 PROPINA + 89 VENTA ANULADA"],
      [null, null, null, "POS", 605, "POS", 0, -605, null, "20 PROPINA"],
      [null, null, null, "Total", 1330.5, "Total", 434.7, null, null, null],
    ]);
    const r = parseControlVtas(buffer, "Control de VTAS-JUL26");
    expect(r.propinas.map((p) => [p.source_concept, p.amount])).toEqual([["Yape", 10]]);
    expect(r.alertasRedondeo.map((a) => [a.payment_method, a.difference])).toEqual([["yape_plin", 89], ["pos", -605]]);
  });

  it("la explicación de Kelly en la columna siguiente también se lee", () => {
    const buffer = buildSheet([
      HEADER,
      [null, "2026-07-07", "Martes", null, null, null, null, null, null, null],
      [null, null, null, "POS", 367.8, "POS", 175.2, -192.6, null, "REVISAR", "FALTA VOUCHER"],
      [null, null, null, "Total", 367.8, "Total", 175.2, null, null, null],
    ]);
    const r = parseControlVtas(buffer, "Control de VTAS-JUL26");
    expect(r.alertasRedondeo[0].note_text).toBe("REVISAR · FALTA VOUCHER");
  });
});
