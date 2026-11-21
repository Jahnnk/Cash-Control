import { describe, expect, it } from "vitest";
import { crearPase, verificarPase } from "../pase";

const S = "clave-compartida-de-prueba-123456";
const T = 1_800_000_000;

describe("pase de un clic", () => {
  it("ida y vuelta: el correo llega a la app correcta", async () => {
    const p = await crearPase(S, " Luis@Yayis.PE ", "envios", T);
    expect(await verificarPase(S, p, "envios", T + 10)).toBe("luis@yayis.pe");
  });
  it("no sirve para otra app, vencido, con otra clave ni alterado", async () => {
    const p = await crearPase(S, "luis@yayis.pe", "envios", T);
    expect(await verificarPase(S, p, "planilla", T)).toBeNull();
    expect(await verificarPase(S, p, "envios", T + 61)).toBeNull();
    expect(await verificarPase("otra-clave-distinta-123456789", p, "envios", T)).toBeNull();
    const [a, d, f] = p.split(".");
    const otro = btoa(JSON.stringify({ e: "jahnn@yayis.pe", a: "envios", x: T + 60 })).replace(/=+$/, "");
    expect(await verificarPase(S, `${a}.${otro}.${f}`, "envios", T)).toBeNull();
    expect(await verificarPase(S, `${a}.${d}`, "envios", T)).toBeNull();
  });
  it("sin clave configurada, nadie entra", async () => {
    const p = await crearPase(S, "luis@yayis.pe", "envios", T);
    expect(await verificarPase(undefined, p, "envios", T)).toBeNull();
    expect(await verificarPase("corta", p, "envios", T)).toBeNull();
  });
});
