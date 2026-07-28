/**
 * Corte de datos — la regla que evita que el dashboard mienta:
 * el número mostrado es del último Excel cargado, no de hoy.
 */
import { describe, it, expect } from "vitest";
import { buildCutoff, formatCutoff, cutoffIsStale } from "../data-cutoff";

describe("buildCutoff", () => {
  it("usa el corte guardado con su hora (caso Kelly: 24/07 6:30 p.m.)", () => {
    // 24-jul-2026 18:30 en Lima = 23:30 UTC del mismo día.
    const c = buildCutoff(new Date("2026-07-24T23:30:00Z"), "2026-07-24");
    expect(c).toEqual({ date: "2026-07-24", time: "18:30", inferred: false });
  });

  it("un corte a las 23:59 = día completo → sin hora (no es información)", () => {
    const c = buildCutoff(new Date("2026-07-25T04:59:00Z"), "2026-07-24");
    expect(c.date).toBe("2026-07-24");
    expect(c.time).toBeNull();
  });

  it("sin corte guardado cae al último movimiento y lo marca inferido", () => {
    expect(buildCutoff(null, "2026-07-24")).toEqual({
      date: "2026-07-24", time: null, inferred: true,
    });
  });

  it("sede sin datos → fecha null (el dashboard avisa, no inventa)", () => {
    expect(buildCutoff(null, null).date).toBeNull();
  });
});

describe("formatCutoff", () => {
  it("con hora la escribe en 12h como habla Jahnn", () => {
    expect(formatCutoff({ date: "2026-07-24", time: "18:30", inferred: false }))
      .toBe("24/07 6:30 p.m.");
  });

  it("mañana → a.m.; medianoche y mediodía no salen como 0", () => {
    expect(formatCutoff({ date: "2026-07-24", time: "09:05", inferred: false })).toBe("24/07 9:05 a.m.");
    expect(formatCutoff({ date: "2026-07-24", time: "00:15", inferred: false })).toBe("24/07 12:15 a.m.");
    expect(formatCutoff({ date: "2026-07-24", time: "12:00", inferred: false })).toBe("24/07 12:00 p.m.");
  });

  it("día completo → solo la fecha; sin datos → guion", () => {
    expect(formatCutoff({ date: "2026-07-24", time: null, inferred: true })).toBe("24/07");
    expect(formatCutoff({ date: null, time: null, inferred: true })).toBe("—");
  });
});

describe("cutoffIsStale", () => {
  it("el caso real: lunes 27 mirando datos del viernes 24", () => {
    expect(cutoffIsStale({ date: "2026-07-24", time: "18:30", inferred: false }, "2026-07-27")).toBe(true);
  });

  it("datos de hoy no están atrasados; sin datos tampoco alarma", () => {
    expect(cutoffIsStale({ date: "2026-07-27", time: null, inferred: true }, "2026-07-27")).toBe(false);
    expect(cutoffIsStale({ date: null, time: null, inferred: true }, "2026-07-27")).toBe(false);
  });
});
