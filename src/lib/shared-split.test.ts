import { describe, it, expect } from "vitest";
import { computeSharedSplit, impliedPercentagesFromFixed } from "./shared-split";

const pctRule = (atelierPercentage: number) => ({
  splitMode: "percentage" as const,
  atelierPercentage,
  atelierFixed: null,
});
const fixedRule = (atelierFixed: number) => ({
  splitMode: "fixed" as const,
  atelierPercentage: 0,
  atelierFixed,
});

describe("computeSharedSplit", () => {
  it("modo porcentaje: preserva el comportamiento histórico (puede perder céntimos)", () => {
    // 66.67% de 2700 → 1800.09; Fonavi se lleva el resto = 899.91
    const r = computeSharedSplit(pctRule(66.67), 2700);
    expect(r.atelier).toBeCloseTo(1800.09, 2);
    expect(r.fonavi).toBeCloseTo(899.91, 2);
    expect(r.atelier + r.fonavi).toBeCloseTo(2700, 2);
  });

  it("modo monto fijo: Fonavi da EXACTO el resto (1800 fijo → 900.00)", () => {
    const r = computeSharedSplit(fixedRule(1800), 2700);
    expect(r.atelier).toBe(1800);
    expect(r.fonavi).toBe(900); // 900.00 exacto, no 899.91
    expect(r.atelier + r.fonavi).toBe(2700);
  });

  it("modo monto fijo: si el monto del mes varía, Atelier queda fijo y Fonavi absorbe", () => {
    const r = computeSharedSplit(fixedRule(1800), 2750);
    expect(r.atelier).toBe(1800);
    expect(r.fonavi).toBe(950);
    expect(r.atelier + r.fonavi).toBe(2750);
  });

  it("modo monto fijo: acota la parte de Atelier al monto si éste es menor", () => {
    const r = computeSharedSplit(fixedRule(1800), 1500);
    expect(r.atelier).toBe(1500);
    expect(r.fonavi).toBe(0);
  });

  it("siempre cuadra atelier + fonavi === monto, en ambos modos", () => {
    for (const amount of [100, 999.99, 2700, 2750.55, 3333.33]) {
      const a = computeSharedSplit(pctRule(33.33), amount);
      expect(a.atelier + a.fonavi).toBeCloseTo(amount, 2);
      const b = computeSharedSplit(fixedRule(900), amount);
      expect(b.atelier + b.fonavi).toBeCloseTo(amount, 2);
    }
  });

  it("monto inválido o cero → 0/0", () => {
    expect(computeSharedSplit(fixedRule(1800), 0)).toEqual({ atelier: 0, fonavi: 0 });
    expect(computeSharedSplit(pctRule(66.67), NaN)).toEqual({ atelier: 0, fonavi: 0 });
  });
});

describe("impliedPercentagesFromFixed", () => {
  it("deriva porcentajes desde los montos fijos", () => {
    expect(impliedPercentagesFromFixed(1800, 900)).toEqual({
      atelierPercentage: 66.67,
      fonaviPercentage: 33.33,
    });
  });
  it("total 0 → 50/50 (fallback seguro para columnas NOT NULL)", () => {
    expect(impliedPercentagesFromFixed(0, 0)).toEqual({
      atelierPercentage: 50,
      fonaviPercentage: 50,
    });
  });
});
