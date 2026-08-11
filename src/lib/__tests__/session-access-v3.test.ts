/**
 * getSessionRole con tokens v3: la resolución de la sesión de un
 * usuario del personal contra la tabla app_users. Fail-closed en cada
 * paso — usuario inactivo, hash cambiado o BD caída = sin sesión.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUserToken, createAuthToken } from "../auth-token";

const fake = vi.hoisted(() => {
  const state = {
    cookieToken: undefined as string | undefined,
    row: null as { scope: string; password_hash: string } | null,
    dbThrows: false,
  };
  const makeTag = () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    void values;
    return { then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
      if (state.dbThrows) return Promise.reject(new Error("db down")).then(ok, err);
      const text = strings.join(" $ ");
      const rows = text.includes("FROM app_users") && state.row && state.row !== null ? [state.row] : [];
      return Promise.resolve(rows).then(ok, err);
    } };
  };
  return { state, makeTag };
});

vi.mock("@neondatabase/serverless", () => ({ neon: () => fake.makeTag() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => (fake.state.cookieToken ? { value: fake.state.cookieToken } : undefined) })),
}));

import { getSessionRole } from "../session-access";

const HASH = "s1.0123456789abcdef0123456789abcdef." + "ab".repeat(32);
const NOW = Math.floor(Date.now() / 1000);

beforeEach(() => {
  fake.state.cookieToken = undefined;
  fake.state.row = null;
  fake.state.dbThrows = false;
  delete process.env.APP_PASSWORD; // sin env: solo el camino v3 puede validar
  delete process.env.APP_PASSWORD_KELLY;
});

describe("getSessionRole — dos llaves de dirección (jul-2026)", () => {
  it("la llave PROPIA de Kelly da sesión completa (revocable por separado)", async () => {
    process.env.APP_PASSWORD_KELLY = "llave-de-kelly-9999";
    fake.state.cookieToken = await createAuthToken("llave-de-kelly-9999", NOW + 3600);
    // Desde ago-2026 la sesión además dice QUIÉN entró: el Highlight lo
    // asignan varias personas y hay que poder firmarlo.
    expect(await getSessionRole()).toEqual({ kind: "full", quien: "kelly" });
  });

  it("cambiar la llave de Kelly mata SUS sesiones sin tocar la maestra", async () => {
    process.env.APP_PASSWORD = "llave-maestra-1111";
    process.env.APP_PASSWORD_KELLY = "llave-nueva-de-kelly";
    // Sesión firmada con la llave VIEJA de Kelly → muere.
    fake.state.cookieToken = await createAuthToken("llave-vieja-de-kelly", NOW + 3600);
    expect(await getSessionRole()).toBeNull();
    // La maestra sigue viva, y se distingue de la de Kelly.
    fake.state.cookieToken = await createAuthToken("llave-maestra-1111", NOW + 3600);
    expect(await getSessionRole()).toEqual({ kind: "full", quien: "jahnn" });
    delete process.env.APP_PASSWORD;
  });

  it("sin APP_PASSWORD_KELLY configurada, nada cambia (solo la maestra)", async () => {
    fake.state.cookieToken = await createAuthToken("cualquier-cosa", NOW + 3600);
    expect(await getSessionRole()).toBeNull();
  });
});

describe("getSessionRole — tokens v3 (app_users)", () => {
  it("usuario activo con firma válida → rol admin de SU sede", async () => {
    fake.state.cookieToken = await createUserToken(HASH, 7, NOW + 3600);
    fake.state.row = { scope: "admin-atelier", password_hash: HASH };
    expect(await getSessionRole()).toEqual({ kind: "admin", sede: 1 });
  });

  it("scope de verificador → kind verif", async () => {
    fake.state.cookieToken = await createUserToken(HASH, 7, NOW + 3600);
    fake.state.row = { scope: "verif-centro", password_hash: HASH };
    expect(await getSessionRole()).toEqual({ kind: "verif", sede: 3 });
  });

  it("usuario INHABILITADO (sin fila activa) → null al instante", async () => {
    fake.state.cookieToken = await createUserToken(HASH, 7, NOW + 3600);
    fake.state.row = null; // la query filtra active=true
    expect(await getSessionRole()).toBeNull();
  });

  it("contraseña cambiada (hash nuevo en BD) → la sesión vieja muere", async () => {
    fake.state.cookieToken = await createUserToken(HASH, 7, NOW + 3600);
    fake.state.row = { scope: "admin-fonavi", password_hash: "s1.otro." + "cd".repeat(32) };
    expect(await getSessionRole()).toBeNull();
  });

  it("BD caída → null (fail-closed), nunca revienta", async () => {
    fake.state.cookieToken = await createUserToken(HASH, 7, NOW + 3600);
    fake.state.dbThrows = true;
    expect(await getSessionRole()).toBeNull();
  });

  it("sin cookie → null sin tocar la BD", async () => {
    expect(await getSessionRole()).toBeNull();
  });
});
