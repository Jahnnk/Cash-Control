/**
 * El candado de ventas del bono (desde octubre 2026).
 *
 * Casos reales de setiembre 2026 al 12, ya con EQUIPOS como inversión:
 * Fonavi S/15,166 vendidos contra un punto de equilibrio de S/31,523;
 * Centro S/16,581 contra S/32,656.
 */
import { describe, it, expect } from "vitest";
import { evaluarCandadoVentas, primerLunesDelMes, tocaCongelar, redondearMeta, metaPorPromedioDeVentas, type EntradaCandadoVentas } from "../candado-ventas";

const e = (o: Partial<EntradaCandadoVentas>): EntradaCandadoVentas => ({
  meta: 31600, provisional: false, vinculante: true, mesesReferencia: ["2026-06", "2026-07", "2026-08"],
  ventas: 15166, diasConVenta: 12, ...o,
});

describe("mes en curso", () => {
  it("Fonavi al 12 de setiembre: todavía no cubre, pero va en camino", () => {
    const r = evaluarCandadoVentas(e({}), 30);
    expect(r.cumple).toBe(false);
    expect(r.proyeccion).toBeCloseTo(37915, 0);
    expect(r.enCamino).toBe(true);
    expect(r.falta).toBe(16434);
    expect(r.avancePct).toBe(48);
  });

  it("si la proyección no alcanza, lo dice", () => {
    const r = evaluarCandadoVentas(e({ ventas: 9000 }), 30);
    expect(r.enCamino).toBe(false);
  });
});

describe("mes cerrado: todo o nada", () => {
  it("cubre la meta → cumple", () => {
    expect(evaluarCandadoVentas(e({ ventas: 31600, diasConVenta: 30 }), 30).cumple).toBe(true);
  });

  it("le faltó un sol → no cumple (decisión de Jahnn: sin pago parcial)", () => {
    expect(evaluarCandadoVentas(e({ ventas: 31599, diasConVenta: 30 }), 30).cumple).toBe(false);
  });
});

describe("sin meta no se inventa nada", () => {
  it("meta null → no cumple ni está en camino", () => {
    const r = evaluarCandadoVentas(e({ meta: null }), 30);
    expect(r.cumple).toBe(false);
    expect(r.enCamino).toBe(false);
    expect(r.avancePct).toBeNull();
  });
});

describe("cuándo se congela la meta", () => {
  it("primer lunes de octubre y noviembre 2026", () => {
    expect(primerLunesDelMes("2026-10")).toBe("2026-10-05");
    expect(primerLunesDelMes("2026-11")).toBe("2026-11-02");
    expect(primerLunesDelMes("2026-06")).toBe("2026-06-01"); // el 1 cae lunes
  });

  it("antes del primer lunes es provisional; desde ese día, se congela", () => {
    expect(tocaCongelar("2026-10", "2026-10-04")).toBe(false);
    expect(tocaCongelar("2026-10", "2026-10-05")).toBe(true);
    expect(tocaCongelar("2026-10", "2026-11-01")).toBe(true);
  });

  it("la meta se redondea hacia arriba a los S/100", () => {
    expect(redondearMeta(31523.47)).toBe(31600);
    expect(redondearMeta(32600)).toBe(32600);
  });
});

describe("meta = promedio de los últimos 3 meses cerrados (decisión 17-sep-2026)", () => {
  // Totales de Byte que pasó Kelly.
  const fonavi = [
    { month: "2026-06", total: 37221.95, diasConVenta: 30, diasDelMes: 30 },
    { month: "2026-07", total: 35410.27, diasConVenta: 31, diasDelMes: 31 },
    { month: "2026-08", total: 38979.45, diasConVenta: 31, diasDelMes: 31 },
    { month: "2026-05", total: 39608.81, diasConVenta: 31, diasDelMes: 31 },
  ];

  it("Fonavi jun–ago: promedio S/37,203.89 → meta S/37,300", () => {
    expect(metaPorPromedioDeVentas(fonavi)).toEqual({ meta: 37300, exacta: 37203.89, mesesReferencia: ["2026-06", "2026-07", "2026-08"] });
  });

  it("un mes con la carga incompleta no entra: se toma el anterior", () => {
    const r = metaPorPromedioDeVentas([...fonavi, { month: "2026-09", total: 20270.59, diasConVenta: 16, diasDelMes: 30 }]);
    expect(r?.mesesReferencia).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("con menos de 3 meses completos promedia los que hay", () => {
    expect(metaPorPromedioDeVentas([fonavi[2]])).toEqual({ meta: 39000, exacta: 38979.45, mesesReferencia: ["2026-08"] });
  });

  it("sin meses completos no hay meta", () => {
    expect(metaPorPromedioDeVentas([])).toBeNull();
  });
});
