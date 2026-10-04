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
    // El resultado de la fila 284 (margen 0.46, monto 15,722.65, gastos÷ingresos 0.54) viaja con el bloque.
    expect(b.totalHoja).toEqual({ fila: 282, ingresos: 33840.2, gastos: 18117.55, margenPct: 46, gastosPct: 54 });
    expect(b.analisis).toEqual([{ fila: 293, ingresos: 33840.2, gastos: 13093.86, margenPct: null, gastosPct: null }]);
  });

  it("sin bloques no inventa nada", () => {
    expect(leerBloquesDelPie([[1, 2, 3]])).toEqual({ totalHoja: null, analisis: [] });
  });

  it("viaja en las notas del lote junto a lo que ya había", () => {
    const notas = ["byte_sales_days=30", "omitidos_egresos=2700", ...bloquesANotas(leerBloquesDelPie(PIE))].join(", ");
    expect(bloquesDeNotas(notas)).toEqual({
      hoja: { ingresos: 33840.2, egresos: 18117.55, margenPct: 46, gastosPct: 54 },
      analisis: { ingresos: 33840.2, egresos: 13093.86, fila: 293, margenPct: null, gastosPct: null },
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

// Centro, setiembre 2026 (hoja del 02-oct): los totales =SUM(J5:J280) y =SUM(L5:L280) se quedaron
// en la fila 280 y los movimientos llegan a la 291. Sus filas suman 43,984.61 / 44,906.85.
const CENTRO_SEP: unknown[][] = [
  ...Array.from({ length: 297 }, () => []),
  fila(0, 43951.41, 0, 35338.08),                   // 298 totales (SUM, cortados en la 280)
  [],
  fila("INGRESOS", 43951.41, "GASTOS", 35338.08),   // 300
  [],
  fila(0.195973917560324, 8613.33, 0.804026082439676, null), // 302 margen
  ...Array.from({ length: 6 }, () => []),
  fila(0, 43951.41, -1718.03, 32032.42),            // 309 análisis (=L298-10000+6694.34)
  [],
  fila("INGRESOS", 43951.41, "GASTOS", 30314.39),   // 311
  [],
  fila(0.31027491495722204, 13637.02, 0.689725085042778, null), // 313 margen del análisis
];

describe("márgenes que Kelly escribe bajo cada bloque", () => {
  const b = leerBloquesDelPie(CENTRO_SEP);

  it("lee el margen del primer bloque y el del análisis", () => {
    expect(b.totalHoja).toMatchObject({ fila: 300, margenPct: 19.6, gastosPct: 80.4 });
    expect(b.analisis[0]).toMatchObject({ fila: 311, margenPct: 31.03, gastosPct: 68.97 });
  });

  it("viaja en las notas del lote (negativos incluidos)", () => {
    const n = bloquesANotas({ ...b, totalHoja: { ...b.totalHoja!, margenPct: -10.97, gastosPct: 110.97 } }).join(", ");
    expect(bloquesDeNotas(n).hoja).toMatchObject({ margenPct: -10.97, gastosPct: 110.97 });
    expect(bloquesDeNotas(bloquesANotas({ totalHoja: { fila: 1, ingresos: 5, gastos: 4, margenPct: null, gastosPct: null }, analisis: [] }).join(", ")).hoja).toMatchObject({ margenPct: null });
  });

  it("el total de la hoja no llega a la última fila: alerta con el margen real (−2.10%) y sin duplicarla con otra de margen", () => {
    const base = { ingresos: [], gastos: [], sistema: { ingresos: 0, gastos: 0 }, fijosAtelier: [], esAtelier: false };
    const v = verificarMes({ ...base, foto: { ingresos: 43984.61, egresos: 44906.85, omitidosEgresos: 0, hoja: { ingresos: b.totalHoja!.ingresos, egresos: b.totalHoja!.gastos, margenPct: b.totalHoja!.margenPct, gastosPct: b.totalHoja!.gastosPct }, analisis: { ingresos: b.analisis[0].ingresos, egresos: b.analisis[0].gastos, fila: b.analisis[0].fila, margenPct: b.analisis[0].margenPct } }, caja: { entro: 43984.61, salio: 44906.85 } });
    const a = v.alertas.filter((x) => x.regla === "total-hoja");
    expect(a).toHaveLength(1);
    expect(a[0].detalle).toContain("19.60%");
    expect(a[0].detalle).toContain("-2.10%");
    expect(v.alertas.some((x) => x.regla === "margen")).toBe(false);
    expect(v.margen).toEqual({ sistema: -2.1, excel: 19.6, excelGastosPct: 80.4 });
  });

  it("Atelier setiembre: totales completos y margen −10.97% = el del sistema → sin alertas", () => {
    const base = { ingresos: [], gastos: [], sistema: { ingresos: 0, gastos: 0 }, fijosAtelier: [], esAtelier: true };
    const v = verificarMes({ ...base, foto: { ingresos: 43239.95, egresos: 47982.83, omitidosEgresos: 0, hoja: { ingresos: 43239.95, egresos: 47982.83, margenPct: -10.97, gastosPct: 110.97 } }, caja: { entro: 43239.95, salio: 47982.83 } });
    expect(v.alertas.filter((x) => x.regla === "margen" || x.regla === "total-hoja")).toEqual([]);
    expect(v.margen).toMatchObject({ sistema: -10.97, excel: -10.97 });
  });

  it("totales completos pero margen mal calculado en la hoja → alerta de margen", () => {
    const base = { ingresos: [], gastos: [], sistema: { ingresos: 0, gastos: 0 }, fijosAtelier: [], esAtelier: false };
    const v = verificarMes({ ...base, foto: { ingresos: 1000, egresos: 800, omitidosEgresos: 0, hoja: { ingresos: 1000, egresos: 800, margenPct: 25, gastosPct: 75 } }, caja: { entro: 1000, salio: 800 } });
    expect(v.alertas.find((x) => x.regla === "margen")?.detalle).toContain("25.00%");
  });

  it("sin el margen de Kelly (cargas anteriores) no compara nada", () => {
    const base = { ingresos: [], gastos: [], sistema: { ingresos: 0, gastos: 0 }, fijosAtelier: [], esAtelier: false };
    const v = verificarMes({ ...base, foto: { ingresos: 1000, egresos: 800, omitidosEgresos: 0, hoja: { ingresos: 1000, egresos: 800 } }, caja: { entro: 1000, salio: 800 } });
    expect(v.alertas.some((x) => x.regla === "margen")).toBe(false);
    expect(v.margen).toEqual({ sistema: 20, excel: null, excelGastosPct: null });
  });
});
