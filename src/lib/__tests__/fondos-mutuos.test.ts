import { describe, it, expect } from "vitest";
import { estadoDelFondo } from "../fondos-mutuos";

describe("saldo de los fondos mutuos", () => {
  it("sin saldo anotado no inventa nada", () => {
    expect(estadoDelFondo(null, 5000, 0).estimado).toBeNull();
  });
  it("suma lo depositado y resta lo rescatado desde la fecha anotada", () => {
    const e = estadoDelFondo({ saldo: 20000, fecha: "2026-10-31" }, 5000, 2400);
    expect(e.estimado).toBe(22600);
    expect(e.depositos).toBe(5000);
    expect(e.rescates).toBe(2400);
  });
  it("nunca baja de cero", () => {
    expect(estadoDelFondo({ saldo: 1000, fecha: "2026-10-31" }, 0, 2400).estimado).toBe(0);
  });
});
