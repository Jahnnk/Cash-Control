/**
 * Filas del Excel que traen PLATA pero no traen datos.
 *
 * El caso real: la fila 208 del Excel de Fonavi de agosto tenía
 * S/112.20 en la columna de gastos y nada más — sin tipo, sin grupo,
 * sin concepto. El parser la descartaba en silencio (no puede
 * categorizar lo que no tiene categoría) y el mes quedaba descuadrado
 * en ese monto exacto, sin ninguna pista de por qué.
 *
 * Ahora avisa. Lo delicado es a QUIÉN avisa: al pie de cada hoja hay
 * filas de TOTALES con importes grandes y sin fecha, y señalarlas
 * ahogaría el aviso que sí importa.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseExcelFile } from "../excel-importer";

const CABECERA = [
  "Fecha", "Ing. / Gsto.", "Grupo ", "PROVEEDOR", "RUC", "Concepto",
  "Comprobante de Pago", "Nro. CP", "ING. EFECTIVO", "ING. CTA. CTE.",
  "GTOS. EFECTIVO", "GTOS. CTA. CTE.", "SALDO EFECTIVO", "SALDO CTA. CTE.",
];

/** Serial de Excel para una fecha ISO. */
const serial = (iso: string) =>
  Math.round(new Date(iso + "T00:00:00Z").getTime() / 86400000) + 25569;

function libro(filas: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    [null, null, null, null, null, null, null, null, null, null, null, null, null, "SALDO"],
    [null, null, null, null, null, null, null, null, "INGRESOS", null, "GASTOS", null, "SALDO"],
    CABECERA,
    ...filas,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ing&Gtos AGO26");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const avisos = (buf: Buffer) =>
  parseExcelFile(buf, "Ing&Gtos AGO26").parseWarnings.filter(
    (w) => w.reason === "amount_without_data",
  );

describe("fila con importe y sin datos", () => {
  it("avisa, con el monto y el número de fila", () => {
    const buf = libro([
      [serial("2026-08-01"), "G", "INSUMOS", "PROV", null, "Harina", "FA", "1", null, null, null, 100],
      [serial("2026-08-25"), null, null, null, null, null, null, null, null, null, null, 112.2],
    ]);
    const w = avisos(buf);
    expect(w).toHaveLength(1);
    expect(w[0].amount).toBeCloseTo(112.2, 2);
    expect(w[0].message).toContain("112.20");
    expect(w[0].message).toContain("descuadrado");
  });

  it("no bloquea la importación: el resto del mes entra igual", () => {
    const buf = libro([
      [serial("2026-08-01"), "G", "INSUMOS", "PROV", null, "Harina", "FA", "1", null, null, null, 100],
      [serial("2026-08-25"), null, null, null, null, null, null, null, null, null, null, 112.2],
    ]);
    const r = parseExcelFile(buf, "Ing&Gtos AGO26");
    expect(r.movimientos).toHaveLength(1);
    expect(r.errores).toHaveLength(0);
    expect(avisos(buf)[0].severity).toBe("info");
  });
});

describe("lo que NO debe avisar", () => {
  it("las filas de TOTALES del pie, que no tienen fecha", () => {
    // Es el caso que ahogaba el aviso útil: Atelier tenía tres filas así
    // con S/47,697.34 y S/0.30.
    const buf = libro([
      [serial("2026-08-01"), "G", "INSUMOS", "PROV", null, "Harina", "FA", "1", null, null, null, 100],
      [null, null, null, null, null, null, null, null, null, 47697.34, null, 33204.23],
      [null, null, null, null, null, null, null, null, null, null, null, 0.3],
    ]);
    expect(avisos(buf)).toHaveLength(0);
  });

  it("las filas de saldo", () => {
    const buf = libro([
      [serial("2026-08-01"), "I", "SALDO", "SALDO", null, "Saldo al 31/07/2026", null, null, null, 2045.79],
    ]);
    expect(avisos(buf)).toHaveLength(0);
  });

  it("una fila completa y normal", () => {
    const buf = libro([
      [serial("2026-08-01"), "G", "INSUMOS", "PROV", null, "Harina", "FA", "1", null, null, null, 100],
    ]);
    expect(avisos(buf)).toHaveLength(0);
  });

  it("una fila sin importe alguno", () => {
    const buf = libro([
      [serial("2026-08-02"), null, null, null, null, null, null, null, null, null, null, null],
    ]);
    expect(avisos(buf)).toHaveLength(0);
  });
});
