import { describe, expect, it } from "vitest";
import { diagnosticar, esFijoDeOperacion, focos, mapaDeFugas, radiografiaFijos, type MesGasto } from "../fugas";

const mes = (m: string, ventas: number, porCategoria: Record<string, number>): MesGasto => ({ mes: m, ventas, porCategoria });
const SIN_FUGAS = { mermas: null, porMotivo: [], metaMermaPct: 4, descuentos: null, descuentosAntes: null };

describe("esFijoDeOperacion", () => {
  it("separa los fijos de la operación de variables, impuestos, deudas e inversión", () => {
    expect(esFijoDeOperacion("PLANILLA")).toBe(true);
    expect(esFijoDeOperacion("ALQUILER")).toBe(true);
    expect(esFijoDeOperacion("INSUMOS")).toBe(false);
    expect(esFijoDeOperacion("IMPUESTOS")).toBe(false);
    expect(esFijoDeOperacion("PRÉSTAMOS Y TARJETAS")).toBe(false);
    expect(esFijoDeOperacion("EQUIPOS")).toBe(false);
  });
});

describe("radiografiaFijos", () => {
  const recientes = [mes("2026-09", 40000, { PLANILLA: 10000, ALQUILER: 1000, INSUMOS: 15000, MANTENIMIENTO: 500 }), mes("2026-10", 40000, { PLANILLA: 10000, ALQUILER: 1000, MANTENIMIENTO: 300 })];
  const previos = [mes("2026-08", 38000, { PLANILLA: 9000, ALQUILER: 1000, MANTENIMIENTO: 100, MARKETING: 600 })];

  it("ordena por peso, promedia por mes y deja fuera lo variable", () => {
    const f = radiografiaFijos(recientes, previos);
    expect(f.map((x) => x.categoria)).toEqual(["PLANILLA", "ALQUILER", "MANTENIMIENTO", "MARKETING"]);
    expect(f[0]).toMatchObject({ monto: 10000, pctVenta: 25, antes: 9000, cambio: 1000, sube: true });
    expect(f[2]).toMatchObject({ monto: 400, antes: 100, cambio: 300, sube: true });
  });
  it("no marca subida si el cambio es chico o si bajó", () => {
    const f = radiografiaFijos(recientes, previos);
    expect(f[1].sube).toBe(false); // alquiler igual
    expect(f[3]).toMatchObject({ monto: 0, cambio: -600, sube: false }); // marketing bajó
  });
  it("sin meses anteriores no compara", () => {
    expect(radiografiaFijos(recientes, [])[0]).toMatchObject({ antes: null, cambio: null, sube: false });
  });
});

describe("mapaDeFugas", () => {
  it("merma al mes, % de la venta, exceso sobre el tope y sobreproducción = vencimiento", () => {
    const f = mapaDeFugas({ ventas: 10000, meses: 2, mesesAntes: 2, mermas: 1000, porMotivo: [{ motivo: "Vencimiento", total: 750 }, { motivo: "Merma de calidad", total: 250 }], metaMermaPct: 4, descuentos: 400, descuentosAntes: 100 });
    expect(f.merma).toMatchObject({ monto: 500, pctVenta: 5, exceso: 100 });
    expect(f.sobreproduccion).toEqual({ monto: 375, parte: 75 });
    expect(f.descuentos).toMatchObject({ monto: 200, antes: 50, cambio: 150, sube: true });
  });
  it("sin registros devuelve null, no cero", () => {
    expect(mapaDeFugas({ ...SIN_FUGAS, ventas: 10000, meses: 3, mesesAntes: 0 })).toEqual({ merma: null, sobreproduccion: null, descuentos: null });
  });
});

describe("focos", () => {
  it("ordena por soles al mes y da los puntos de EBITDA", () => {
    const fijos = radiografiaFijos([mes("2026-10", 40000, { PLANILLA: 11000, MANTENIMIENTO: 800 })], [mes("2026-09", 40000, { PLANILLA: 11000, MANTENIMIENTO: 200 })]);
    const fugas = mapaDeFugas({ ...SIN_FUGAS, ventas: 40000, meses: 1, mesesAntes: 1 });
    const f = focos({ ventas: 40000, variablePct: 50, fijos, fugas });
    expect(f.map((x) => x.clave)).toEqual(["variable", "planilla", "fijo:MANTENIMIENTO"]);
    expect(f[0].soles).toBeCloseTo(6666.67, 1);
    expect(f[1]).toMatchObject({ soles: 1000, puntos: 2.5 });
    expect(f[2]).toMatchObject({ soles: 600, puntos: 1.5 });
  });
  it("sin nada fuera de meta no inventa focos", () => {
    const fijos = radiografiaFijos([mes("2026-10", 40000, { PLANILLA: 9000 })], []);
    expect(focos({ ventas: 40000, variablePct: 30, fijos, fugas: mapaDeFugas({ ...SIN_FUGAS, ventas: 40000, meses: 1, mesesAntes: 0 }) })).toEqual([]);
  });
  it("la merma sobre el tope entra marcada como parte del costo variable", () => {
    const fugas = mapaDeFugas({ ...SIN_FUGAS, ventas: 10000, meses: 1, mesesAntes: 0, mermas: 600, porMotivo: [{ motivo: "Vencimiento", total: 600 }] });
    const f = focos({ ventas: 10000, variablePct: 30, fijos: [], fugas });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ clave: "merma", soles: 200, dentroDeOtro: true });
  });
});

describe("diagnosticar", () => {
  it("null sin meses cerrados", () => {
    expect(diagnosticar({ recientes: [], previos: [], variablePct: 40, fugas: SIN_FUGAS })).toBeNull();
  });
  it("arma todo con la venta promedio", () => {
    const d = diagnosticar({ recientes: [mes("2026-09", 30000, { PLANILLA: 9000 }), mes("2026-10", 50000, { PLANILLA: 9000 })], previos: [], variablePct: 40, fugas: SIN_FUGAS })!;
    expect(d.ventas).toBe(40000);
    expect(d.totalFijos).toBe(9000);
    expect(d.meses).toEqual(["2026-09", "2026-10"]);
    expect(d.focos[0].clave).toBe("variable");
  });
});
