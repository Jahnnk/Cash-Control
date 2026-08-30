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

describe("variantes del mismo nombre con clasificación distinta", () => {
  /**
   * El caso real de Centro (ago-2026): S/53,598 de sueldos contando como
   * costo variable porque `PLANILLA` (fijo) y `Planilla` (variable, sin
   * un solo gasto) colisionaban y ganaba la que llegara primero.
   */
  const enConflicto: FVCategoryMeta[] = [
    { name: "PLANILLA", excludeFromEbitda: false, costGroup: "fijo" },
    { name: "Planilla", excludeFromEbitda: false, costGroup: "variable" },
  ];

  it("el resultado NO depende del orden en que lleguen las categorías", () => {
    const a = buildGroupMap(enConflicto);
    const b = buildGroupMap([...enConflicto].reverse());
    expect(a.get("Planilla")).toBe(b.get("Planilla"));
  });

  it("ante fijo vs variable gana FIJO: subestimar los fijos abarata el equilibrio", () => {
    expect(buildGroupMap(enConflicto).get("Planilla")).toBe("fijo");
    expect(buildGroupMap([...enConflicto].reverse()).get("Planilla")).toBe("fijo");
  });

  it("y el gasto real cae del lado correcto, escrito como se escriba", () => {
    const r = buildFixedVariable(
      [{ category: "PLANILLA", amount: 11275.29 }],
      [...enConflicto].reverse(),
    );
    expect(r.fijo.total).toBe(11275.29);
    expect(r.variable.total).toBe(0);
  });

  it("no operativo sigue mandando sobre todo lo demás", () => {
    const cats: FVCategoryMeta[] = [
      { name: "AHORRO", excludeFromEbitda: false, costGroup: "fijo" },
      { name: "Ahorro", excludeFromEbitda: true, costGroup: null },
    ];
    expect(buildGroupMap(cats).get("Ahorro")).toBe("no_operativo");
    expect(buildGroupMap([...cats].reverse()).get("Ahorro")).toBe("no_operativo");
  });

  it("una clasificación real gana sobre 'sin clasificar'", () => {
    const cats: FVCategoryMeta[] = [
      { name: "Limpieza", excludeFromEbitda: false, costGroup: null },
      { name: "LIMPIEZA", excludeFromEbitda: false, costGroup: "variable" },
    ];
    expect(buildGroupMap(cats).get("Limpieza")).toBe("variable");
    expect(buildGroupMap([...cats].reverse()).get("Limpieza")).toBe("variable");
  });
});
