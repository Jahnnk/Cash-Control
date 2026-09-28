import { describe, it, expect } from "vitest";
import { tipoDeReporte, mesDelTituloVentas, soloDiasCerrados, parseMenorRotacion, grupoSinVenta } from "../productos/reportes-direccion";
import { verificarVentas } from "../verificacion-kelly";

// Filas tal como vienen en los reportes de Byte de Fonavi (01–28 set 2026).
const VENTAS = [["Ventas de SEPTIEMBRE 2026", null, null, null], ["Día", "# Pedidos", "Descuentos (S/)", "Total Vendido (S/)"], ["2026-09-01", 45, 12.1, 1396.7]];
const MAYOR = [["Platos con mayor rotacion del 2026-09-01 al 2026-09-28"], ["Plato", "Precio Unitario (S/)", "Vendido", "Por Cobrar", "Total Vendido (S/)", "Total Por Cobrar (S/)"]];
const MENOR: unknown[][] = [
  ["Platos con menor rotacion del 2026-09-01 al 2026-09-28", null, null, null, null, null, null],
  ["Producto", "Tipo", "Stock Actual", "Vendido", "Última Venta", "Precio Unit (S/)", "Inmovilizado (S/)"],
  ["AJI PANCA", "BATIDOS CON LECHE", 0, 0, "Nunca vendido", 0.0, 0.0],
  ["ALFAJOR CON CHOCOLATE", "POSTRES", -27, 0, "01/07/2026 08:47", 7.0, 0.0],
  ["CAFE CORTADO", "CAFE CALIENTE", 0, 0, "12/09/2026 08:39", 11.0, 0.0],
  ["ICED LATTE", "CAFE FRIO", -4, 10, "26/09/2026 10:06", 13.0, 0.0],
];

describe("reportes de Byte que sube dirección", () => {
  it("reconoce cada reporte por su título", () => {
    expect(tipoDeReporte(VENTAS)).toBe("ventas");
    expect(tipoDeReporte(MAYOR)).toBe("mayor");
    expect(tipoDeReporte(MENOR)).toBe("menor");
    expect(tipoDeReporte([["Hola"], ["a", "b"]])).toBeNull();
  });

  it("el mes sale del título de ventas (SEPTIEMBRE o SETIEMBRE)", () => {
    expect(mesDelTituloVentas("Ventas de SEPTIEMBRE 2026")).toBe("2026-09");
    expect(mesDelTituloVentas("Ventas de Setiembre 2026")).toBe("2026-09");
    expect(mesDelTituloVentas("Otra cosa")).toBeNull();
  });

  it("el día de hoy no se toma: está a medias", () => {
    const dias = [{ date: "2026-09-27", total: 779.8 }, { date: "2026-09-28", total: 12.5 }];
    const r = soloDiasCerrados(dias, "2026-09-28");
    expect(r.cerrados.map((d) => d.date)).toEqual(["2026-09-27"]);
    expect(r.descartados).toEqual([{ date: "2026-09-28", total: 12.5 }]);
  });

  it("lee «menor rotación»: tipo de Byte, vendidos, última venta y 'Nunca vendido'", () => {
    const r = parseMenorRotacion(MENOR);
    if (!r.ok) throw new Error(r.error);
    expect(r.desde).toBe("2026-09-01");
    expect(r.hasta).toBe("2026-09-28");
    expect(r.productos[0]).toMatchObject({ producto: "AJI PANCA", tipoByte: "BATIDOS CON LECHE", nuncaVendido: true, ultimaVenta: null });
    expect(r.productos[1]).toMatchObject({ vendido: 0, ultimaVenta: "2026-07-01", stock: -27, precio: 7 });
  });

  it("agrupa: nunca vendido, dormido (30+ días), muy pocas ventas; lo reciente sale de la lista", () => {
    const r = parseMenorRotacion(MENOR);
    if (!r.ok) throw new Error(r.error);
    expect(r.productos.map((p) => grupoSinVenta(p, r.hasta))).toEqual(["nunca", "dormido", null, "poco"]);
  });
});

describe("verificación: el Byte de la sede contra el de dirección", () => {
  it("avisa los días en que la sede subió otra cifra (reporte con el día abierto)", () => {
    const v = verificarVentas({
      byte: [{ date: "2026-08-30", total: 899.6 }, { date: "2026-08-29", total: 1200 }],
      kelly: [], registro: [],
      byteSede: [{ date: "2026-08-30", total: 102.1 }, { date: "2026-08-29", total: 1200 }],
    });
    const a = v?.alertas.find((x) => x.titulo.includes("sede no coincide"));
    expect(a?.titulo).toContain("1 día");
    expect(a?.detalle).toContain("30/08 (sede S/102.10, dirección S/899.60)");
  });
});

describe("mayor rotación: el TOTAL de Byte incluye lo por cobrar", () => {
  it("cuadra restando la columna «Total Por Cobrar» (Fonavi set: 33,732.10 + 47 = 33,779.10)", async () => {
    const { parseByteRotacion } = await import("../byte-rotacion-parser");
    const r = parseByteRotacion([
      ["Platos con mayor rotacion del 2026-09-01 al 2026-09-28"],
      ["Plato", "Precio Unitario (S/)", "Vendido", "Por Cobrar", "Total Vendido (S/)", "Total Por Cobrar (S/)"],
      ["EMPANADA MIXTA", 8, 216, 0, 1728, 0],
      ["EMPANADA DE LOMITO", 9.5, 136, 2, 1292, 19],
      [null, null, 352, 2, "TOTAL", 3039],
    ]);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.declaredTotal).toBe(3020);
    expect(r.warnings.some((w) => w.includes("no coincide con el TOTAL"))).toBe(false);
  });
});
