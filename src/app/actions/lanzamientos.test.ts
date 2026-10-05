/**
 * Fecha exacta de lanzamiento de un producto nuevo (5-oct-2026): solo dirección,
 * fecha válida y no futura, una por producto. Driver de BD falso — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeQuery = { text: string; values: unknown[] };
const fake = vi.hoisted(() => {
  const state = { queries: [] as FakeQuery[], full: true, falla: false };
  const makeTag = () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q: FakeQuery = { text: strings.join(" $ "), values };
    state.queries.push(q);
    return { then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      (state.falla ? Promise.reject(new Error("boom")) : Promise.resolve([])).then(ok, err) };
  };
  return { state, makeTag };
});
vi.mock("@neondatabase/serverless", () => ({ neon: () => fake.makeTag() }));
vi.mock("@/lib/session-access", () => ({
  getSessionRole: vi.fn(async () => (fake.state.full ? { kind: "full", quien: "jahnn" } : { kind: "admin", sede: 2 })),
  requireFullSession: vi.fn(async () => fake.state.full),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { guardarLanzamiento, quitarLanzamiento } from "./productos-panorama";
import { claveByte } from "@/lib/productos/costos-carta";

const CLAVE = claveByte("CUCHAREABLE DE CARROT");

const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const ayer = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const manana = new Date(Date.now() + 2 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const insertado = () => fake.state.queries.find((q) => q.text.includes("INSERT INTO productos_lanzamiento"));

describe("guardarLanzamiento", () => {
  beforeEach(() => { fake.state.queries.length = 0; fake.state.full = true; fake.state.falla = false; });

  it("guarda la fecha con la clave normalizada del producto", async () => {
    const r = await guardarLanzamiento({ nombre: "CUCHAREABLE DE CARROT", fecha: ayer });
    expect(r.ok).toBe(true);
    const q = insertado()!;
    expect(q.values[0]).toBe(CLAVE);
    expect(CLAVE).toBeTruthy();
    expect(q.values).toContain(ayer);
    expect(q.text).toMatch(/ON CONFLICT \(clave\) DO UPDATE/);
  });

  it("acepta hoy", async () => {
    expect((await guardarLanzamiento({ nombre: "X Producto", fecha: hoy })).ok).toBe(true);
  });

  it("rechaza fechas futuras, inválidas o muy antiguas", async () => {
    for (const fecha of [manana, "2026-02-31", "ayer", "", "2023-12-31"]) {
      const r = await guardarLanzamiento({ nombre: "X Producto", fecha });
      expect(r.ok).toBe(false);
    }
    expect(insertado()).toBeUndefined();
  });

  it("solo dirección: un administrador de sede no puede", async () => {
    fake.state.full = false;
    const r = await guardarLanzamiento({ nombre: "X Producto", fecha: ayer });
    expect(r).toEqual({ ok: false, error: "Solo dirección." });
    expect(insertado()).toBeUndefined();
  });

  it("sin nombre no guarda", async () => {
    expect((await guardarLanzamiento({ nombre: "  ", fecha: ayer })).ok).toBe(false);
  });

  it("si la base falla, avisa sin tumbar nada", async () => {
    fake.state.falla = true;
    const r = await guardarLanzamiento({ nombre: "X Producto", fecha: ayer });
    expect(r).toEqual({ ok: false, error: "No se pudo guardar la fecha." });
  });
});

describe("quitarLanzamiento", () => {
  beforeEach(() => { fake.state.queries.length = 0; fake.state.full = true; fake.state.falla = false; });
  it("borra solo la fecha de ese producto", async () => {
    expect((await quitarLanzamiento("CUCHAREABLE DE CARROT")).ok).toBe(true);
    const q = fake.state.queries.find((x) => x.text.includes("DELETE FROM productos_lanzamiento"))!;
    expect(q.values).toEqual([CLAVE]);
  });
  it("solo dirección", async () => {
    fake.state.full = false;
    expect(await quitarLanzamiento("X")).toEqual({ ok: false, error: "Solo dirección." });
  });
});
