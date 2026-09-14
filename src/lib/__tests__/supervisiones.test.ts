import { describe, it, expect } from "vitest";
import {
  plazoDesde, situacionObservacion, resumirSupervisionMes, horasRestantes, correccionLlegoTarde,
  type Observacion,
} from "../supervisiones";

const obs = (o: Partial<Observacion>): Observacion => ({
  id: "x", gravedad: "critica", estado: "abierta", fechaVisita: "2026-10-06",
  plazoHasta: "2026-10-07T15:00:00.000Z", corregidaEn: null, vencidaAlgunaVez: false, ...o,
});

describe("plazos", () => {
  it("crítica 24 h, normal 7 días", () => {
    expect(plazoDesde("2026-10-06T15:00:00.000Z", "critica")).toBe("2026-10-07T15:00:00.000Z");
    expect(plazoDesde("2026-10-06T15:00:00.000Z", "normal")).toBe("2026-10-13T15:00:00.000Z");
  });

  it("horas restantes, negativas al vencer", () => {
    expect(horasRestantes("2026-10-07T15:00:00.000Z", "2026-10-07T09:00:00.000Z")).toBe(6);
    expect(horasRestantes("2026-10-07T15:00:00.000Z", "2026-10-07T17:30:00.000Z")).toBe(-2.5);
  });
});

describe("situación de una observación", () => {
  const antes = "2026-10-07T10:00:00.000Z";
  const despues = "2026-10-07T16:00:00.000Z";

  it("abierta dentro del plazo → en plazo; vencida → fuera de plazo", () => {
    expect(situacionObservacion(obs({}), antes)).toBe("en_plazo");
    expect(situacionObservacion(obs({}), despues)).toBe("fuera_de_plazo");
  });

  it("corregida a tiempo espera a Juani, aunque Juani tarde días en revisar", () => {
    const o = obs({ estado: "corregida", corregidaEn: "2026-10-07T14:00:00.000Z" });
    expect(situacionObservacion(o, "2026-10-10T12:00:00.000Z")).toBe("por_confirmar");
    expect(situacionObservacion({ ...o, estado: "confirmada" }, "2026-10-10T12:00:00.000Z")).toBe("cumplida");
  });

  it("corregida después del plazo → fuera de plazo aunque Juani confirme", () => {
    const o = obs({ estado: "confirmada", corregidaEn: "2026-10-07T15:30:00.000Z" });
    expect(situacionObservacion(o, "2026-10-08T00:00:00.000Z")).toBe("fuera_de_plazo");
    expect(correccionLlegoTarde(o)).toBe(true);
  });

  it("un rechazo no lava un atraso", () => {
    // Plazo nuevo tras el rechazo, pero la corrección rechazada ya había llegado tarde.
    const o = obs({ estado: "abierta", plazoHasta: "2026-10-09T15:00:00.000Z", vencidaAlgunaVez: true });
    expect(situacionObservacion(o, "2026-10-08T12:00:00.000Z")).toBe("fuera_de_plazo");
  });
});

describe("resumen del mes (requisito del bono)", () => {
  const ahora = "2026-11-01T12:00:00.000Z";
  const visita = { puntosEvaluados: 10, puntosCumplidos: 8 };

  it("sin visitas → cumple (el equipo no tiene la culpa)", () => {
    const r = resumirSupervisionMes([], [], ahora);
    expect(r.estado).toBe("sin_visitas");
    expect(r.cumple).toBe(true);
    expect(r.puntajePromedio).toBeNull();
  });

  it("visita sin críticas → al día, aunque haya normales vencidas", () => {
    const r = resumirSupervisionMes([visita], [obs({ gravedad: "normal" })], ahora);
    expect(r.estado).toBe("al_dia");
    expect(r.cumple).toBe(true);
    expect(r.normales.fueraDePlazo).toBe(1);
  });

  it("una crítica fuera de plazo → incumplido", () => {
    const r = resumirSupervisionMes([visita], [
      obs({ estado: "confirmada", corregidaEn: "2026-10-07T10:00:00.000Z" }),
      obs({ id: "y" }),
    ], ahora);
    expect(r.estado).toBe("incumplido");
    expect(r.cumple).toBe(false);
    expect(r.criticas).toMatchObject({ total: 2, cumplidas: 1, fueraDePlazo: 1 });
  });

  it("crítica esperando la confirmación de Juani → pendiente, todavía no cumple", () => {
    const r = resumirSupervisionMes([visita], [
      obs({ estado: "corregida", corregidaEn: "2026-10-07T10:00:00.000Z" }),
    ], ahora);
    expect(r.estado).toBe("pendiente");
    expect(r.cumple).toBe(false);
  });

  it("puntaje promedio de las visitas", () => {
    const r = resumirSupervisionMes([visita, { puntosEvaluados: 8, puntosCumplidos: 8 }], [], ahora);
    expect(r.puntajePromedio).toBe(90);
  });
});

describe("texto del plazo", () => {
  it("horas, días y vencidas", async () => {
    const { textoPlazo } = await import("../supervisiones");
    expect(textoPlazo("2026-10-07T15:00:00.000Z", "2026-10-07T09:30:00.000Z")).toBe("vence en 5 h");
    expect(textoPlazo("2026-10-13T15:00:00.000Z", "2026-10-07T15:00:00.000Z")).toBe("vence en 6 días");
    expect(textoPlazo("2026-10-07T15:00:00.000Z", "2026-10-07T17:10:00.000Z")).toBe("venció hace 2 h");
    expect(textoPlazo("2026-10-07T15:00:00.000Z", "2026-10-07T14:40:00.000Z")).toBe("vence en menos de 1 h");
  });
});
