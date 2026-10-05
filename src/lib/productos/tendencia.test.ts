import { describe, it, expect } from "vitest";
import { calcularTendencia, rectaDeTendencia, type PuntoDia } from "./tendencia";

const serie = (valores: number[], desde = "2026-04", completoUltimo = true): PuntoDia[] =>
  valores.map((porDia, i) => {
    const m = Number(desde.slice(5, 7)) + i;
    return { month: `2026-${String(m).padStart(2, "0")}`, porDia, completo: i < valores.length - 1 || completoUltimo };
  });

describe("tendencia de la demanda", () => {
  it("matcha ceremonial en Fonavi: de 0.30 al día en abril a 0 en setiembre → cae", () => {
    const t = calcularTendencia(serie([0.3, 0.26, 0.2, 0.06, 0.03, 0.0]));
    expect(t.clase).toBe("cayendo");
    expect(t.cambioPct).toBeLessThanOrEqual(-50);
    expect(t.tramoAntes).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(t.tramoAhora).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(t.mesesBajando).toBe(5);
    expect(t.resumen).toMatch(/Viene cayendo/);
    expect(t.resumen).toMatch(/abr–jun y jul–set/);
    expect(t.resumen).toMatch(/5 meses seguidos bajando/);
  });

  it("vende 1 al mes desde siempre: no es una caída, nunca despegó", () => {
    const t = calcularTendencia(serie([0.03, 0.0, 0.03, 0.03, 0.03, 0.0]));
    expect(t.clase).toBe("poco-siempre");
    expect(t.resumen).toMatch(/nunca despegó/);
    expect(t.cambioPct).toBeNull();
  });

  it("un mes a medias (octubre en curso) no cuenta como caída", () => {
    const t = calcularTendencia(serie([1, 1, 1, 1, 1, 1, 0.1], "2026-04", false));
    expect(t.clase).toBe("estable");
    expect(t.tramoAhora).not.toContain("2026-10");
  });

  it("si toda la carta bajó parecido, no es el producto", () => {
    const prod = serie([1, 1, 1, 0.7, 0.7, 0.7]);
    const carta = serie([100, 100, 100, 75, 75, 75]);
    const t = calcularTendencia(prod, carta);
    expect(t.clase).toBe("estable");
    expect(t.cartaPct).toBe(-25);
    expect(t.resumen).toMatch(/casi igual que toda la carta/);
  });

  it("si cae mucho más que la carta, sí es el producto", () => {
    const t = calcularTendencia(serie([1, 1, 1, 0.5, 0.5, 0.5]), serie([100, 100, 100, 95, 95, 95]));
    expect(t.clase).toBe("cayendo");
    expect(t.resumen).toMatch(/La carta completa bajó 5%/);
  });

  it("sube: avisa para no sacar un producto que despega", () => {
    const t = calcularTendencia(serie([0.5, 0.5, 0.5, 0.9, 1, 1.1]));
    expect(t.clase).toBe("subiendo");
    expect(t.cambioPct).toBeGreaterThanOrEqual(25);
    expect(t.resumen).toMatch(/Viene subiendo/);
  });

  it("estable cuando casi no se mueve", () => {
    const t = calcularTendencia(serie([1, 1.1, 0.9, 1, 1.05, 0.95]));
    expect(t.clase).toBe("estable");
  });

  it("antes no vendía y ahora sí: despega", () => {
    const t = calcularTendencia(serie([0, 0, 0, 0.3, 0.4, 0.5]));
    expect(t.clase).toBe("subiendo");
    expect(t.cambioPct).toBeNull();
  });

  it("con menos de 4 meses completos no opina", () => {
    const t = calcularTendencia(serie([1, 0.5, 0.2]));
    expect(t.clase).toBe("sin-datos");
    expect(t.resumen).toMatch(/hacen falta 4/);
    expect(calcularTendencia([]).clase).toBe("sin-datos");
  });

  it("con 4 o 5 meses compara la mitad contra la mitad", () => {
    const t4 = calcularTendencia(serie([1, 1, 0.4, 0.4]));
    expect(t4.tramoAntes).toHaveLength(2);
    expect(t4.tramoAhora).toHaveLength(2);
    expect(t4.clase).toBe("cayendo");
    const t5 = calcularTendencia(serie([1, 1, 0.4, 0.4, 0.4]));
    expect(t5.tramoAhora).toHaveLength(3);
    expect(t5.tramoAntes).toHaveLength(2);
  });

  it("la recta de tendencia sigue los puntos y no baja de cero", () => {
    const r = rectaDeTendencia([3, 2, 1, 0])!;
    expect(r).toEqual([3, 2, 1, 0]);
    expect(rectaDeTendencia([5])).toBeNull();
    expect(Math.min(...rectaDeTendencia([1, 0, 0, 0, 0, 0])!)).toBeGreaterThanOrEqual(0);
  });
});

import { evidenciaDe } from "./tendencia";
describe("evidencia sobre un candidato", () => {
  const t = (clase: "cayendo" | "subiendo" | "estable" | "poco-siempre" | "sin-datos") => ({ clase, antes: 1, ahora: 1, cambioPct: 0, cartaPct: 0, mesesBajando: 0, tramoAntes: [], tramoAhora: [], resumen: "" });
  it("cae en las dos sedes: negativa confirmada", () => {
    expect(evidenciaDe([{ sede: "Fonavi", tendencia: t("cayendo") }, { sede: "Centro", tendencia: t("cayendo") }])).toMatchObject({ tono: "rojo", titulo: expect.stringMatching(/confirmada en las dos sedes/) });
  });
  it("cae en una sola: lo dice, sin confirmar", () => {
    expect(evidenciaDe([{ sede: "Fonavi", tendencia: t("cayendo") }, { sede: "Centro", tendencia: t("estable") }])).toMatchObject({ tono: "ambar", titulo: expect.stringMatching(/Cae en Fonavi/) });
  });
  it("si sube en alguna, avisa antes de sacarlo", () => {
    expect(evidenciaDe([{ sede: "Fonavi", tendencia: t("cayendo") }, { sede: "Centro", tendencia: t("subiendo") }]).tono).toBe("verde");
  });
  it("poco desde siempre y sin datos", () => {
    expect(evidenciaDe([{ sede: "Fonavi", tendencia: t("poco-siempre") }]).titulo).toMatch(/nunca despegó/);
    expect(evidenciaDe([{ sede: "Fonavi", tendencia: t("sin-datos") }]).titulo).toMatch(/Todavía no hay historia/);
  });
});
