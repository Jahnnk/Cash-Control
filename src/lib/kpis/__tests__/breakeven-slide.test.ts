/**
 * Tests de la lámina del punto de equilibrio.
 *
 * Lo que se clava es la ESCALA de la barra: es lo único de esta lámina
 * que puede mentir en silencio. Si la barra de una sede que va al 45%
 * se dibujara igual de larga que la de otra al 142%, la reunión sacaría
 * la conclusión contraria sin que ningún número esté mal.
 */
import { describe, it, expect } from "vitest";
import { anchoBarra, faltaParaEquilibrio, diaCorto, POS_META } from "../breakeven-slide";
import type { BreakevenResult } from "@/lib/breakeven";

const res = (o: Partial<BreakevenResult>): BreakevenResult => ({
  fijos: 10000, variables: 5000, sinClasificar: 0, ventas: 0,
  varRatio: 0.5, contributionMargin: 0.5, breakEven: null, avancePct: null,
  ventasProyectadas: null, diaEstimadoCruce: null, estado: "sin_datos",
  referenceMonths: null, warnings: [], ...o,
});

describe("escala de la barra", () => {
  it("la meta cae SIEMPRE en el mismo punto, para poder comparar sedes", () => {
    expect(anchoBarra(100)).toBeCloseTo(POS_META, 5);
  });

  it("media meta es media barra: la escala es lineal", () => {
    expect(anchoBarra(50)).toBeCloseTo(POS_META / 2, 5);
  });

  it("quien va al 45% se ve claramente más corto que quien va al 142%", () => {
    // El caso real de agosto: Fonavi 45.6% vs Centro 142.4%.
    expect(anchoBarra(45.6)).toBeLessThan(anchoBarra(142.4));
    expect(anchoBarra(45.6)).toBeLessThan(POS_META);   // no llega a la meta
    expect(anchoBarra(142.4)).toBeGreaterThan(POS_META); // la pasa
  });

  it("un mes descomunal se recorta y no se sale de la diapositiva", () => {
    expect(anchoBarra(500)).toBe(1);
    expect(anchoBarra(10000)).toBe(1);
  });

  it("sin dato o en negativo no dibuja barra, no dibuja una barra rara", () => {
    expect(anchoBarra(null)).toBe(0);
    expect(anchoBarra(0)).toBe(0);
    expect(anchoBarra(-20)).toBe(0);
  });
});

describe("cuánto falta para el equilibrio", () => {
  it("dice los soles que faltan", () => {
    expect(faltaParaEquilibrio(res({ ventas: 13523, breakEven: 29660 }))).toBe(16137);
  });

  it("ya superado no debe nunca mostrar un faltante negativo", () => {
    expect(faltaParaEquilibrio(res({ ventas: 20496, breakEven: 14392 }))).toBe(0);
  });

  it("sin punto de equilibrio calculable, no inventa un faltante", () => {
    expect(faltaParaEquilibrio(res({ ventas: 118, breakEven: null }))).toBeNull();
  });
});

describe("hasta cuándo miden las ventas", () => {
  it("dice el día en formato corto", () => {
    expect(diaCorto("2026-08-18")).toBe("18 ago");
    expect(diaCorto("2026-01-03")).toBe("3 ene");
  });

  it("sin fecha no escribe nada, no escribe 'null'", () => {
    expect(diaCorto(null)).toBe("");
  });
});
