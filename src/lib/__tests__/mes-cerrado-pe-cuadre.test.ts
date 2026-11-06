/** Controles C9 (pestaña PE apunta al mes) y C10 (parches de cuadre) · datos inventados. */
import { describe, it, expect } from "vitest";
import { evaluarPeDelMes, peANotas, peDeNotas } from "../hoja-pe-excel";
import { c9PestanaPe, c10Parches, type DatosControles } from "../controles-fiabilidad";

const hojas = ["Ing&Gtos SEP26", "Ing&Gtos OCT26", "Ventas SEP26", "Ventas OCT26", "PE SEP26", "PE OCT26"];

describe("evaluarPeDelMes", () => {
  it("ok cuando apunta a las hojas del mes", () => {
    expect(evaluarPeDelMes("2026-10", [{ nombre: "PE OCT26", gastos: "Ing&Gtos OCT26", ventas: "Ventas OCT26" }], hojas).estado).toBe("ok");
  });
  it("otra_hoja cuando sigue en setiembre", () => {
    const r = evaluarPeDelMes("2026-10", [{ nombre: "PE OCT26", gastos: "Ing&Gtos SEP26", ventas: "Ventas SEP26" }], hojas);
    expect(r).toEqual({ estado: "otra_hoja", apunta: "Ing&Gtos SEP26" });
  });
  it("rota cuando la hoja no existe", () => {
    const r = evaluarPeDelMes("2026-10", [{ nombre: "PE OCT26", gastos: "Ing&Gtos OCT27", ventas: "Ventas OCT26" }], hojas);
    expect(r.estado).toBe("rota");
  });
  it("sin_pestana cuando no hay PE del mes", () => {
    expect(evaluarPeDelMes("2026-10", [], hojas).estado).toBe("sin_pestana");
  });
  it("las notas ida y vuelta", () => {
    const p = { estado: "otra_hoja" as const, apunta: "Ing&Gtos SEP26" };
    expect(peDeNotas("a=1, " + peANotas(p).join(", "))).toEqual(p);
    expect(peDeNotas("a=1")).toBeNull();
  });
});

const base = (over: Partial<DatosControles>, mes = "2026-10"): DatosControles =>
  ({ datos: { mes, gastos: [], ingresos: [] }, lotes: [{}], pe: null, ...over } as unknown as DatosControles);

describe("c9PestanaPe", () => {
  it("amarillo si apunta a otro mes", () => {
    expect(c9PestanaPe(base({ pe: { estado: "otra_hoja", apunta: "X" } })).estado).toBe("amarillo");
  });
  it("verde si ok", () => {
    expect(c9PestanaPe(base({ pe: { estado: "ok", apunta: null } })).estado).toBe("verde");
  });
  it("verde en meses viejos sin dato", () => {
    expect(c9PestanaPe(base({}, "2026-08")).estado).toBe("verde");
  });
});

describe("c10Parches", () => {
  it("detecta CUADRE en gastos", () => {
    const d = base({ datos: { mes: "2026-10", ingresos: [], gastos: [{ fecha: "2026-10-05", concepto: "CUADRE CTAS", monto: 48.82 }] } } as never);
    const c = c10Parches(d);
    expect(c.estado).toBe("amarillo");
    expect(c.diferencia).toBe(48.82);
  });
  it("verde sin cuadres", () => {
    expect(c10Parches(base({})).estado).toBe("verde");
  });
});
