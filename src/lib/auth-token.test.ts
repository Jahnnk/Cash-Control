import { describe, it, expect } from "vitest";
import { createAuthToken, verifyAuthToken } from "./auth-token";

const NOW = 1_780_000_000; // epoch fijo para tests deterministas
const SECRET = "mi-clave-secreta";

describe("auth-token (sesión firmada)", () => {
  it("roundtrip: token recién creado verifica OK", async () => {
    const token = await createAuthToken(SECRET, NOW + 3600);
    expect(await verifyAuthToken(token, SECRET, NOW)).toBe(true);
  });

  it("token expirado NO verifica", async () => {
    const token = await createAuthToken(SECRET, NOW - 1);
    expect(await verifyAuthToken(token, SECRET, NOW)).toBe(false);
  });

  it("expiración exacta (exp === now) NO verifica", async () => {
    const token = await createAuthToken(SECRET, NOW);
    expect(await verifyAuthToken(token, SECRET, NOW)).toBe(false);
  });

  it("firma manipulada NO verifica", async () => {
    const token = await createAuthToken(SECRET, NOW + 3600);
    const tampered = token.slice(0, -2) + (token.endsWith("00") ? "11" : "00");
    expect(await verifyAuthToken(tampered, SECRET, NOW)).toBe(false);
  });

  it("expiración manipulada (extender sesión) NO verifica", async () => {
    const token = await createAuthToken(SECRET, NOW + 3600);
    const [v, , sig] = token.split(".");
    const extended = `${v}.${NOW + 999999}.${sig}`;
    expect(await verifyAuthToken(extended, SECRET, NOW)).toBe(false);
  });

  it("clave incorrecta NO verifica (cambiar APP_PASSWORD invalida sesiones)", async () => {
    const token = await createAuthToken(SECRET, NOW + 3600);
    expect(await verifyAuthToken(token, "otra-clave", NOW)).toBe(false);
  });

  it("fail-closed: sin secret o sin token NO verifica", async () => {
    const token = await createAuthToken(SECRET, NOW + 3600);
    expect(await verifyAuthToken(token, undefined, NOW)).toBe(false);
    expect(await verifyAuthToken(token, "", NOW)).toBe(false);
    expect(await verifyAuthToken(undefined, SECRET, NOW)).toBe(false);
    expect(await verifyAuthToken("", SECRET, NOW)).toBe(false);
  });

  it("tokens malformados NO verifican", async () => {
    for (const bad of ["v1.123", "v2.999.abc", "garbage", "v1..sig", "v1.NaN.deadbeef"]) {
      expect(await verifyAuthToken(bad, SECRET, NOW)).toBe(false);
    }
  });
});
