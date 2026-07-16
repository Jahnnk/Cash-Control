/**
 * Parser del reporte "Ventas de <MES> <AÑO>" de Byte — probado contra el
 * formato REAL del archivo que exporta Jahnn (jul-2026): título en la
 * fila 0, header en la 1, y una fila final de totales sin fecha que
 * sirve de checksum, no de dato.
 */
import { describe, it, expect } from "vitest";
import { parseVentasReport } from "../byte-ventas-parser";

/** Réplica del archivo real "Ventas de JULIO 2026 (1).xlsx" (recortado). */
const REAL: unknown[][] = [
  ["Ventas de JULIO 2026"],
  ["Día", "# Pedidos", "Descuentos (S/)", "Total Vendido (S/)"],
  ["2026-07-01", 49, 8.9, 1508.82],
  ["2026-07-02", 46, 2.2, 1198.6],
  ["2026-07-03", 45, 0, 1333.4],
  [null, 140, 11.1, 4040.82], // totales
];

describe("parseVentasReport — formato real de Byte", () => {
  it("lee los días y descarta la fila de totales (sin fecha)", () => {
    const r = parseVentasReport(REAL);
    expect(r.errores).toEqual([]);
    expect(r.days).toHaveLength(3);
    expect(r.days[0]).toEqual({ date: "2026-07-01", pedidos: 49, descuentos: 8.9, total: 1508.82 });
    expect(r.periodStart).toBe("2026-07-01");
    expect(r.periodEnd).toBe("2026-07-03");
  });

  it("el checksum cuadra con la fila de totales de Byte → sin warnings", () => {
    expect(parseVentasReport(REAL).warnings).toEqual([]);
  });

  it("si la suma NO cuadra con los totales del reporte, avisa (no importa en silencio)", () => {
    const roto = REAL.map((r) => [...r]);
    roto[2][3] = 999; // adultera un día
    const r = parseVentasReport(roto);
    expect(r.warnings.some((w) => w.includes("no cuadra"))).toBe(true);
    expect(r.days).toHaveLength(3); // igual entrega los datos: el humano decide
  });

  it("columnas detectadas por header aunque haya columna A vacía (caso Centro histórico)", () => {
    const desplazado = REAL.map((r) => [null, ...r]);
    const r = parseVentasReport(desplazado);
    expect(r.errores).toEqual([]);
    expect(r.days).toHaveLength(3);
    expect(r.days[1].total).toBe(1198.6);
  });

  it("acepta fechas dd/mm/yyyy y Date de xlsx (otros exports de Byte)", () => {
    const r = parseVentasReport([
      ["Día", "# Pedidos", "Total Vendido (S/)"],
      ["01/07/2026", 10, 100],
      [new Date(Date.UTC(2026, 6, 2)), 20, 200],
    ]);
    expect(r.days.map((d) => d.date)).toEqual(["2026-07-01", "2026-07-02"]);
    expect(r.days[0].descuentos).toBe(0); // sin columna de descuentos
  });

  it("fecha repetida: se queda con la primera y avisa", () => {
    const r = parseVentasReport([
      ["Día", "# Pedidos", "Total Vendido (S/)"],
      ["2026-07-01", 10, 100],
      ["2026-07-01", 99, 999],
    ]);
    expect(r.days).toHaveLength(1);
    expect(r.days[0].total).toBe(100);
    expect(r.warnings.some((w) => w.includes("repetida"))).toBe(true);
  });

  it("archivo equivocado (sin las columnas) → error claro, cero días", () => {
    const r = parseVentasReport([["Producto", "Cantidad"], ["Torta", 5]]);
    expect(r.days).toEqual([]);
    expect(r.errores[0]).toContain("¿Es el reporte de Ventas de Byte?");
  });

  it("montos como texto con comas ('1,508.82') se leen bien", () => {
    const r = parseVentasReport([
      ["Día", "# Pedidos", "Total Vendido (S/)"],
      ["2026-07-01", "49", "1,508.82"],
    ]);
    expect(r.days[0].total).toBe(1508.82);
    expect(r.days[0].pedidos).toBe(49);
  });
});
