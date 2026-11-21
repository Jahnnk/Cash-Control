import { describe, expect, it } from "vitest";
import { normalizarEmail, quienDireccion } from "../user-scopes";

describe("cuentas personales (puerta única)", () => {
  it("correo normalizado o null", () => {
    expect(normalizarEmail("  Luis@Yayis.PE ")).toBe("luis@yayis.pe");
    expect(normalizarEmail("luis@")).toBeNull();
    expect(normalizarEmail("")).toBeNull();
  });
  it("quién es la dirección", () => {
    expect(quienDireccion("direccion-jahnn")).toBe("jahnn");
    expect(quienDireccion("direccion-kelly")).toBe("kelly");
    expect(quienDireccion("admin-atelier")).toBeNull();
  });
});
