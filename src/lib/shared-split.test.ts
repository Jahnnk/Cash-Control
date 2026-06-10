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

import { computeThreeWaySplit, type ThreeWayRule } from "./shared-split";

const pct3 = (a: number, f: number, c: number): ThreeWayRule => ({
  splitMode: "percentage", atelierPercentage: a, fonaviPercentage: f, centroPercentage: c,
  atelierFixed: null, fonaviFixed: null, centroFixed: null,
});
const fixed3 = (a: number, f: number | null, c: number | null): ThreeWayRule => ({
  splitMode: "fixed", atelierPercentage: 0, fonaviPercentage: 0, centroPercentage: 0,
  atelierFixed: a, fonaviFixed: f, centroFixed: c,
});

describe("computeThreeWaySplit (reparto a 3 locales)", () => {
  it("CASO REAL asesoría: 1500 al 33.33/33.33/33.34 → 500/500/500 exacto (Centro absorbe)", () => {
    const r = computeThreeWaySplit(pct3(33.33, 33.33, 33.34), 1500);
    expect(r.atelier).toBeCloseTo(499.95, 2);
    expect(r.fonavi).toBeCloseTo(499.95, 2);
    expect(r.centro).toBeCloseTo(500.1, 2);
    expect(r.atelier + r.fonavi + r.centro).toBeCloseTo(1500, 2);
  });

  it("CASO REAL en modo fijo: Atelier 500 / Fonavi 500 / Centro el resto → 500/500/500 exactos", () => {
    const r = computeThreeWaySplit(fixed3(500, 500, 0), 1500);
    expect(r).toEqual({ atelier: 500, fonavi: 500, centro: 500 });
  });

  it("sin Centro (reglas históricas) es IDÉNTICO al reparto a 2 vías: Fonavi absorbe", () => {
    const r = computeThreeWaySplit(pct3(66.67, 33.33, 0), 2700);
    expect(r.atelier).toBeCloseTo(1800.09, 2);
    expect(r.fonavi).toBeCloseTo(899.91, 2);
    expect(r.centro).toBe(0);
  });

  it("solo Atelier + Centro (sin Fonavi): Centro absorbe el resto", () => {
    const r = computeThreeWaySplit(pct3(70, 0, 30), 644.2);
    expect(r.atelier).toBeCloseTo(450.94, 2);
    expect(r.fonavi).toBe(0);
    expect(r.centro).toBeCloseTo(193.26, 2);
    expect(r.atelier + r.centro).toBeCloseTo(644.2, 2);
  });

  it("modo fijo sin Centro: comportamiento histórico (Fonavi = resto)", () => {
    const r = computeThreeWaySplit(fixed3(1800, 900, null), 2750);
    // centroFixed null → no participa → Fonavi absorbe TODO el resto (950)
    expect(r).toEqual({ atelier: 1800, fonavi: 950, centro: 0 });
  });

  it("siempre cierra al céntimo en cualquier combinación", () => {
    for (const amount of [100, 999.99, 1500, 2750.55, 3333.33]) {
      for (const rule of [pct3(33.33, 33.33, 33.34), pct3(50, 25, 25), pct3(70, 0, 30), fixed3(500, 500, 0), fixed3(1000, null, 0)]) {
        const r = computeThreeWaySplit(rule, amount);
        expect(r.atelier + r.fonavi + r.centro).toBeCloseTo(amount, 2);
      }
    }
  });

  it("monto inválido → todo en cero", () => {
    expect(computeThreeWaySplit(pct3(33.33, 33.33, 33.34), 0)).toEqual({ atelier: 0, fonavi: 0, centro: 0 });
  });
});
