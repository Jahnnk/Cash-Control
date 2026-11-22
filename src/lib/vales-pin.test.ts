/**
 * Tests del PIN de caja: que el PIN sea uniforme y de 6 dígitos, que lo que
 * teclea el cajero se normalice, y que los avisos de intentos sean claros.
 */
import { describe, it, expect } from "vitest";
import {
  generarPin, normalizarPin, formatoPinValido, intentosRestantes, mensajePinIncorrecto,
  MAX_INTENTOS_PIN, MINUTOS_BLOQUEO_PIN,
} from "./vales-pin";

describe("generarPin", () => {
  it("siempre son 6 dígitos, con ceros a la izquierda", () => {
    for (let i = 0; i < 500; i++) expect(generarPin()).toMatch(/^\d{6}$/);
    expect(generarPin(() => 42)).toBe("000042");
    expect(generarPin(() => 999_999)).toBe("999999");
  });

  it("descarta lo que sesgaría el reparto (>= 4.294.000.000)", () => {
    const valores = [4_294_967_295, 4_294_000_000, 123_456];
    let i = 0;
    expect(generarPin(() => valores[i++])).toBe("123456");
    expect(i).toBe(3);
  });

  it("no repite siempre el mismo", () => {
    expect(new Set(Array.from({ length: 200 }, () => generarPin())).size).toBeGreaterThan(150);
  });
});

describe("normalizarPin / formatoPinValido", () => {
  it("deja solo los dígitos", () => {
    expect(normalizarPin(" 123 456 ")).toBe("123456");
    expect(normalizarPin("12-34-56")).toBe("123456");
  });
  it("exige exactamente 6 dígitos", () => {
    expect(formatoPinValido("123456")).toBe(true);
    expect(formatoPinValido("000000")).toBe(true);
    expect(formatoPinValido("12345")).toBe(false);
    expect(formatoPinValido("1234567")).toBe(false);
    expect(formatoPinValido("12345a")).toBe(false);
  });
});

describe("intentos", () => {
  it("cuenta lo que queda y avisa del bloqueo al quinto fallo", () => {
    expect(intentosRestantes(1)).toBe(MAX_INTENTOS_PIN - 1);
    expect(intentosRestantes(MAX_INTENTOS_PIN)).toBe(0);
    expect(intentosRestantes(99)).toBe(0);
    expect(mensajePinIncorrecto(1)).toContain("quedan 4 intentos");
    expect(mensajePinIncorrecto(4)).toContain("queda 1 intento");
    expect(mensajePinIncorrecto(5)).toContain(`${MINUTOS_BLOQUEO_PIN} minutos`);
  });
});
