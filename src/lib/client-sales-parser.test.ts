/**
 * Tests del parser de "Ventas por Cliente" (Byte).
 *
 * Las filas de prueba replican el export real de ago-2026, incluidas sus
 * rarezas: montos como texto ("S/ 3,248.86"), fechas como texto ISO, y
 * la fila 1 de título que ocupa celdas combinadas.
 */
import { describe, it, expect } from "vitest";
import { parseClientSales } from "./client-sales-parser";

/** Copia fiel de la forma que entrega SheetJS con { header: 1 }. */
const HEADER = [
  "Documento", "Tipo Doc.", "Cliente", "Total Pedidos", "Con Comprobante",
  "Sin Comprobante", "Total Ventas", "Ticket Promedio", "Primera Compra", "Última Compra",
];
const TITULO = ["Reporte Ventas por Cliente", null, null, null, null, null, null, null, null, null];

const fila = (
  doc: string, tipo: string, cli: string, ped: number, cc: number, sc: number,
  tot: string, tick: string, ini: string, fin: string,
) => [doc, tipo, cli, ped, cc, sc, tot, tick, ini, fin];

const BASE = [
  TITULO,
  HEADER,
  fila("20614333643", "ruc", "SERVICIOS GASTRONOMICOS YAYIS S.A.C.", 10, 10, 0, "S/ 3248.86", "S/ 324.89", "2026-08-03", "2026-08-08"),
  fila("20615473775", "ruc", "EXPERIENCIAS GASTRONOMICAS YAYIS S.R.L.", 13, 13, 0, "S/ 3117.30", "S/ 239.79", "2026-08-03", "2026-08-08"),
  fila("20605241701", "ruc", "G & V AGROANDINA S.A.C.", 2, 2, 0, "S/ 1620.75", "S/ 810.38", "2026-08-04", "2026-08-07"),
  fila("42348523", "dni", "VASQUEZ LOBATO KARINA LORENA", 1, 0, 1, "S/ 40.00", "S/ 40.00", "2026-08-07", "2026-08-07"),
];

