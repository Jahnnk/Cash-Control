/**
 * Motor del Sistema de Dirección. El error que estos tests impiden:
 * pintar de verde una mala noticia por confundir la dirección de la
 * meta (más ventas es bueno; más minutos de entrega es malo).
 */
import { describe, it, expect } from "vitest";
import { cumplimiento, semaforoDe, resolverNumero, formatValor, resumenSalud, unidadDe } from "../engine";
import type { DireccionItem } from "../types";

const item = (over: Partial<DireccionItem> = {}): DireccionItem => ({
  id: "1", block: "numero", position: 0, title: "Ventas del mes", detail: null,
  status: null, metricKey: null, manualValue: null, targetValue: null,
  targetUnit: "S/", higherIsBetter: true, ...over,
});

describe("cumplimiento", () => {
  it("más es mejor: 90 de meta 100 = 90%", () => {
    expect(cumplimiento(90, 100, true)).toBe(90);
  });

  it("MENOS es mejor: entregar en 25 min con meta 20 = 80% (no 125%)", () => {
    expect(cumplimiento(25, 20, false)).toBe(80);
  });

  it("menos es mejor y se supera: 15 min con meta 20 = 133%", () => {
    expect(cumplimiento(15, 20, false)).toBeCloseTo(133.33, 1);
  });

  it("meta en cero no divide por cero", () => {
    expect(cumplimiento(50, 0, true)).toBeNull();
  });
});

describe("semaforoDe", () => {
  it("100% o más es verde; 90-99 ámbar; menos rojo", () => {
    expect(semaforoDe(105)).toBe("verde");
    expect(semaforoDe(100)).toBe("verde");
    expect(semaforoDe(95)).toBe("ambar");
    expect(semaforoDe(89.9)).toBe("rojo");
    expect(semaforoDe(null)).toBeNull();
  });
});

describe("resolverNumero", () => {
  it("métrica enlazada toma el valor del sistema y se marca automática", () => {
    const r = resolverNumero(
      item({ metricKey: "ventas_mes_grupo", targetValue: 100000 }),
      { ventas_mes_grupo: 98628.38 },
    );
    expect(r.automatico).toBe(true);
    expect(r.value).toBe(98628.38);
    expect(r.semaforo).toBe("ambar"); // 98.6% de la meta
  });

  it("sin métrica enlazada usa el valor escrito a mano", () => {
    const r = resolverNumero(item({ manualValue: 9.3, targetValue: 9, targetUnit: "pts" }), {});
    expect(r.automatico).toBe(false);
    expect(r.value).toBe(9.3);
    expect(r.semaforo).toBe("verde");
  });

  it("sin meta no inventa semáforo (el número se muestra, sin juicio)", () => {
    const r = resolverNumero(item({ manualValue: 1234 }), {});
    expect(r.value).toBe(1234);
    expect(r.semaforo).toBeNull();
    expect(r.cumplimientoPct).toBeNull();
  });

  it("métrica enlazada que el sistema aún no puede calcular → sin valor", () => {
    const r = resolverNumero(item({ metricKey: "equilibrio_pct_grupo", targetValue: 100 }), {});
    expect(r.value).toBeNull();
    expect(r.semaforo).toBeNull();
  });

  it("un tiempo de entrega peor que la meta NO se pinta de verde", () => {
    const r = resolverNumero(
      item({ title: "Tiempo de entrega", manualValue: 28, targetValue: 20, targetUnit: "min", higherIsBetter: false }),
      {},
    );
    expect(r.semaforo).toBe("rojo");
  });
});

// Reporte de Jahnn (30-jul-2026): puso meta 33% sobre "EBITDA del mes",
// que está en SOLES → la pantalla mostró "29182.13%" contra "meta 33%".
// La unidad la manda la métrica, no lo que quedó guardado.
describe("unidadDe — la métrica manda sobre la unidad guardada", () => {
  it("métrica en soles ignora un '%' guardado por error", () => {
    expect(unidadDe({ metricKey: "ebitda_mes_grupo", targetUnit: "%" })).toBe("S/");
    expect(unidadDe({ metricKey: "profit_first_mes_grupo", targetUnit: "%" })).toBe("S/");
  });

  it("métrica en porcentaje se muestra en %", () => {
    expect(unidadDe({ metricKey: "ebitda_pct_grupo", targetUnit: "S/" })).toBe("%");
  });

  it("sin métrica enlazada respeta la unidad escrita a mano", () => {
    expect(unidadDe({ metricKey: null, targetUnit: "pts" })).toBe("pts");
  });
});

describe("resolverNumero — coherencia de unidades", () => {
  it("EBITDA en soles NUNCA se muestra como porcentaje", () => {
    const r = resolverNumero(
      item({ title: "EBITDA del mes", metricKey: "ebitda_mes_grupo", targetValue: 33, targetUnit: "%" }),
      { ebitda_mes_grupo: 29182.13 },
    );
    expect(r.targetUnit).toBe("S/");
    expect(formatValor(r.value, r.targetUnit)).toBe("S/29,182.13");
    expect(formatValor(r.targetValue, r.targetUnit)).toBe("S/33.00"); // meta absurda, pero honesta
  });

  it("la meta de EBITDA 33% sí funciona sobre la métrica en %", () => {
    const r = resolverNumero(
      item({ title: "EBITDA sobre ventas", metricKey: "ebitda_pct_grupo", targetValue: 33, targetUnit: "%" }),
      { ebitda_pct_grupo: 35.7 },
    );
    expect(r.targetUnit).toBe("%");
    expect(formatValor(r.value, r.targetUnit)).toBe("35.7%");
    expect(r.cumplimientoPct).toBeCloseTo(108.2, 1);
    expect(r.semaforo).toBe("verde");
  });
});

describe("formatValor", () => {
  it("respeta la unidad de cada número", () => {
    expect(formatValor(98628.38, "S/")).toBe("S/98,628.38");
    expect(formatValor(18.5, "%")).toBe("18.5%");
    expect(formatValor(9.3, "pts")).toBe("9.3 pts");
    expect(formatValor(20, "min")).toBe("20 min");
    expect(formatValor(null, "S/")).toBe("—");
  });
});

describe("resumenSalud", () => {
  it("cuenta cuántas piezas del sistema caminan solas", () => {
    const r = resumenSalud([
      item({ block: "salud", status: "bien" }),
      item({ block: "salud", status: "bien" }),
      item({ block: "salud", status: "atencion" }),
      item({ block: "salud", status: "roto" }),
    ]);
    expect(r).toEqual({ bien: 2, atencion: 1, roto: 1, total: 4, pct: 50 });
  });

  it("sin piezas registradas no inventa un porcentaje", () => {
    expect(resumenSalud([]).pct).toBeNull();
  });
});
