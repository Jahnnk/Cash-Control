/**
 * Gestión de usuarios del personal. Los candados que protegen:
 *  1. SOLO la dirección gestiona accesos (un admin no puede crearse
 *     usuarios ni resetear contraseñas ajenas).
 *  2. Nunca se guarda ni devuelve la contraseña en claro salvo UNA vez
 *     al generarla; en la BD solo entra el hash scrypt.
 *  3. El rol solo puede ser uno de los 5 del personal — jamás 'full'.
 * Driver de BD falso — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeQuery = { text: string; values: unknown[] };

const fake = vi.hoisted(() => {
  const state = {
    queries: [] as FakeQuery[],
    full: true,
    hashes: [] as string[], // password_hash existentes (para colisiones)
  };
  const respond = (text: string): unknown[] => {
    if (text.includes("SELECT password_hash FROM app_users")) {
      return state.hashes.map((h) => ({ password_hash: h }));
    }
    if (text.includes("INSERT INTO app_users")) return [{ id: 42 }];
    if (text.includes("UPDATE app_users")) return [{ id: 42 }];
    return [];
  };
  const makeTag = () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q: FakeQuery = { text: strings.join(" $ "), values };
    state.queries.push(q);
    return { then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(respond(q.text)).then(ok, err) };
  };
  return { state, makeTag };
});

vi.mock("@neondatabase/serverless", () => ({ neon: () => fake.makeTag() }));
vi.mock("@/lib/session-access", () => ({
  requireFullSession: vi.fn(async () => fake.state.full),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createUser, resetUserPassword, setUserActive } from "./users";

const insert = () => fake.state.queries.find((q) => q.text.includes("INSERT INTO app_users"));

beforeEach(() => {
  fake.state.queries.length = 0;
  fake.state.full = true;
  fake.state.hashes = [];
});

describe("createUser — solo dirección, solo roles del personal", () => {
  it("un ADMIN no puede crear usuarios (ni a sí mismo otro acceso)", async () => {
    fake.state.full = false;
    const r = await createUser({ nombre: "Intruso", scope: "admin-fonavi" });
    expect(r.ok).toBe(false);
    expect(insert()).toBeUndefined();
  });

  it("la dirección crea y recibe la contraseña UNA vez (formato del generador)", async () => {
    const r = await createUser({ nombre: "María Quispe", scope: "admin-atelier" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.password).toMatch(/^\d{4}(-[a-z]+){4}$/);
  });

  it("a la BD entra el HASH, nunca la contraseña en claro", async () => {
    const r = await createUser({ nombre: "María", scope: "verif-fonavi" });
    if (!r.ok) throw new Error("debió crear");
    const vals = insert()!.values.map(String);
    expect(vals.some((v) => v.startsWith("s1."))).toBe(true);
    expect(vals).not.toContain(r.password);
  });

  it("rechaza el rol 'full' u otro rol inventado — la llave maestra no se crea desde aquí", async () => {
    for (const scope of ["full", "admin-grupo", "root", ""]) {
      const r = await createUser({ nombre: "Nadie", scope });
      expect(r.ok).toBe(false);
    }
    expect(insert()).toBeUndefined();
  });

  it("rechaza nombres vacíos o de una letra", async () => {
    const r = await createUser({ nombre: " x ", scope: "admin-fonavi" });
    expect(r.ok).toBe(false);
  });
});

describe("resetUserPassword / setUserActive", () => {
  it("el reset genera contraseña nueva y escribe el hash (la sesión vieja muere con el hash)", async () => {
    const r = await resetUserPassword(42);
    expect(r.ok).toBe(true);
    const upd = fake.state.queries.find((q) => q.text.includes("UPDATE app_users SET password_hash"))!;
    expect(upd.values.map(String).some((v) => v.startsWith("s1."))).toBe(true);
  });

  it("solo dirección resetea e inhabilita", async () => {
    fake.state.full = false;
    expect((await resetUserPassword(42)).ok).toBe(false);
    expect((await setUserActive({ id: 42, active: false })).ok).toBe(false);
    expect(fake.state.queries.filter((q) => q.text.includes("UPDATE"))).toHaveLength(0);
  });

  it("inhabilitar escribe active=false en la fila indicada", async () => {
    const r = await setUserActive({ id: 42, active: false });
    expect(r.ok).toBe(true);
    const upd = fake.state.queries.find((q) => q.text.includes("SET active"))!;
    expect(upd.values).toContain(false);
    expect(upd.values).toContain(42);
  });
});
