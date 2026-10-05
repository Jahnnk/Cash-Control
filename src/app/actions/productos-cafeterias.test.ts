/**
 * Fonavi + Centro juntas en Productos (5-oct-2026): las ventas se suman producto por
 * producto y nada se cuenta dos veces. Driver de BD falso — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Fila = { nombre: string; unidades: number; ingresos: number };
const fake = vi.hoisted(() => {
  const state = {
    full: true,
    porSede: {} as Record<number, { filas: Fila[]; desde: string | null; hasta: string | null }>,
  };
  const makeTag = () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const t = strings.join(" $ ");
    let out: unknown[] = [];
    if (t.includes("FROM rotacion_efectiva") && t.includes("GROUP BY 1")) out = state.porSede[values[0] as number]?.filas ?? [];
    else if (t.includes("FROM rotacion_efectiva")) { const x = state.porSede[values[0] as number]; out = [{ desde: x?.desde ?? null, hasta: x?.hasta ?? null }]; }
    else if (t.includes("MAX(imported_at)")) out = [{ c: "2026-10-03" }];
    else if (t.includes("FROM costos_carta") || t.includes("FROM carta_vinculos")) out = [];
    return Promise.resolve(out);
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

import { getPanoramaCafeterias, getReglaOchentaVeinteCafeterias, getRentabilidadProductos, getInformeTrimestral } from "./productos-panorama";

beforeEach(() => {
  fake.state.full = true;
  fake.state.porSede = {
    2: { filas: [{ nombre: "CAFE CORTADO", unidades: 10, ingresos: 110 }, { nombre: "CAPPUCCINO", unidades: 5, ingresos: 50 }], desde: "2026-09-01", hasta: "2026-09-30" },
    3: { filas: [{ nombre: "CAFE CORTADO", unidades: 20, ingresos: 220 }, { nombre: "CAFE AMERICANO", unidades: 4, ingresos: 40 }], desde: "2026-09-01", hasta: "2026-09-30" },
  };
});

describe("getPanoramaCafeterias", () => {
  it("suma las ventas de Fonavi y Centro, sin contar nada dos veces", async () => {
    const r = await getPanoramaCafeterias("2026-09");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.businessId).toBe(0);
    expect(r.data.sede).toBe("Fonavi + Centro");
    expect(r.data.panorama?.ventas).toBeCloseTo(420, 2);
    expect(r.data.panorama?.unidades).toBe(39);
    expect(r.data.cubre.map((x) => x.sede)).toEqual(["Fonavi", "Centro"]);
  });

  it("dice hasta qué día llega cada cafetería", async () => {
    fake.state.porSede[3].hasta = "2026-10-03";
    const r = await getPanoramaCafeterias("2026-09");
    if (!r.ok) throw new Error(r.error);
    expect(r.data.cubre.find((x) => x.sede === "Centro")?.hasta).toBe("2026-10-03");
    expect(r.data.cubre.find((x) => x.sede === "Fonavi")?.hasta).toBe("2026-09-30");
  });

  it("si una cafetería no tiene reporte, queda lo de la otra", async () => {
    fake.state.porSede[3] = { filas: [], desde: null, hasta: null };
    const r = await getPanoramaCafeterias("2026-09");
    if (!r.ok) throw new Error(r.error);
    expect(r.data.panorama?.ventas).toBeCloseTo(160, 2);
  });

  it("si ninguna tiene reporte, el panorama es null", async () => {
    fake.state.porSede = {};
    const r = await getPanoramaCafeterias("2026-09");
    if (!r.ok) throw new Error(r.error);
    expect(r.data.panorama).toBeNull();
  });

  it("solo dirección, y el mes tiene que ser válido", async () => {
    expect(await getPanoramaCafeterias("septiembre")).toEqual({ ok: false, error: "Mes inválido." });
    fake.state.full = false;
    expect(await getPanoramaCafeterias("2026-09")).toEqual({ ok: false, error: "Solo dirección." });
  });
});

describe("las demás secciones también aceptan «Fonavi + Centro»", () => {
  it("regla 80/20 de las dos cafeterías juntas", async () => {
    const r = await getReglaOchentaVeinteCafeterias("2026-09");
    if (!r.ok) throw new Error(r.error);
    expect(r.data.businessId).toBe(0);
    expect(r.data.sede).toBe("Fonavi + Centro");
    expect(r.data.mes).not.toBeNull();
    expect(r.data.mes!.productos).toBe(3); // cortado, cappuccino y americano: el cortado cuenta una vez
  });

  it("rentabilidad acepta la sede 0 y sigue rechazando Atelier", async () => {
    const r = await getRentabilidadProductos("2026-09", 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.sede).toBe("Fonavi + Centro");
    const atelier = await getRentabilidadProductos("2026-09", 1);
    expect(atelier.ok).toBe(false);
  });

  it("informe trimestral para las dos juntas, y la tira siempre trae «Fonavi + Centro»", async () => {
    const r = await getInformeTrimestral("2026-09", 0);
    if (!r.ok) throw new Error(r.error);
    expect(r.sede.sede).toBe("Fonavi + Centro");
    const delPropio = await getInformeTrimestral("2026-09", 2);
    if (!delPropio.ok) throw new Error(delPropio.error);
    expect(delPropio.comparativo.some((x) => x.businessId === 0)).toBe(true);
  });
});
