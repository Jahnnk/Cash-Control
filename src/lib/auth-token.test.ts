import { describe, it, expect } from "vitest";
import {
  createAuthToken,
  verifyAuthToken,
  createScopedToken,
  verifyScopedToken,
} from "./auth-token";

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

// ─────────────────────────────────────────────────────────────────
// Tokens v2 CON ALCANCE — sesiones de admin de sede y verificador.
// Estos tokens dan acceso al Panel de Sede y a la segunda firma:
// cualquier hueco aquí expone datos de sede a la persona equivocada.
// ─────────────────────────────────────────────────────────────────

const SECRETS: Record<string, string> = {
  "admin-fonavi": "clave-luis",
  "admin-centro": "clave-chari",
  "verif-fonavi": "clave-verif-f",
};
const secretFor = (s: string) => SECRETS[s];

describe("auth-token v2 (sesión con alcance)", () => {
  it("roundtrip: devuelve el scope del token", async () => {
    const token = await createScopedToken(SECRETS["admin-fonavi"], "admin-fonavi", NOW + 3600);
    expect(await verifyScopedToken(token, secretFor, NOW)).toBe("admin-fonavi");
  });

  it("token expirado NO verifica (incluye exp === now)", async () => {
    const expired = await createScopedToken(SECRETS["admin-fonavi"], "admin-fonavi", NOW - 1);
    expect(await verifyScopedToken(expired, secretFor, NOW)).toBeNull();
    const exact = await createScopedToken(SECRETS["admin-fonavi"], "admin-fonavi", NOW);
    expect(await verifyScopedToken(exact, secretFor, NOW)).toBeNull();
  });

  it("scope manipulado NO verifica (admin de Fonavi no puede volverse admin de Centro)", async () => {
    const token = await createScopedToken(SECRETS["admin-fonavi"], "admin-fonavi", NOW + 3600);
    const [v, exp, , sig] = token.split(".");
    const tampered = `${v}.${exp}.admin-centro.${sig}`;
    expect(await verifyScopedToken(tampered, secretFor, NOW)).toBeNull();
  });

  it("verificador no puede escalar a admin de su propia sede", async () => {
    const token = await createScopedToken(SECRETS["verif-fonavi"], "verif-fonavi", NOW + 3600);
    const [v, exp, , sig] = token.split(".");
    const escalated = `${v}.${exp}.admin-fonavi.${sig}`;
    expect(await verifyScopedToken(escalated, secretFor, NOW)).toBeNull();
  });

  it("expiración manipulada (extender sesión) NO verifica", async () => {
    const token = await createScopedToken(SECRETS["admin-centro"], "admin-centro", NOW + 3600);
    const [v, , scope, sig] = token.split(".");
    const extended = `${v}.${NOW + 999999}.${scope}.${sig}`;
    expect(await verifyScopedToken(extended, secretFor, NOW)).toBeNull();
  });

  it("firma manipulada NO verifica", async () => {
    const token = await createScopedToken(SECRETS["admin-centro"], "admin-centro", NOW + 3600);
    const tampered = token.slice(0, -2) + (token.endsWith("00") ? "11" : "00");
    expect(await verifyScopedToken(tampered, secretFor, NOW)).toBeNull();
  });

  it("fail-closed: scope sin contraseña configurada NO verifica", async () => {
    // "verif-centro" no está en SECRETS — simula la env var ausente.
    const token = await createScopedToken("cualquier-clave", "verif-centro", NOW + 3600);
    expect(await verifyScopedToken(token, secretFor, NOW)).toBeNull();
    expect(await verifyScopedToken(undefined, secretFor, NOW)).toBeNull();
    expect(await verifyScopedToken("", secretFor, NOW)).toBeNull();
  });

  it("cambiar la contraseña del scope invalida sus sesiones", async () => {
    const token = await createScopedToken("clave-vieja", "admin-fonavi", NOW + 3600);
    expect(await verifyScopedToken(token, secretFor, NOW)).toBeNull();
  });

  it("un token v1 NO verifica como v2, ni un v2 como v1", async () => {
    const v1 = await createAuthToken(SECRET, NOW + 3600);
    expect(await verifyScopedToken(v1, () => SECRET, NOW)).toBeNull();
    const v2 = await createScopedToken(SECRET, "admin-fonavi", NOW + 3600);
    expect(await verifyAuthToken(v2, SECRET, NOW)).toBe(false);
  });

  it("tokens malformados NO verifican", async () => {
    for (const bad of ["v2.123.admin-fonavi", "v2..admin-fonavi.sig", "v2.NaN.admin-fonavi.deadbeef", "garbage.x.y.z"]) {
      expect(await verifyScopedToken(bad, secretFor, NOW)).toBeNull();
    }
  });
});
