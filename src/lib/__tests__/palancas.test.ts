import { describe, expect, it } from "vitest";
import { baseDePalancas, paraLlegar, simular, type MesBase, type Palancas } from "../palancas";

// El ejemplo del coach: Fonavi vende S/57,000 → 19,000 de insumos, 19,000 de fijos y 19,000 de EBITDA.
const ideal: Palancas = { ventas: 57000, variablePct: 100 / 3, planilla: 12000, otrosFijos: 7000, utilidadPct: 25 };
const real: Palancas = { ventas: 40000, variablePct: 46, planilla: 9000, otrosFijos: 5400, utilidadPct: 25 };

describe("palancas del EBITDA", () => {
  it("el ejemplo del coach marca 33% y de ahí salen la utilidad y la bolsa", () => {
    const l = simular(ideal);
    expect(l).toMatchObject({ variables: 19000, fijos: 19000, ebitda: 19000, ebitdaPct: 33.3, termometro: "eficiente", utilidad: 14250, bolsa: 4750, cabe: true });
    expect(l.pisoDiario).toBeCloseTo(1266.67, 2); // (19,000 + 19,000) ÷ 30
    expect(l.equilibrio).toBe(28500); // 19,000 ÷ (1 − 1/3)
  });
  it("una sede real: EBITDA bajo, la utilidad no cabe y la planilla dentro del tope", () => {
    const l = simular(real);
    expect(l).toMatchObject({ variables: 18400, fijos: 14400, ebitda: 7200, ebitdaPct: 18, termometro: "en_camino", cabe: false, planillaPct: 22.5, planillaPasada: false });
    expect(l.bolsa).toBe(-2800); // 7,200 − 10,000 que se apartan
  });
  it("avisa cuando la planilla pasa del 25% de la venta", () => {
    expect(simular({ ...real, planilla: 11000 }).planillaPasada).toBe(true);
  });
  it("dice cuánto mover de CADA palanca, sola, para llegar a la meta", () => {
    const [ventas, variable, fijos] = paraLlegar(real, 25);
    expect(ventas).toMatchObject({ palanca: "ventas", valor: 49655.17, cambio: 9655.17 }); // 14,400 ÷ (1 − 0.46 − 0.25)
    expect(variable).toMatchObject({ palanca: "variable", valor: 39, cambio: -7 }); // 1 − 0.25 − 14,400 ÷ 40,000
    expect(fijos).toMatchObject({ palanca: "fijos", valor: 11600, cambio: -2800 }); // 40,000 × 0.29
    for (const c of [ventas, variable, fijos]) expect(c.yaLlego).toBe(false);
    // Y aplicando cada una se llega de verdad.
    expect(simular({ ...real, ventas: ventas.valor! }).ebitdaPct).toBe(25);
    expect(simular({ ...real, variablePct: variable.valor! }).ebitdaPct).toBe(25);
    expect(simular({ ...real, planilla: 9000 - 2800 }).ebitdaPct).toBe(25);
  });
  it("si el costo variable más la meta se comen toda la venta, vender más no alcanza", () => {
    const [ventas] = paraLlegar({ ...real, variablePct: 70 }, 33);
    expect(ventas.valor).toBeNull();
  });
  it("si ya está en la meta no pide mover nada", () => {
    for (const c of paraLlegar(ideal, 25)) expect(c).toMatchObject({ yaLlego: true, cambio: 0 });
  });
  it("el punto de partida es el promedio de los 3 meses cerrados más recientes", () => {
    const m = (mes: string, ventas: number): MesBase => ({ mes, ventas, costos: ventas * 0.4, gastos: 12000, planilla: 8000, bolsa: 900 });
    const b = baseDePalancas([m("2026-07", 99999), m("2026-08", 30000), m("2026-09", 36000), m("2026-10", 42000)], 25)!;
    expect(b.meses).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(b.palancas).toEqual({ ventas: 36000, variablePct: 40, planilla: 8000, otrosFijos: 4000, utilidadPct: 25 });
    expect(b.bolsaComprometida).toBe(900);
    expect(baseDePalancas([], 25)).toBeNull();
  });
});
