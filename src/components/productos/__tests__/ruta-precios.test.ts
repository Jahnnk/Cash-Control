/** Cuentas de la Ruta de precios: utilidad = precio − base, margen = utilidad ÷ precio, food cost = interno ÷ carta. */
import { describe, it, expect } from "vitest";
import { cuentasRuta } from "../ruta-precios";

describe("cuentasRuta", () => {
  const k = cuentasRuta(4, 10, 20, 16);
  it("Atelier → cafeterías", () => {
    expect(k.atelierCafeterias!.utilidad).toBeCloseTo(6, 6);
    expect(k.atelierCafeterias!.margen).toBeCloseTo(0.6, 6);
  });
  it("cafetería → público, con el food cost de la sede", () => {
    expect(k.cafeteriaPublico!.utilidad).toBeCloseTo(10, 6);
    expect(k.cafeteriaPublico!.margen).toBeCloseTo(0.5, 6);
    expect(k.foodCostSede).toBeCloseTo(0.5, 6);
  });
  it("Atelier → B2B", () => {
    expect(k.atelierB2B!.utilidad).toBeCloseTo(12, 6);
    expect(k.atelierB2B!.margen).toBeCloseTo(0.75, 6);
  });
  it("sin precio, sin cuenta", () => {
    const v = cuentasRuta(4, null, 20, null);
    expect(v.atelierCafeterias).toBeNull();
    expect(v.cafeteriaPublico).toBeNull();
    expect(v.foodCostSede).toBeNull();
  });
});
