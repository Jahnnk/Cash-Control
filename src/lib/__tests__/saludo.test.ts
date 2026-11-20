import { describe, expect, it } from "vitest";
import { fechaLarga, horaLima, saludoPorHora, textoSaludo } from "../saludo";

describe("saludo por hora", () => {
  it("cambia a las 5, 12 y 19 horas", () => {
    expect(saludoPorHora(4)).toBe("Buenas noches");
    expect(saludoPorHora(5)).toBe("Buenos días");
    expect(saludoPorHora(11)).toBe("Buenos días");
    expect(saludoPorHora(12)).toBe("Buenas tardes");
    expect(saludoPorHora(18)).toBe("Buenas tardes");
    expect(saludoPorHora(19)).toBe("Buenas noches");
    expect(saludoPorHora(0)).toBe("Buenas noches");
  });
  it("usa la hora de Lima (UTC−5), no la del servidor", () => {
    // 14:30 UTC = 09:30 en Lima
    expect(horaLima(new Date("2026-11-20T14:30:00Z"))).toBe(9);
    expect(horaLima(new Date("2026-11-21T03:00:00Z"))).toBe(22);
  });
  it("saluda por el primer nombre", () => {
    expect(textoSaludo(new Date("2026-11-20T14:30:00Z"), "Sol Ramírez")).toBe("¡Buenos días, Sol!");
    expect(textoSaludo(new Date("2026-11-20T20:00:00Z"), "Luis")).toBe("¡Buenas tardes, Luis!");
    expect(textoSaludo(new Date("2026-11-21T02:00:00Z"), null)).toBe("¡Buenas noches!");
  });
  it("fecha larga en español", () => {
    expect(fechaLarga(new Date("2026-11-20T14:30:00Z"))).toMatch(/^Viernes, 20 de noviembre de 2026$/);
  });
});
