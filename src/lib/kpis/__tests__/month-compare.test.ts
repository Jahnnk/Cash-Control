/**
 * Comparativo mes vs mes — los casos REALES que lo originaron
 * (auditoría de Jahnn con reportes de Byte, 28-jul-2026).
 */
import { describe, it, expect } from "vitest";
import { compareMonths, type DayRow } from "../month-compare";

/** Genera días consecutivos desde `from` con un monto fijo. */
function days(from: string, n: number, amount: number): DayRow[] {
  const out: DayRow[] = [];
  const d = new Date(from + "T12:00:00Z");
  for (let i = 0; i < n; i++) {
    out.push({ date: d.toISOString().slice(0, 10), total: amount });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("compareMonths · el bug de Fonavi (-22.7% fantasma)", () => {
  // Julio tiene datos hasta el 24 (Kelly sube los viernes); junio tiene
  // los 27. Comparar 24 contra 27 inventaba una caída del 22.7%.
  const julio = days("2026-07-01", 24, 1000);
  const junio = days("2026-06-01", 27, 1100);

  it("compara SOLO los días presentes en ambos meses", () => {
    const c = compareMonths(julio, junio);
    expect(c.sameDay.daysCompared).toBe(24);      // no 27
    expect(c.sameDay.current).toBe(24000);
    expect(c.sameDay.previous).toBe(26400);        // 24 días de junio, no 27
    expect(c.sameDay.pct).toBeCloseTo(-9.09, 1);   // no el -22.7% inflado
  });

  it("dice hasta qué día del mes llegan los datos", () => {
    expect(compareMonths(julio, junio).throughDay).toBe(24);
  });
});

describe("compareMonths · el bug de Centro (+167.8% inventado)", () => {
  // Centro tenía 24 días de julio contra SOLO 7 de junio cargados.
  const julio = days("2026-07-01", 24, 1000);
  const junio = days("2026-06-01", 7, 1200);

  it("no inventa crecimiento: compara los 7 días que existen en ambos", () => {
    const c = compareMonths(julio, junio);
    expect(c.sameDay.daysCompared).toBe(7);
    expect(c.sameDay.pct).toBeCloseTo(-16.67, 1); // no +167.8%
  });

  it("marca cobertura baja para que el dashboard no grite con 7 días", () => {
    expect(compareMonths(julio, junio).lowCoverage).toBe(true);
    expect(compareMonths(days("2026-07-01", 24, 1000), days("2026-06-01", 24, 1000)).lowCoverage).toBe(false);
  });
});

describe("compareMonths · alineado por día de semana", () => {
  it("empareja el 1er lunes con el 1er lunes (jun arrancó lunes, jul miércoles)", () => {
    // Junio 2026 empieza lunes; julio 2026 empieza miércoles → desfase 2.
    const c = compareMonths(days("2026-07-01", 24, 1000), days("2026-06-01", 24, 1000));
    expect(c.weekdayShift).toBe(2);
    // Con montos iguales, ambas lecturas dan 0% — pero el emparejamiento
    // por día de semana usa menos pares (los que alcanzan de cada lado).
    expect(c.weekdayAligned.pct).toBe(0);
    expect(c.weekdayAligned.daysCompared).toBeGreaterThan(0);
  });

  it("un sábado fuerte no se compara contra un martes flojo", () => {
    // Solo sábados y martes, con montos muy distintos por día de semana.
    const cur: DayRow[] = [
      { date: "2026-07-04", total: 2000 }, // sábado
      { date: "2026-07-07", total: 500 },  // martes
    ];
    const prev: DayRow[] = [
      { date: "2026-06-06", total: 1000 }, // sábado
      { date: "2026-06-02", total: 400 },  // martes
    ];
    const c = compareMonths(cur, prev);
    // sábado 2000 vs 1000 y martes 500 vs 400 → 2500 vs 1400.
    expect(c.weekdayAligned.current).toBe(2500);
    expect(c.weekdayAligned.previous).toBe(1400);
  });

  it("mismo día de semana de arranque → desfase 0", () => {
    const c = compareMonths(days("2026-07-01", 5, 100), days("2026-04-01", 5, 100));
    expect(c.weekdayShift).toBe(0); // 1-abr y 1-jul-2026 son miércoles
  });
});

describe("compareMonths · bordes", () => {
  it("sin mes anterior → pct null, nunca un % contra cero", () => {
    const c = compareMonths(days("2026-07-01", 10, 500), []);
    expect(c.sameDay.pct).toBeNull();
    expect(c.sameDay.daysCompared).toBe(0);
  });

  it("días en cero no cuentan como datos (no fingen cobertura)", () => {
    const cur = [...days("2026-07-01", 3, 100), { date: "2026-07-04", total: 0 }];
    const c = compareMonths(cur, days("2026-06-01", 4, 100));
    expect(c.sameDay.daysCompared).toBe(3);
    expect(c.throughDay).toBe(3);
  });

  it("sin datos de ningún lado no revienta", () => {
    const c = compareMonths([], []);
    expect(c.sameDay.pct).toBeNull();
    expect(c.throughDay).toBeNull();
  });
});
