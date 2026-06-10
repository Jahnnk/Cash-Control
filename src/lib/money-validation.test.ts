import { describe, it, expect } from "vitest";
import { validateAmount, validateMovementDate, MAX_AMOUNT } from "./money-validation";

describe("validateAmount", () => {
  it("acepta montos válidos", () => {
    expect(validateAmount(0.01)).toBeNull();
    expect(validateAmount(2700)).toBeNull();
    expect(validateAmount(MAX_AMOUNT)).toBeNull();
  });

  it("rechaza monto negativo y cero", () => {
    expect(validateAmount(-500)).toMatch(/mayor a 0/);
    expect(validateAmount(0)).toMatch(/mayor a 0/);
  });

  it("rechaza NaN/Infinity con mensaje claro", () => {
    expect(validateAmount(NaN)).toMatch(/no es un número válido/);
    expect(validateAmount(Infinity)).toMatch(/no es un número válido/);
  });

  it("rechaza montos por encima del tope (typo de dígito de más)", () => {
    expect(validateAmount(MAX_AMOUNT + 0.01)).toMatch(/no puede superar/);
    expect(validateAmount(8_000_000)).toMatch(/dígito de más/);
  });
});

describe("validateMovementDate", () => {
  const TODAY = "2026-06-10";

  it("acepta hoy y fechas pasadas", () => {
    expect(validateMovementDate("2026-06-10", TODAY)).toBeNull();
    expect(validateMovementDate("2026-06-01", TODAY)).toBeNull();
    expect(validateMovementDate("2025-12-31", TODAY)).toBeNull();
  });

  it("rechaza fecha futura con mensaje claro", () => {
    expect(validateMovementDate("2026-06-11", TODAY)).toMatch(/fecha futura/);
    expect(validateMovementDate("2027-01-01", TODAY)).toMatch(/fecha futura/);
  });

  it("rechaza formatos inválidos", () => {
    for (const bad of ["10/06/2026", "2026-6-1", "", "ayer", "2026-06-10T12:00"]) {
      expect(validateMovementDate(bad, TODAY)).toBe("Fecha inválida");
    }
  });
});
