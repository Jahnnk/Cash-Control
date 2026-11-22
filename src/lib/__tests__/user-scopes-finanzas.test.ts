import { describe, expect, it } from "vitest";
import { USER_SCOPES, rutaBloqueadaParaFinanzas } from "../user-scopes";

describe("gerencia de finanzas", () => {
  it("se puede asignar; «direccion-kelly» ya no", () => {
    expect(USER_SCOPES).toContain("finanzas");
    expect(USER_SCOPES).not.toContain("direccion-kelly");
  });
  it("no abre Configuración (de ninguna sede) ni el Sistema de Dirección", () => {
    for (const r of ["/grupo/configuracion", "/atelier/configuracion", "/fonavi/configuracion/x", "/grupo/direccion", "/grupo/direccion/precios"]) {
      expect(rutaBloqueadaParaFinanzas(r)).toBe(true);
    }
  });
  it("sí abre lo demás", () => {
    for (const r of ["/grupo/dashboard", "/grupo/reportes", "/grupo/presupuesto", "/grupo/por-definir", "/atelier/registro", "/grupo/direccionx", "/inicio", "/api/pase"]) {
      expect(rutaBloqueadaParaFinanzas(r)).toBe(false);
    }
  });
});