describe("parseClientSales — el export real de Byte", () => {
  it("lee montos que vienen como texto con 'S/' y separador de miles", () => {
    const r = parseClientSales(BASE);
    expect(r.errores).toEqual([]);
    const gv = r.filas.find((f) => f.cliente.startsWith("G & V"))!;
    expect(gv.totalVentas).toBe(1620.75);
    expect(gv.ticketPromedio).toBe(810.38);
  });

  it("lee fechas que vienen como texto ISO y deriva el período del archivo", () => {
    const r = parseClientSales(BASE);
    expect(r.periodo).toEqual({ inicio: "2026-08-03", fin: "2026-08-08" });
  });

  it("marca Fonavi y Centro como sedes del grupo, por RUC", () => {
    const r = parseClientSales(BASE);
    const centro = r.filas.find((f) => f.documento === "20614333643")!;
    const fonavi = r.filas.find((f) => f.documento === "20615473775")!;
    expect(centro.esSede).toBe(true);
    expect(centro.sedeId).toBe(3); // Centro
    expect(fonavi.esSede).toBe(true);
    expect(fonavi.sedeId).toBe(2); // Fonavi
    // Un cliente externo NO debe marcarse como sede
    expect(r.filas.find((f) => f.cliente.startsWith("G & V"))!.esSede).toBe(false);
  });

  it("separa el total en ventas a sedes vs ventas externas", () => {
    const r = parseClientSales(BASE);
    expect(r.totales.ventasSedes).toBe(6366.16);      // 3248.86 + 3117.30
    expect(r.totales.ventasExternas).toBe(1660.75);   // 1620.75 + 40.00
    expect(r.totales.ventas).toBe(8026.91);
    expect(r.totales.pedidos).toBe(26);
    expect(r.totales.clientes).toBe(4);
  });

  it("detecta la sede por nombre si el documento viniera vacío", () => {
    const rows = [
      TITULO, HEADER,
      fila("", "ruc", "EXPERIENCIAS GASTRONOMICAS YAYIS S.R.L.", 1, 1, 0, "S/ 100.00", "S/ 100.00", "2026-08-03", "2026-08-03"),
    ];
    const r = parseClientSales(rows);
    expect(r.filas[0].esSede).toBe(true);
    expect(r.filas[0].sedeId).toBe(2);
  });

  it("encuentra los encabezados aunque Byte agregue filas arriba", () => {
    const rows = [TITULO, ["Generado el 09/08/2026"], [], HEADER,
      fila("111", "ruc", "CLIENTE X", 1, 1, 0, "S/ 50.00", "S/ 50.00", "2026-08-05", "2026-08-05")];
    const r = parseClientSales(rows);
    expect(r.errores).toEqual([]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].cliente).toBe("CLIENTE X");
  });

  it("suma las filas repetidas del mismo cliente en vez de duplicarlo", () => {
    const rows = [TITULO, HEADER,
      fila("999", "ruc", "REPETIDO S.A.C.", 2, 2, 0, "S/ 100.00", "S/ 50.00", "2026-08-03", "2026-08-04"),
      fila("999", "ruc", "REPETIDO S.A.C.", 3, 3, 0, "S/ 200.00", "S/ 66.67", "2026-08-05", "2026-08-06")];
    const r = parseClientSales(rows);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].totalVentas).toBe(300);
    expect(r.filas[0].totalPedidos).toBe(5);
    expect(r.filas[0].ticketPromedio).toBe(60); // 300 / 5, recalculado
    expect(r.warnings.some((w) => w.includes("más de una vez"))).toBe(true);
  });

  it("deriva el ticket cuando Byte no lo trae", () => {
    const rows = [TITULO,
      ["Documento", "Cliente", "Total Pedidos", "Total Ventas", "Primera Compra", "Última Compra"],
      ["123", "SIN TICKET S.A.C.", 4, "S/ 200.00", "2026-08-03", "2026-08-06"]];
    const r = parseClientSales(rows);
    expect(r.filas[0].ticketPromedio).toBe(50); // 200 / 4
    expect(r.warnings.some((w) => w.includes("Ticket Promedio"))).toBe(true);
  });

  it("no rompe con un cliente de 0 pedidos (no divide entre cero)", () => {
    const rows = [TITULO, HEADER,
      fila("777", "ruc", "CERO PEDIDOS", 0, 0, 0, "S/ 0.00", "S/ 0.00", "2026-08-03", "2026-08-03")];
    const r = parseClientSales(rows);
    expect(r.filas[0].ticketPromedio).toBe(0);
    expect(Number.isFinite(r.filas[0].ticketPromedio)).toBe(true);
  });

  it("rechaza un archivo que no es el reporte de Byte", () => {
    const r = parseClientSales([["Otra cosa"], ["a", "b"], ["1", "2"]]);
    expect(r.errores.length).toBeGreaterThan(0);
    expect(r.filas).toEqual([]);
  });

  it("rechaza el archivo si no trae fechas (no se sabría qué semana es)", () => {
    const rows = [TITULO,
      ["Documento", "Cliente", "Total Pedidos", "Total Ventas"],
      ["1", "CLIENTE", 1, "S/ 10.00"]];
    const r = parseClientSales(rows);
    expect(r.errores.some((e) => e.includes("fechas"))).toBe(true);
  });

  it("avisa si no encuentra ventas a las sedes (posible archivo incompleto)", () => {
    const rows = [TITULO, HEADER,
      fila("111", "ruc", "SOLO EXTERNO", 1, 1, 0, "S/ 10.00", "S/ 10.00", "2026-08-03", "2026-08-03")];
    const r = parseClientSales(rows);
    expect(r.warnings.some((w) => w.includes("Fonavi"))).toBe(true);
  });
});
