import { describe, it, expect } from "vitest";
import { esSueldoDeSocio } from "../sueldo-socios";

describe("el sueldo de los socios dentro de la planilla", () => {
  it("reconoce «SUELDO … (socio)» y el débito vehicular de Atelier", () => {
    expect(esSueldoDeSocio("PLANILLA", "SUELDO SETIEMBRE 2026 (JAHNN KARLO ROJAS)")).toBe(true);
    expect(esSueldoDeSocio("PLANILLA", "SUELDO AGOSTO 26 (JUANI TERRONES)")).toBe(true);
    expect(esSueldoDeSocio("PLANILLA", "PRESTAMOS VEHICULAR")).toBe(true);
    expect(esSueldoDeSocio("PLANILLA", "préstamo vehicular")).toBe(true);
  });
  it("no confunde: el sueldo de otras personas ni lo que los socios compran para el negocio", () => {
    expect(esSueldoDeSocio("PLANILLA", "SUELDO SETIEMBRE 2026 (ESTHER PEREZ)")).toBe(false);
    expect(esSueldoDeSocio("OFICINA Y SISTEMAS", "SUSCRIPCION CLAUDE (JAHNN KARLO ROJAS)")).toBe(false);
    expect(esSueldoDeSocio("UTILIDADES A SOCIOS", "ADELANTO UTILIDADES 2026 – 1200 (JUANI TERRONES)")).toBe(false);
    expect(esSueldoDeSocio("PLANILLA", null)).toBe(false);
  });
});
