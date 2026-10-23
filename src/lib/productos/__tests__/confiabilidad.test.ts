import { describe, it, expect } from "vitest";
import { evaluarReporteProductos, TOLERANCIA_REPORTE_PRODUCTOS } from "../confiabilidad";

describe("¿el reporte de productos del mes es confiable?", () => {
  it("Atelier mayo-2026: el archivo traía ~5 meses → no confiable, con el porqué", () => {
    const c = evaluarReporteProductos({ sede: "Atelier", mes: "2026-05", productos: 201760.66, byte: 38342.83 });
    expect(c.confiable).toBe(false);
    expect(c.difPct).toBe(426.2);
    expect(c.motivo).toContain("Atelier de mayo suma S/201,761");
    expect(c.motivo).toContain("Vuelve a exportarlo");
  });
  it("Atelier abril-2026: +42% → no confiable", () => {
    expect(evaluarReporteProductos({ sede: "Atelier", mes: "2026-04", productos: 54897.23, byte: 38664.45 }).confiable).toBe(false);
  });
  it("Fonavi y Centro abril-2026 (+12%) ya no son confiables con el margen de 10%", () => {
    expect(evaluarReporteProductos({ sede: "Fonavi", mes: "2026-04", productos: 42633, byte: 38202 }).confiable).toBe(false);
    expect(evaluarReporteProductos({ sede: "Centro", mes: "2026-04", productos: 41411, byte: 37051 }).confiable).toBe(false);
  });
  it("los meses normales (−6% a +4%) son confiables", () => {
    for (const [p, b] of [[38662, 41056], [41028, 39609], [21380, 20739], [36288, 36285]]) {
      expect(evaluarReporteProductos({ sede: "X", mes: "2026-08", productos: p, byte: b }).confiable).toBe(true);
    }
  });
  it("sin venta de Byte con qué comparar, no se marca", () => {
    expect(evaluarReporteProductos({ sede: "X", mes: "2026-03", productos: 50000, byte: 0 }).confiable).toBe(true);
  });
  it("el margen es 10%", () => {
    expect(TOLERANCIA_REPORTE_PRODUCTOS).toBe(0.1);
    expect(evaluarReporteProductos({ sede: "X", mes: "2026-08", productos: 110, byte: 100 }).confiable).toBe(true);
    expect(evaluarReporteProductos({ sede: "X", mes: "2026-08", productos: 110.5, byte: 100 }).confiable).toBe(false);
  });
});
