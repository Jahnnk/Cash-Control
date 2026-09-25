import { describe, it, expect } from "vitest";
import { leerBloquesDelPie, bloquesANotas, bloquesDeNotas } from "../bloques-pie-excel";
import { verificarMes } from "../verificacion-kelly";

// Pie de la hoja Ing&Gtos-SEP26 de Centro (25-sep-2026), columnas I a L.
const fila = (i: unknown, j: unknown, k: unknown, l: unknown) => [null, null, null, null, null, null, null, null, i, j, k, l];
const PIE: unknown[][] = [
  ...Array.from({ length: 279 }, () => []),
  fila(0, 33840.2, 0, 18117.55),                 // 280 totales (SUM)
  [],
  fila("INGRESOS", 33840.2, "GASTOS", 18117.55), // 282 total del mes según la hoja
  [],
  fila(0.46, 15722.65, 0.54, null),              // 284 resultado
  ...Array.from({ length: 6 }, () => []),
  fila(0, 33840.2, -1718.03, 14811.89),          // 291 análisis de Kelly (ajustes a mano)
  [],
  fila("INGRESOS", 33840.2, "GASTOS", 13093.86), // 293
];

describe("bloques de Kelly al pie de la hoja", () => {
  it("el primero es el total del mes; los siguientes, su análisis de rentabilidad", () => {
    const b = leerBloquesDelPie(PIE);
    expect(b.totalHoja).toEqual({ fila: 282, ingresos: 33840.2, gastos: 18117.55 });
    expect(b.analisis).toEqual([{ fila: 293, ingresos: 33840.2, gastos: 13093.86 }]);
  });

  it("sin bloques no inventa nada", () => {
    expect(leerBloquesDelPie([[1, 2, 3]])).toEqual({ totalHoja: null, analisis: [] });
  });

  it("viaja en las notas del lote junto a lo que ya había", () => {
    const notas = ["byte_sales_days=30", "omitidos_egresos=2700", ...bloquesANotas(leerBloquesDelPie(PIE))].join(", ");
    expect(bloquesDeNotas(notas)).toEqual({
      hoja: { ingresos: 33840.2, egresos: 18117.55 },
      analisis: { ingresos: 33840.2, egresos: 13093.86, fila: 293 },
    });
    expect(bloquesDeNotas("byte_sales_days=30")).toEqual({ hoja: null, analisis: null });
  });
});

describe("verificación: el total de la hoja contra sus filas", () => {
  const base = { ingresos: [], gastos: [], sistema: { ingresos: 0, gastos: 0 }, fijosAtelier: [], esAtelier: false };

  it("Centro julio 2026: la fórmula de totales no llegaba a la fila del rescate de S/550 → alerta", () => {
    const v = verificarMes({ ...base, foto: { ingresos: 43175.72, egresos: 42440.1, omitidosEgresos: 0, hoja: { ingresos: 42625.72, egresos: 42440.1 } } });
    const a = v.alertas.find((x) => x.regla === "total-hoja");
    expect(a?.detalle).toContain("S/42,625.72");
    expect(a?.detalle).toContain("S/43,175.72");
  });

  it("si la hoja y sus filas coinciden no hay alerta, y el análisis de Kelly viaja como referencia", () => {
    const v = verificarMes({ ...base, foto: {
      ingresos: 33840.2, egresos: 18117.55, omitidosEgresos: 0,
      hoja: { ingresos: 33840.2, egresos: 18117.55 }, analisis: { ingresos: 33840.2, egresos: 13093.86, fila: 293 },
    } });
    expect(v.alertas.some((x) => x.regla === "total-hoja")).toBe(false);
    expect(v.analisisKelly).toEqual({ ingresos: 33840.2, egresos: 13093.86, fila: 293 });
  });
});
