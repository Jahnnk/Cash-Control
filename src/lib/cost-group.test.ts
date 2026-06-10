import { describe, it, expect } from "vitest";
import { effectiveCostGroup, isValidCostGroup, unclassifiedCategories } from "./cost-group";

describe("effectiveCostGroup", () => {
  it("la exclusión del EBITDA SIEMPRE gana (no-operativo aunque tenga grupo)", () => {
    expect(effectiveCostGroup({ excludeFromEbitda: true, costGroup: null })).toBe("no_operativo");
    expect(effectiveCostGroup({ excludeFromEbitda: true, costGroup: "fijo" })).toBe("no_operativo");
  });

  it("fijo y variable según cost_group", () => {
    expect(effectiveCostGroup({ excludeFromEbitda: false, costGroup: "fijo" })).toBe("fijo");
    expect(effectiveCostGroup({ excludeFromEbitda: false, costGroup: "variable" })).toBe("variable");
  });

  it("NULL o valor desconocido → sin clasificar (no se adivina)", () => {
    expect(effectiveCostGroup({ excludeFromEbitda: false, costGroup: null })).toBe("sin_clasificar");
    expect(effectiveCostGroup({ excludeFromEbitda: false, costGroup: "semi_fijo" })).toBe("sin_clasificar");
    expect(effectiveCostGroup({ excludeFromEbitda: false, costGroup: "" })).toBe("sin_clasificar");
  });
});

describe("isValidCostGroup", () => {
  it("solo acepta fijo|variable", () => {
    expect(isValidCostGroup("fijo")).toBe(true);
    expect(isValidCostGroup("variable")).toBe(true);
    expect(isValidCostGroup("no_operativo")).toBe(false);
    expect(isValidCostGroup(null)).toBe(false);
    expect(isValidCostGroup("FIJO")).toBe(false);
  });
});

describe("unclassifiedCategories (señalador de config)", () => {
  const cats = [
    { name: "Insumos", isActive: true, excludeFromEbitda: false, costGroup: "variable" },
    { name: "CAJA CHICA", isActive: true, excludeFromEbitda: false, costGroup: null },
    { name: "Préstamos", isActive: true, excludeFromEbitda: true, costGroup: null },     // no-op: no cuenta
    { name: "Vieja", isActive: false, excludeFromEbitda: false, costGroup: null },        // inactiva: no cuenta
    { name: "PRODUCTOS", isActive: true, excludeFromEbitda: false, costGroup: null },
  ];
  it("lista solo activas, operativas y sin grupo", () => {
    expect(unclassifiedCategories(cats).map((c) => c.name)).toEqual(["CAJA CHICA", "PRODUCTOS"]);
  });
});
