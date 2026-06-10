import { describe, it, expect } from "vitest";
import { buildFixedVariable, buildGroupMap, type FVCategoryMeta } from "./fixed-variable";

const CATS: FVCategoryMeta[] = [
  { name: "Insumos", excludeFromEbitda: false, costGroup: "variable" },
  { name: "Fletes", excludeFromEbitda: false, costGroup: "variable" },
  { name: "Alquiler", excludeFromEbitda: false, costGroup: "fijo" },
  { name: "Planilla", excludeFromEbitda: false, costGroup: "fijo" },
  { name: "Préstamos", excludeFromEbitda: true, costGroup: null },
  { name: "Otros", excludeFromEbitda: false, costGroup: null },
];

describe("buildFixedVariable", () => {
  it("agrupa por grupo y calcula % sobre el total operativo", () => {
    const r = buildFixedVariable(
      [
        { category: "Insumos", amount: 3000 },
        { category: "Fletes", amount: 1000 },
        { category: "Alquiler", amount: 1800 },
        { category: "Planilla", amount: 4200 },
        { category: "Préstamos", amount: 999 },
        { category: "Otros", amount: 500 },
      ],
      CATS,
    );
    expect(r.variable.total).toBeCloseTo(4000, 2);
    expect(r.fijo.total).toBeCloseTo(6000, 2);
    expect(r.sinClasificar.total).toBeCloseTo(500, 2);
    expect(r.noOperativo.total).toBeCloseTo(999, 2);
    // INVARIANTE: fijo + variable + sinClasificar = operativos (base EBITDA)
    expect(r.operativeTotal).toBeCloseTo(10500, 2);
    expect(r.fijo.total + r.variable.total + r.sinClasificar.total).toBeCloseTo(r.operativeTotal, 2);
    // % sobre operativos
    expect(r.fijo.pctOfOperative).toBeCloseTo(57.14, 2);
    expect(r.variable.pctOfOperative).toBeCloseTo(38.1, 2);
    // el no-operativo queda FUERA del total y sin %
    expect(r.noOperativo.pctOfOperative).toBe(0);
  });

  it("variantes de MAYÚSCULAS se fusionan (INSUMOS + Insumos = una línea variable)", () => {
    const r = buildFixedVariable(
      [
        { category: "INSUMOS", amount: 100 },
        { category: "Insumos", amount: 50 },
      ],
      [...CATS, { name: "INSUMOS", excludeFromEbitda: false, costGroup: null }],
    );
    expect(r.variable.detail).toEqual([{ category: "Insumos", total: 150 }]);
    expect(r.sinClasificar.total).toBe(0);
  });

  it("si CUALQUIER variante está excluida del EBITDA, el nombre completo es No-operativo (criterio canónico)", () => {
    const cats: FVCategoryMeta[] = [
      { name: "SS BANCARIOS", excludeFromEbitda: false, costGroup: "fijo" },
      { name: "Ss Bancarios", excludeFromEbitda: true, costGroup: null },
    ];
    const map = buildGroupMap(cats);
    expect(map.get("Ss Bancarios")).toBe("no_operativo");
    const r = buildFixedVariable([{ category: "SS BANCARIOS", amount: 54.4 }], cats);
    expect(r.noOperativo.total).toBeCloseTo(54.4, 2);
    expect(r.fijo.total).toBe(0);
  });

  it("categoría NO catalogada → sin clasificar (no se adivina)", () => {
    const r = buildFixedVariable([{ category: "Categoría Fantasma", amount: 77 }], CATS);
    expect(r.sinClasificar.detail).toEqual([{ category: "Categoría Fantasma", total: 77 }]);
  });

  it("detalle ordenado de mayor a menor dentro de cada grupo", () => {
    const r = buildFixedVariable(
      [
        { category: "Alquiler", amount: 100 },
        { category: "Planilla", amount: 900 },
      ],
      CATS,
    );
    expect(r.fijo.detail.map((d) => d.category)).toEqual(["Planilla", "Alquiler"]);
  });

  it("mes vacío → todo en cero sin divisiones por cero", () => {
    const r = buildFixedVariable([], CATS);
    expect(r.operativeTotal).toBe(0);
    expect(r.fijo.pctOfOperative).toBe(0);
  });
});
