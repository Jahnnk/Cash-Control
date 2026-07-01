import { describe, it, expect } from "vitest";
import {
  dateRange,
  forwardFill,
  cumulate,
  runwayDays,
  seriesDeltas,
  liquidityLevel,
} from "./liquidity";

describe("dateRange", () => {
  it("rango continuo incluyendo extremos (cruza fin de mes)", () => {
    expect(dateRange("2026-06-28", "2026-07-02")).toEqual([
      "2026-06-28", "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02",
    ]);
  });
});

describe("forwardFill (serie del banco)", () => {
  it("rellena los días sin saldo con el último conocido", () => {
    const dates = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"];
    const known = new Map([["2026-07-02", 1500], ["2026-07-04", 1300]]);
    expect(forwardFill(dates, known, 1000)).toEqual([1000, 1500, 1500, 1300]);
  });
  it("sin datos en el rango → todo el seed", () => {
    expect(forwardFill(["a", "b"], new Map(), 500)).toEqual([500, 500]);
  });
});

describe("cumulate (serie de la caja)", () => {
  it("acumula los netos diarios sobre la base histórica", () => {
    const dates = ["2026-07-01", "2026-07-02", "2026-07-03"];
    const nets = new Map([["2026-07-01", 100], ["2026-07-03", -30.5]]);
    expect(cumulate(dates, nets, 53.11)).toEqual([153.11, 153.11, 122.61]);
  });
});

describe("runwayDays", () => {
  it("liquidez / gasto diario, redondeado hacia abajo", () => {
    expect(runwayDays(9033, 1270.86)).toBe(7);
    expect(runwayDays(20000, 1000)).toBe(20);
  });
  it("sin gasto histórico → null (no inventa cobertura infinita)", () => {
    expect(runwayDays(5000, 0)).toBeNull();
  });
  it("liquidez negativa → 0 días, no negativo", () => {
    expect(runwayDays(-500, 1000)).toBe(0);
  });
});

describe("seriesDeltas", () => {
  const mk = (vals: number[]) => vals.map((v, i) => ({ date: `d${i}`, value: v }));
  it("vs ayer y vs hace 7 días", () => {
    const s = mk([10, 10, 10, 10, 10, 10, 10, 20, 25]); // 9 puntos
    expect(seriesDeltas(s)).toEqual({ day: 5, week: 15 }); // 25-20, 25-10
  });
  it("serie corta → week null; un solo punto → todo null", () => {
    expect(seriesDeltas(mk([5, 8]))).toEqual({ day: 3, week: null });
    expect(seriesDeltas(mk([5]))).toEqual({ day: null, week: null });
  });
});

describe("liquidityLevel", () => {
  it("umbral 15/7 días y sin-datos", () => {
    expect(liquidityLevel(20)).toBe("verde");
    expect(liquidityLevel(15)).toBe("verde");
    expect(liquidityLevel(10)).toBe("ambar");
    expect(liquidityLevel(3)).toBe("rojo");
    expect(liquidityLevel(null)).toBe("sin-datos");
  });
});
