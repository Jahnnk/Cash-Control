import { describe, it, expect } from "vitest";
import { huboCambioDeVenta, quienGuardo } from "../venta-diaria-historial";

describe("huboCambioDeVenta", () => {
  it("un día nuevo siempre cuenta", () => {
    expect(huboCambioDeVenta(null, { personas: 80, revenue: 1500 })).toBe(true);
  });
  it("guardar lo mismo no anota nada (ni con decimales de coma flotante)", () => {
    expect(huboCambioDeVenta({ personas: 80, revenue: 1500.1 }, { personas: 80, revenue: 1500.1 })).toBe(false);
    expect(huboCambioDeVenta({ personas: 80, revenue: 0.1 + 0.2 }, { personas: 80, revenue: 0.3 })).toBe(false);
  });
  it("cambia la venta o las personas", () => {
    expect(huboCambioDeVenta({ personas: 80, revenue: 1500 }, { personas: 80, revenue: 1763.8 })).toBe(true);
    expect(huboCambioDeVenta({ personas: 80, revenue: 1500 }, { personas: 79, revenue: 1500 })).toBe(true);
  });
});

describe("quienGuardo", () => {
  it("admin con nombre usa el nombre; sin nombre dice el cargo", () => {
    expect(quienGuardo({ kind: "admin", sede: 2, nombre: "Rosa" }, 2)).toEqual({ quien: "Rosa", rol: "admin" });
    expect(quienGuardo({ kind: "admin", sede: 2 }, 2)).toEqual({ quien: "Administración de Fonavi", rol: "admin" });
  });
  it("la dirección se identifica", () => {
    expect(quienGuardo({ kind: "full", quien: "jahnn" }, 3)).toEqual({ quien: "Jahnn", rol: "direccion" });
  });
});
