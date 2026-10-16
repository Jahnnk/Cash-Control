import { describe, it, expect } from "vitest";
import { computeBreakeven } from "./breakeven";

/**
 * Caso base realista (números tipo cafetería): fijos S/12,000, variables 40% de ventas.
 * Desde el 15-oct-2026 el piso es el del coach: fijos + food cost proyectado = 12,000 + 40% × 20,000
 * = S/20,000 (÷ 30 = S/666.67 por día). Con la venta esperada igual a la real da lo mismo que el
 * cálculo del libro (12000 / 0.6), y por eso en un mes cerrado el veredicto no cambia.
 */
const BASE = {
  fijos: 12000,
  variables: 8000,   // 40% de 20,000
  sinClasificar: 0,
  ventas: 20000,
  daysElapsed: 30,
  daysInMonth: 30,
};

describe("punto de equilibrio — fórmula y estados", () => {
  it("el piso del coach: fijos + food cost = 12,000 + 8,000 = S/20,000 (S/666.67 por día); el libro da lo mismo", () => {
    const r = computeBreakeven(BASE);
    expect(r.varRatio).toBeCloseTo(0.4, 3);
    expect(r.contributionMargin).toBeCloseTo(0.6, 3);
    expect(r.breakEven).toBe(20000);
    expect(r.pisoDia).toBe(666.67);
    expect(r.foodCostProyectado).toBe(8000);
    expect(r.breakEvenLibro).toBe(20000);
    expect(r.avancePct).toBe(100);
    expect(r.estado).toBe("superado");
  });

  it("mes en curso: usa la REFERENCIA histórica, no los fijos registrados a la fecha", () => {
    // La trampa que detectó Jahnn: al día 6 solo hay S/789 de fijos
    // registrados — comparar contra eso daría "superado" falso. Con la
    // referencia (fijos 12,000, variables 40%), el equilibrio es 20,000.
    const r = computeBreakeven({
      fijos: 789, variables: 3135, sinClasificar: 0,
      ventas: 4131, daysElapsed: 6, daysInMonth: 31, ventasEsperadas: 20000,
      reference: { fijos: 12000, varRatio: 0.4, monthsUsed: ["2026-04", "2026-05", "2026-06"] },
    });
    expect(r.breakEven).toBe(20000);          // referencia, no los S/789 del MTD
    expect(r.fijos).toBe(12000);              // muestra los fijos de referencia
    expect(r.avancePct).toBeCloseTo(20.7, 1); // 4131/20000 — nada de 126%
    // proyección 4131/6×31 = 21,343 ≥ 20,000 → en camino, cruce día 30
    expect(r.estado).toBe("en_camino");
    expect(r.diaEstimadoCruce).toBe(30);
    expect(r.referenceMonths).toEqual(["2026-04", "2026-05", "2026-06"]);
  });

  it("mes en curso por debajo pero con ritmo suficiente → en_camino + día estimado de cruce", () => {
    // Día 15: ventas 11,000 (ritmo 733/día → proyección 22,000 ≥ 20,000).
    const r = computeBreakeven({
      ...BASE, ventas: 11000, variables: 4400, daysElapsed: 15, ventasEsperadas: 20000,
      reference: { fijos: 12000, varRatio: 0.4, monthsUsed: ["2026-06"] },
    });
    expect(r.breakEven).toBe(20000);
    expect(r.estado).toBe("en_camino");
    expect(r.ventasProyectadas).toBe(22000);
    // cruce: 20000 / 733.33 = 27.3 → día 28
    expect(r.diaEstimadoCruce).toBe(28);
  });

  it("ritmo insuficiente → en_riesgo y sin día de cruce dentro del mes", () => {
    // Día 20: ventas 10,000 (ritmo 500/día → proyección 15,000 < 20,000).
    const r = computeBreakeven({
      ...BASE, ventas: 10000, variables: 4000, daysElapsed: 20, ventasEsperadas: 20000,
      reference: { fijos: 12000, varRatio: 0.4, monthsUsed: ["2026-06"] },
    });
    expect(r.estado).toBe("en_riesgo");
    expect(r.diaEstimadoCruce).toBeNull(); // cruzaría el día 40 — fuera del mes
  });

  it("mes cerrado sin referencia: usa los fijos y variables reales del mes", () => {
    const r = computeBreakeven(BASE);
    expect(r.breakEven).toBe(20000);
    expect(r.referenceMonths).toBeNull();
  });

  it("sin ventas o sin fijos clasificados → sin_datos, nunca un número inventado", () => {
    expect(computeBreakeven({ ...BASE, ventas: 0 }).estado).toBe("sin_datos");
    const sinFijos = computeBreakeven({ ...BASE, fijos: 0 });
    expect(sinFijos.estado).toBe("sin_datos");
    expect(sinFijos.breakEven).toBeNull();
    expect(sinFijos.warnings.join(" ")).toMatch(/costos fijos/i);
  });

  it("variables ≥ ventas → margen negativo: en_riesgo con aviso de margen, sin punto alcanzable", () => {
    const r = computeBreakeven({ ...BASE, variables: 21000 });
    expect(r.breakEven).toBeNull();
    expect(r.estado).toBe("en_riesgo");
    expect(r.warnings.join(" ")).toMatch(/margen, no de volumen/);
  });

  it("egresos sin clasificar generan aviso pero no entran a la fórmula", () => {
    const r = computeBreakeven({ ...BASE, sinClasificar: 950.5 });
    expect(r.breakEven).toBe(20000); // fórmula intacta
    expect(r.warnings.join(" ")).toMatch(/950.50/);
    expect(r.warnings.join(" ")).toMatch(/sin clasificar/i);
  });

  it("la venta esperada manda: con el presupuesto en S/30,000 el food cost del piso es 40% × 30,000 = 12,000", () => {
    const r = computeBreakeven({
      ...BASE, ventas: 8000, variables: 3200, daysElapsed: 10, ventasEsperadas: 30000,
      reference: { fijos: 12000, varRatio: 0.4, monthsUsed: ["2026-06"] },
    });
    expect(r.breakEven).toBe(24000);
    expect(r.pisoDia).toBe(800);
    expect(r.ventasEsperadas).toBe(30000);
  });

  it("sin presupuesto, la venta esperada es la venta típica de los meses de referencia (no el ritmo del mes)", () => {
    const ref = { fijos: 12000, varRatio: 0.4, monthsUsed: ["2026-06"], ventasTipicas: 25000 };
    const lento = computeBreakeven({ ...BASE, ventas: 3000, variables: 1200, daysElapsed: 10, reference: ref });
    const rapido = computeBreakeven({ ...BASE, ventas: 12000, variables: 4800, daysElapsed: 10, reference: ref });
    expect(lento.breakEven).toBe(22000);   // 12,000 + 40% × 25,000
    expect(rapido.breakEven).toBe(22000);  // vender más NO sube el piso
  });

  it("el sueldo de los socios sale de los fijos solo si el CEO lo pasó a la utilidad", () => {
    const ref = { fijos: 12000, varRatio: 0.4, monthsUsed: ["2026-06"], ventasTipicas: 20000, sueldoSocios: 1000 };
    const enPlanilla = computeBreakeven({ ...BASE, ventas: 5000, variables: 2000, daysElapsed: 10, reference: ref });
    const fuera = computeBreakeven({ ...BASE, ventas: 5000, variables: 2000, daysElapsed: 10, reference: ref, sociosFuera: true });
    expect(enPlanilla.breakEven).toBe(20000);
    expect(fuera.breakEven).toBe(19000);
    expect(fuera.fijos).toBe(11000);
    expect(fuera.sociosFuera).toBe(1000);
    // Mes cerrado: igual, con el sueldo del mes.
    expect(computeBreakeven({ ...BASE, sueldoSocios: 1000, sociosFuera: true }).breakEven).toBe(19000);
  });

  it("mes cerrado: vender más que el piso equivale a no perder (el mismo veredicto del libro)", () => {
    const gana = computeBreakeven({ ...BASE, ventas: 21000, variables: 8400 });
    const pierde = computeBreakeven({ ...BASE, ventas: 19000, variables: 7600 });
    expect(gana.estado).toBe("superado");
    expect(pierde.estado).not.toBe("superado");
    // El piso real de un mes cerrado es lo que costó operar: fijos + compras.
    expect(gana.breakEven).toBe(12000 + 8400);
  });
});
