/**
 * Caso real: Atelier, setiembre 2026. Byte (lo que subió Luis) al 12;
 * Excel de Kelly (CONTROL VENTAS SEP26) al 11.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { conciliarVentasDelMes, type FilaByte, type FilaKelly } from "../ventas-control-conciliacion";
import { parseControlVentasDiario, hojaControlVentasDelMes, esHojaControlVentas } from "../control-ventas-diario-parser";

const BYTE: FilaByte[] = [
  ["01", 9, 1016.37], ["02", 7, 2241.92], ["03", 6, 893], ["04", 7, 1249.85], ["05", 4, 727.31],
  ["07", 12, 2919.97], ["08", 7, 779.8], ["09", 7, 1640.72], ["10", 4, 722.47], ["11", 12, 1432.38], ["12", 2, 666.77],
].map(([d, p, t]) => ({ date: `2026-09-${d}`, pedidos: p as number, descuentos: 0, total: t as number }));

// Día, pedidos, total vendido, crédito, contado (la pestaña de Kelly)
const KELLY_TABLA: [string, number, number, number, number][] = [
  ["01", 9, 1016.37, 1016.37, 0], ["02", 7, 2241.92, 2241.92, 412.8], ["03", 6, 893, 893, 0],
  ["04", 7, 1249.85, 1249.85, 0], ["05", 4, 727.31, 727.31, 0], ["07", 12, 2919.97, 2316.58, 0],
  ["08", 7, 779.8, 779.8, 27.2], ["09", 7, 1640.72, 1640.72, 0], ["10", 4, 722.47, 722.47, 48],
  ["11", 12, 1432.38, 1432.38, 0],
];
const KELLY: FilaKelly[] = KELLY_TABLA.map(([d, p, t, cr, co]) => ({
  date: `2026-09-${d}`, pedidos: p, descuentos: 0, totalVendido: t, ventaCredito: cr, ventaContado: co, nota: null,
}));

describe("conciliación Byte ↔ Kelly (Atelier, setiembre)", () => {
  const r = conciliarVentasDelMes(BYTE, KELLY);

  it("total vendido = Byte al 12 (lo oficial y más al día)", () => {
    expect(r.totalVendido).toBe(14290.56);
    expect(r.byteHasta).toBe("2026-09-12");
    expect(r.kellyHasta).toBe("2026-09-11");
  });

  it("al 11, igual que el Excel de Kelly: crédito 13,020.40 + contado 488 = 13,508.40, variación 115.39", () => {
    expect(r.conciliado).toEqual({ totalVendido: 13623.79, ventaCredito: 13020.4, ventaContado: 488, total: 13508.4, variacion: 115.39 });
    expect(r.diasConVariacion).toBe(4);
  });

  it("la variación de cada día", () => {
    const v = Object.fromEntries(r.dias.map((d) => [d.date.slice(8), d.variacion]));
    expect(v).toMatchObject({ "02": -412.8, "07": 603.39, "08": -27.2, "10": -48, "01": 0 });
  });

  it("el día que Kelly aún no clasificó no tiene variación (no se acusa)", () => {
    const d12 = r.dias.find((d) => d.date === "2026-09-12")!;
    expect(d12.variacion).toBeNull();
    expect(d12.ventaCredito).toBeNull();
  });

  it("un día que Kelly ya revisó y dejó en cero, con venta en Byte, es variación", () => {
    const x = conciliarVentasDelMes([...BYTE, { date: "2026-09-06", pedidos: 0, descuentos: 0, total: 1 }], KELLY);
    const d06 = x.dias.find((d) => d.date === "2026-09-06")!;
    expect(d06.variacion).toBe(1);
    expect(d06.copiaDistinta).toBeNull();
    expect(x.conciliado.variacion).toBe(116.39);
  });

  it("avisa si Kelly copió un total de Byte distinto al que subió Luis", () => {
    const x = conciliarVentasDelMes(BYTE, [{ ...KELLY[0], totalVendido: 1000 }]);
    expect(x.dias[0].copiaDistinta).toEqual({ byte: 1016.37, kelly: 1000 });
    expect(x.diasCopiaDistinta).toBe(1);
  });

  it("sin carga de Byte, usa el total que copió Kelly", () => {
    const x = conciliarVentasDelMes([], KELLY);
    expect(x.totalVendido).toBe(13623.79);
    expect(x.dias[0].fuente).toBe("kelly");
  });
});

describe("parser de la pestaña CONTROL VENTAS", () => {
  function libro(nombre: string, filasExtra: unknown[][] = []) {
    const aoa: unknown[][] = [
      [null, "Ventas de SEPTIEMBRE 2026"],
      [null, "Día", "# Pedidos", "Descuentos (S/)", "Total Vendido (S/)", "VTA. CRÉDITO", "VTA. CONTADO", "TOTAL", "VARIACIÓN"],
      ...KELLY_TABLA.slice(0, 3).map(([d, p, t, cr, co]) => [null, `2026-09-${d}`, p, 0, t, cr, co, cr + co, t - cr - co]),
      [null, "2026-09-06", 0, 0, 0, 0, 0, 0, 0],
      [null, "2026-09-07", 12, 0, 2919.97, 2316.58, null, 2316.58, 603.39, "FACTURA SIN CRÉDITO"],
      ...filasExtra,
      [null, "TOTAL", 34, 0, 7071.26, 6467.87, 412.8, 6880.67, 190.59],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nombre);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"]]), "Control de VTAS-SEP");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  it("reconoce la pestaña y no la confunde con Control de VTAS", () => {
    expect(esHojaControlVentas("CONTROL VENTAS SEP26")).toBe(true);
    expect(esHojaControlVentas("Control de VTAS-SEP")).toBe(false);
    expect(hojaControlVentasDelMes(["Control de VTAS-SEP", "CONTROL VENTAS AGO26", "CONTROL VENTAS SEP26"], "2026-09")).toBe("CONTROL VENTAS SEP26");
  });

  it("lee las columnas por encabezado, salta días en cero y el TOTAL, y guarda la nota", () => {
    const r = parseControlVentasDiario(libro("CONTROL VENTAS SEP26"), "CONTROL VENTAS SEP26");
    expect(r.errores).toEqual([]);
    expect(r.mes).toBe("2026-09");
    expect(r.filas.map((f) => f.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-07"]);
    expect(r.filas[1]).toMatchObject({ pedidos: 7, totalVendido: 2241.92, ventaCredito: 2241.92, ventaContado: 412.8 });
    expect(r.filas[3]).toMatchObject({ ventaContado: 0, nota: "FACTURA SIN CRÉDITO" });
  });

  it("una fecha de otro mes es error (no se importa en silencio)", () => {
    const r = parseControlVentasDiario(libro("CONTROL VENTAS SEP26", [[null, "2026-08-31", 1, 0, 10, 10, 0, 10, 0]]), "CONTROL VENTAS SEP26");
    expect(r.errores.some((e) => e.includes("2026-08-31"))).toBe(true);
  });
});
