/**
 * Regla de los TIEMPOS al guardar el día (bug reportado por el admin,
 * jul-2026): los tiempos tienen dos fuentes — el cronómetro del
 * encargado y el tecleo del admin.
 *
 *  1. Lo MEDIDO manda sobre lo tecleado (dato real > estimación).
 *  2. Un campo vacío NUNCA borra un valor existente (COALESCE).
 *
 * Sin esto, guardar el día con los campos vacíos escribía NULL encima de
 * las mediciones (Fonavi 13-jul perdió mostrador 5.5 / mesa 8.5 así).
 * Driver de BD falso — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeQuery = { text: string; values: unknown[] };

const fake = vi.hoisted(() => {
  const state = {
    queries: [] as FakeQuery[],
    /** Promedios que devuelve service_timings (en segundos). */
    measured: [] as { kind: string; avg_s: number }[],
  };
  const respond = (text: string): unknown[] => {
    if (text.includes("FROM service_timings")) return state.measured;
    return [];
  };
  const makeTag = () => {
    const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q: FakeQuery = { text: strings.join(" $ "), values };
      state.queries.push(q);
      return { then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
        Promise.resolve(respond(q.text)).then(ok, err) };
    };
    return tag;
  };
  return { state, makeTag };
});

vi.mock("@neondatabase/serverless", () => ({ neon: () => fake.makeTag() }));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => 2) }));
vi.mock("@/lib/session-access", () => ({
  getSessionRole: vi.fn(async () => ({ kind: "admin", sede: 2 })),
  requireFullSession: vi.fn(async () => false),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveDailyKpis } from "./kpis";

const DATE = "2026-07-13";
const BASE = { date: DATE, nps: 9.5, mermasSoles: 10, tiempoMin: null, tiempoMesaMin: null };

/** Valores enviados al INSERT de upselling_daily (tiempos = posiciones 5 y 6). */
const upsert = () => fake.state.queries.find((q) => q.text.includes("INSERT INTO upselling_daily"))!;

beforeEach(() => {
  fake.state.queries.length = 0;
  fake.state.measured = [];
});

describe("saveDailyKpis — la regla de los tiempos", () => {
  it("campos VACÍOS con medición: guarda lo medido (no null) — el bug de Fonavi 13-jul", async () => {
    // El encargado midió: mostrador 5.5 min (330s), mesa 8.5 min (510s).
    fake.state.measured = [
      { kind: "mostrador", avg_s: 330 },
      { kind: "mesa", avg_s: 510 },
    ];
    const r = await saveDailyKpis({ ...BASE, tiempoMin: null, tiempoMesaMin: null });
    expect(r.ok).toBe(true);
    const q = upsert();
    expect(q.values).toContain(5.5); // mostrador medido
    expect(q.values).toContain(8.5); // mesa medida
  });

  it("lo MEDIDO manda sobre lo tecleado por el admin", async () => {
    fake.state.measured = [{ kind: "mostrador", avg_s: 330 }]; // 5.5 medido
    const r = await saveDailyKpis({ ...BASE, tiempoMin: 99, tiempoMesaMin: null });
    expect(r.ok).toBe(true);
    const q = upsert();
    expect(q.values).toContain(5.5);   // gana la medición
    expect(q.values).not.toContain(99); // se ignora el tecleo
  });

  it("sin medición: vale lo que teclea el admin", async () => {
    fake.state.measured = [];
    const r = await saveDailyKpis({ ...BASE, tiempoMin: 7, tiempoMesaMin: 12 });
    expect(r.ok).toBe(true);
    const q = upsert();
    expect(q.values).toContain(7);
    expect(q.values).toContain(12);
  });

  it("el upsert usa COALESCE en los tiempos: vacío nunca borra lo guardado", async () => {
    await saveDailyKpis({ ...BASE });
    const t = upsert().text;
    expect(t).toContain("tiempo_atencion_min = COALESCE(EXCLUDED.tiempo_atencion_min, upselling_daily.tiempo_atencion_min)");
    expect(t).toContain("tiempo_mesa_min = COALESCE(EXCLUDED.tiempo_mesa_min, upselling_daily.tiempo_mesa_min)");
  });

  it("NPS y mermas SÍ se sobreescriben (solo tienen una fuente: el admin)", async () => {
    await saveDailyKpis({ ...BASE });
    const t = upsert().text;
    expect(t).toContain("nps = EXCLUDED.nps");
    expect(t).toContain("mermas_soles = EXCLUDED.mermas_soles");
  });

  it("DELIVERY sigue la misma regla: lo medido manda y COALESCE protege", async () => {
    fake.state.measured = [{ kind: "delivery", avg_s: 1080 }]; // 18 min medidos
    const r = await saveDailyKpis({ ...BASE, tiempoDeliveryMin: 99 });
    expect(r.ok).toBe(true);
    const q = upsert();
    expect(q.values).toContain(18);     // gana la medición del encargado
    expect(q.values).not.toContain(99); // se ignora el tecleo
    expect(q.text).toContain("tiempo_delivery_min = COALESCE(EXCLUDED.tiempo_delivery_min, upselling_daily.tiempo_delivery_min)");
  });

  it("si falta la tabla del cronómetro, no rompe: cae al valor tecleado", async () => {
    // El helper measuredTimes captura el error y devuelve nulls.
    fake.state.measured = [];
    const r = await saveDailyKpis({ ...BASE, tiempoMin: 4 });
    expect(r.ok).toBe(true);
    expect(upsert().values).toContain(4);
  });
});
