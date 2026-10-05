/**
 * Freno contra números copiados de otra sede (3-oct-2026: Fonavi quedó con
 * la venta, personas, ítems y NPS de Centro). Guardar un día con la misma
 * venta (al céntimo) y las mismas personas que otra sede ese día pide
 * confirmación; con la confirmación guarda. Driver de BD falso — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sedesConLosMismosNumeros } from "@/lib/incentivos/copia-entre-sedes";

type FakeQuery = { text: string; values: unknown[] };

const fake = vi.hoisted(() => {
  const state = {
    queries: [] as FakeQuery[],
    /** Lo que ya tienen las otras sedes ese día. */
    otras: [] as { revenue: number | null; personas: number | null }[],
    fallaLaConsulta: false,
  };
  const respond = (text: string): unknown[] => {
    if (text.includes("business_id <>")) {
      if (state.fallaLaConsulta) throw new Error("boom");
      return state.otras;
    }
    return [];
  };
  const makeTag = () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q: FakeQuery = { text: strings.join(" $ "), values };
    state.queries.push(q);
    return { then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
      try { return Promise.resolve(respond(q.text)).then(ok, err); }
      catch (e) { return Promise.reject(e).then(ok, err); }
    } };
  };
  return { state, makeTag };
});

vi.mock("@neondatabase/serverless", () => ({ neon: () => fake.makeTag() }));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => 2) }));
vi.mock("@/lib/session-access", () => ({
  getSessionRole: vi.fn(async () => ({ kind: "full" })),
  requireFullSession: vi.fn(async () => true),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveDailyEntry } from "./incentives";

const dia = { date: "2026-10-03", personas: 56, revenue: 1483.7, items: 133 };
const guardo = () => fake.state.queries.some((q) => q.text.includes("INSERT INTO upselling_daily"));

describe("sedesConLosMismosNumeros (regla pura)", () => {
  const nuevo = { revenue: 1483.7, personas: 56 };
  it("detecta la misma venta y las mismas personas", () => {
    expect(sedesConLosMismosNumeros(nuevo, [{ revenue: 1483.7, personas: 56 }])).toBe(1);
  });
  it("misma venta pero otras personas: no es copia", () => {
    expect(sedesConLosMismosNumeros(nuevo, [{ revenue: 1483.7, personas: 55 }])).toBe(0);
  });
  it("mismas personas pero otra venta: no es copia", () => {
    expect(sedesConLosMismosNumeros(nuevo, [{ revenue: 1483.8, personas: 56 }])).toBe(0);
  });
  it("compara al céntimo, sin errores de decimales", () => {
    expect(sedesConLosMismosNumeros({ revenue: 0.1 + 0.2, personas: 3 }, [{ revenue: 0.3, personas: 3 }])).toBe(1);
  });
  it("una sede sin datos (vacíos) no cuenta", () => {
    expect(sedesConLosMismosNumeros(nuevo, [{ revenue: null, personas: null }, { revenue: 1483.7, personas: null }])).toBe(0);
  });
  it("sin otras sedes: nada que avisar", () => {
    expect(sedesConLosMismosNumeros(nuevo, [])).toBe(0);
  });
});

describe("saveDailyEntry: freno de números copiados", () => {
  beforeEach(() => {
    fake.state.queries.length = 0;
    fake.state.otras = [];
    fake.state.fallaLaConsulta = false;
  });

  it("si otra sede tiene lo mismo, pide confirmar y NO guarda", async () => {
    fake.state.otras = [{ revenue: 1483.7, personas: 56 }];
    const r = await saveDailyEntry(dia);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.confirmar).toBe(true);
      expect(r.error).toMatch(/otra sede/i);
      // No revela cuál sede ni su venta.
      expect(r.error).not.toMatch(/Centro|Fonavi|Atelier|1483|1,483/);
    }
    expect(guardo()).toBe(false);
  });

  it("con la confirmación del administrador, guarda", async () => {
    fake.state.otras = [{ revenue: 1483.7, personas: 56 }];
    const r = await saveDailyEntry({ ...dia, confirmarIgual: true });
    expect(r.ok).toBe(true);
    expect(guardo()).toBe(true);
  });

  it("si nada coincide, guarda sin preguntar", async () => {
    fake.state.otras = [{ revenue: 1271.1, personas: 53 }];
    const r = await saveDailyEntry(dia);
    expect(r.ok).toBe(true);
    expect(guardo()).toBe(true);
  });

  it("si la consulta del freno falla, el día se guarda igual", async () => {
    fake.state.fallaLaConsulta = true;
    const r = await saveDailyEntry(dia);
    expect(r.ok).toBe(true);
    expect(guardo()).toBe(true);
  });

  it("la consulta mira solo OTRAS sedes del mismo día", async () => {
    await saveDailyEntry(dia);
    const q = fake.state.queries.find((x) => x.text.includes("business_id <>"));
    expect(q?.values).toEqual(["2026-10-03", 2]);
  });
});
