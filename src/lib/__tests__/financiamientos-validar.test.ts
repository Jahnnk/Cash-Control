import { describe, expect, it } from "vitest";
import { validarFinanciamiento } from "../financiamientos-validar";

describe("validar ficha de financiamiento", () => {
  it("acepta una ficha mínima y deja lo vacío en null", () => {
    const r = validarFinanciamiento({ businessId: 1, nombre: "  Préstamo familiar " });
    expect(r).toMatchObject({ ok: true, ficha: { nombre: "Préstamo familiar", cuota: null, montoOriginal: null, cuotasTotal: null, incluyeIntereses: null, id: null } });
  });
  it("rechaza sede, nombre y números inválidos", () => {
    expect(validarFinanciamiento({ businessId: 9, nombre: "x" }).ok).toBe(false);
    expect(validarFinanciamiento({ businessId: 1, nombre: " " }).ok).toBe(false);
    expect(validarFinanciamiento({ businessId: 1, nombre: "x", montoOriginal: -5 }).ok).toBe(false);
    expect(validarFinanciamiento({ businessId: 1, nombre: "x", cuotasTotal: 2.5 }).ok).toBe(false);
    expect(validarFinanciamiento({ businessId: 1, nombre: "x", diaPago: 32 }).ok).toBe(false);
    expect(validarFinanciamiento({ businessId: 1, nombre: "x", patron: "(" }).ok).toBe(false);
    expect(validarFinanciamiento({ businessId: 1, nombre: "x", desde: "2026-13-45" }).ok).toBe(false);
  });
  it("redondea a céntimos y conserva el id al corregir", () => {
    const r = validarFinanciamiento({ id: 4, businessId: 2, nombre: "Diners", cuota: 411.604, incluyeIntereses: true, diaPago: 8 });
    expect(r).toMatchObject({ ok: true, ficha: { id: 4, cuota: 411.6, incluyeIntereses: true, diaPago: 8 } });
  });
});
