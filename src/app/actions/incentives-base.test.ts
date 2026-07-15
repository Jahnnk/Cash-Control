/**
 * La base del programa de incentivos manda sobre TODAS las metas
 * (cada nivel = base + delta). Dos candados innegociables:
 *
 *  1. Solo la dirección la mueve. El bono del admin depende de ese
 *     número — bajarlo le facilita cobrar. Nadie mueve su propia valla.
 *  2. Un mes ya liquidado tiene la base congelada en su acta: cambiarla
 *     re-escribiría bonos ya pagados.
 *
 * Además, crear la config de un mes nuevo debe HEREDAR niveles/margen/
 * piso/pozo de la vigente: un mes con solo la base quedaría sin niveles.
 * Driver de BD falso — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeQuery = { text: string; values: unknown[] };

const fake = vi.hoisted(() => {
  const state = {
    queries: [] as FakeQuery[],
    full: true,
    /** Filas que devuelve incentive_liquidations (vacío = mes abierto). */
    liquidations: [] as unknown[],
  };
  const respond = (text: string): unknown[] => {
    if (text.includes("FROM incentive_liquidations")) return state.liquidations;
    if (text.includes("INSERT INTO incentive_config")) return [{ id: "cfg-1" }];
    if (text.includes("FROM incentive_config")) {
      return [{
        effective_month: "2026-07",
        base: 25.44,
        levels: [{ nombre: "Nivel 1", delta: 1.5 }, { nombre: "Nivel 2", delta: 3 }],
      }];
    }
    if (text.includes("FROM upselling_daily")) {
      return [{ month: "2026-06", revenue: 24700, personas: 1000, dias: 30 }];
    }
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
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => 2) }));
vi.mock("@/lib/session-access", () => ({
  getSessionRole: vi.fn(async () => (fake.state.full ? { kind: "full" } : { kind: "admin", sede: 2 })),
  requireFullSession: vi.fn(async () => fake.state.full),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveIncentiveBase, getBaseEditor } from "./incentives";

const upsert = () => fake.state.queries.find((q) => q.text.includes("INSERT INTO incentive_config"));

beforeEach(() => {
  fake.state.queries.length = 0;
  fake.state.full = true;
  fake.state.liquidations = [];
});

describe("saveIncentiveBase — quién puede y cuándo", () => {
  it("el ADMIN no puede mover su propia valla", async () => {
    fake.state.full = false;
    const r = await saveIncentiveBase({ effectiveMonth: "2026-07", ticketBase: 24.7 });
    expect(r).toEqual({ ok: false, error: "La base del programa la ajusta solo la dirección." });
    expect(upsert()).toBeUndefined(); // ni siquiera llega a la BD
  });

  it("la dirección sí puede: guarda la base del mes indicado", async () => {
    const r = await saveIncentiveBase({ effectiveMonth: "2026-07", ticketBase: 24.7 });
    expect(r.ok).toBe(true);
    const q = upsert()!;
    expect(q.values).toContain(24.7);
    expect(q.values).toContain("2026-07");
  });

  it("un mes ya LIQUIDADO tiene la base congelada en su acta", async () => {
    fake.state.liquidations = [{ "?column?": 1 }];
    const r = await saveIncentiveBase({ effectiveMonth: "2026-06", ticketBase: 24.7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya está liquidado");
    expect(upsert()).toBeUndefined();
  });

  it("hereda niveles/margen/piso/pozo de la config vigente y solo pisa la base", async () => {
    await saveIncentiveBase({ effectiveMonth: "2026-08", ticketBase: 24.7 });
    const t = upsert()!.text;
    // INSERT ... SELECT de la config vigente = el mes nuevo nace con niveles.
    expect(t).toContain("SELECT");
    expect(t).toContain("margin_pct, traffic_floor, pool_pct, levels");
    expect(t).toContain("effective_month <= ");
    // Solo la base se sobreescribe si el mes ya existía.
    expect(t).toContain("DO UPDATE SET ticket_base = EXCLUDED.ticket_base");
    expect(t).not.toContain("DO UPDATE SET levels");
  });

  it("redondea a céntimos (nunca cuelas binarias en el número que manda)", async () => {
    await saveIncentiveBase({ effectiveMonth: "2026-07", ticketBase: 24.7049 });
    expect(upsert()!.values).toContain(24.7);
  });

  it.each([
    ["cero", 0],
    ["negativa", -5],
    ["absurda (no es un ticket)", 500],
  ])("rechaza una base %s", async (_label, base) => {
    const r = await saveIncentiveBase({ effectiveMonth: "2026-07", ticketBase: base });
    expect(r.ok).toBe(false);
    expect(upsert()).toBeUndefined();
  });

  it("rechaza un mes con formato inválido", async () => {
    const r = await saveIncentiveBase({ effectiveMonth: "julio", ticketBase: 24.7 });
    expect(r).toEqual({ ok: false, error: "Mes inválido." });
  });
});

describe("getBaseEditor — la evidencia para decidir", () => {
  it("el admin no ve el editor", async () => {
    fake.state.full = false;
    const r = await getBaseEditor("2026-07");
    expect(r.ok).toBe(false);
  });

  it("devuelve la base vigente, sus niveles y el ticket real de meses cerrados", async () => {
    const r = await getBaseEditor("2026-07");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.ticketBase).toBe(25.44);
    expect(r.data.levels).toEqual([{ nombre: "Nivel 1", delta: 1.5 }, { nombre: "Nivel 2", delta: 3 }]);
    expect(r.data.reference[0]).toEqual({ month: "2026-06", ticket: 24.7, dias: 30 });
    expect(r.data.liquidated).toBe(false);
  });

  it("la referencia EXCLUYE el mes en curso (está a medias y arrastra la base)", async () => {
    await getBaseEditor("2026-07");
    const q = fake.state.queries.find((x) => x.text.includes("FROM upselling_daily"))!;
    expect(q.text).toContain("to_char(date, 'YYYY-MM') < ");
  });

  it("avisa cuando el mes ya está liquidado", async () => {
    fake.state.liquidations = [{ "?column?": 1 }];
    const r = await getBaseEditor("2026-07");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.liquidated).toBe(true);
  });
});
