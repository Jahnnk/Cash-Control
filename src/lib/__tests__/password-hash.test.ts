/**
 * Hash de contraseñas del personal. Lo que protege: la contraseña en
 * claro nunca se guarda; verificar es la ÚNICA operación posible.
 */
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../password-hash";
import { generateStaffPassword } from "../password-generator";

describe("password-hash (scrypt)", () => {
  it("roundtrip: la contraseña correcta verifica", () => {
    const h = hashPassword("6628-plato-puente-timer-merengue");
    expect(verifyPassword("6628-plato-puente-timer-merengue", h)).toBe(true);
  });

  it("la contraseña equivocada NO verifica (ni por un carácter)", () => {
    const h = hashPassword("6628-plato-puente-timer-merengue");
    expect(verifyPassword("6628-plato-puente-timer-merengues", h)).toBe(false);
    expect(verifyPassword("6628-Plato-puente-timer-merengue", h)).toBe(false);
    expect(verifyPassword("", h)).toBe(false);
  });

  it("misma contraseña → hashes DISTINTOS (salt aleatoria por usuario)", () => {
    expect(hashPassword("igual")).not.toBe(hashPassword("igual"));
  });

  it("el hash guardado no contiene la contraseña en claro", () => {
    const h = hashPassword("palabra-secreta-9999");
    expect(h).not.toContain("palabra");
    expect(h).toMatch(/^s1\.[0-9a-f]{32}\.[0-9a-f]{64}$/);
  });

  it("hash corrupto o de otro formato → false, nunca revienta", () => {
    expect(verifyPassword("x", "s1.zz.zz")).toBe(false);
    expect(verifyPassword("x", "v9.abc")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });
});

describe("password-generator", () => {
  it("formato NNNN-palabra-palabra-palabra-palabra (empieza con dígito: sin mayúscula automática del celular)", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateStaffPassword()).toMatch(/^\d{4}(-[a-z]+){4}$/);
    }
  });

  it("sin palabras repetidas dentro de la misma contraseña", () => {
    for (let i = 0; i < 20; i++) {
      const words = generateStaffPassword().split("-").slice(1);
      expect(new Set(words).size).toBe(4);
    }
  });

  it("dos llamadas → contraseñas distintas (azar criptográfico)", () => {
    expect(generateStaffPassword()).not.toBe(generateStaffPassword());
  });
});
