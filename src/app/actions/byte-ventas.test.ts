/**
 * Reglas de las ventas Byte y el registro de Atelier:
 *
 *  1. Cada quien solo escribe en SU sede (admin/supervisora); la
 *     dirección en todas.
 *  2. El reporte oficial de Byte (source='import') siempre manda: lo
 *     manual nunca lo pisa — ni en byte_ventas_daily ni en upselling_daily.
 *  3. El import solo toca upselling_daily en ATELIER (pedidos SON su
 *     KPI). En las cafeterías personas ≠ pedidos y el registro diario
 *     lleva segunda firma: no se pisa.
 *
 * Driver de BD falso — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeQuery = { text: string; values: unknown[] };

const fake = vi.hoisted(() => {
  const state = {
    queries: [] as FakeQuery[],
    role: { kind: "full" } as { kind: string; sede?: number },
    activeBusiness: 1,
  };
  const makeTag = () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q: FakeQuery = { text: strings.join(" $ "), values };
    state.queries.push(q);
    return { then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(ok, err) };
  };
  return { state, makeTag };
});

vi.mock("@neondatabase/serverless", () => ({ neon: () => fake.makeTag() }));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => fake.state.activeBusiness) }));
vi.mock("@/lib/session-access", () => ({
  getSessionRole: vi.fn(async () => fake.state.role),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { importVentasByte, saveAtelierDay } from "./byte-ventas";

const DAY = { date: "2026-07-10", pedidos: 71, descuentos: 13, total: 1901.5 };
const q = (frag: string) => fake.state.queries.filter((x) => x.text.includes(frag));

beforeEach(() => {
  fake.state.queries.length = 0;
  fake.state.role = { kind: "full" };
  fake.state.activeBusiness = 1;
});

describe("importVentasByte — acceso por sede", () => {
  it("la supervisora de Atelier importa en Atelier", async () => {
    fake.state.role = { kind: "admin", sede: 1 };
    const r = await importVentasByte({ days: [DAY], fileName: "ventas.xlsx" });
    expect(r).toEqual({ ok: true, imported: 1 });
  });

  it("el admin de Fonavi NO importa en Atelier (sede ajena)", async () => {
    fake.state.role = { kind: "admin", sede: 2 };
    const r = await importVentasByte({ days: [DAY], fileName: "ventas.xlsx" });
    expect(r.ok).toBe(false);
    expect(q("INSERT INTO byte_ventas_daily")).toHaveLength(0);
  });

  it("el verificador no importa (solo firma conteos)", async () => {
    fake.state.role = { kind: "verif", sede: 1 };
    const r = await importVentasByte({ days: [DAY], fileName: "ventas.xlsx" });
    expect(r.ok).toBe(false);
  });
});

describe("importVentasByte — a qué tablas escribe", () => {
  it("en ATELIER: byte_ventas_daily + upselling_daily (venta/pedidos son sus KPIs)", async () => {
    await importVentasByte({ days: [DAY], fileName: "v.xlsx" });
    expect(q("INSERT INTO byte_ventas_daily")).toHaveLength(1);
    const ups = q("INSERT INTO upselling_daily");
    expect(ups).toHaveLength(1);
    expect(ups[0].values).toContain(71);     // pedidos → personas
    expect(ups[0].values).toContain(1901.5); // total → revenue
  });

  it("en FONAVI: SOLO byte_ventas_daily (personas ≠ pedidos, registro con firma)", async () => {
    fake.state.activeBusiness = 2;
    fake.state.role = { kind: "admin", sede: 2 };
    await importVentasByte({ days: [DAY], fileName: "v.xlsx" });
    expect(q("INSERT INTO byte_ventas_daily")).toHaveLength(1);
    expect(q("INSERT INTO upselling_daily")).toHaveLength(0);
  });

  it("el import escribe con source='import' y pisa lo anterior (reporte oficial manda)", async () => {
    await importVentasByte({ days: [DAY], fileName: "v.xlsx" });
    const t = q("INSERT INTO byte_ventas_daily")[0].text;
    expect(t).toContain("'import'");
    expect(t).toContain("DO UPDATE");
    expect(t).not.toContain("WHERE"); // sin condición: import siempre gana
  });

  it("valida fechas y montos antes de escribir", async () => {
    const r1 = await importVentasByte({ days: [{ ...DAY, date: "10/07/2026" }], fileName: null });
    expect(r1.ok).toBe(false);
    const r2 = await importVentasByte({ days: [{ ...DAY, total: -5 }], fileName: null });
    expect(r2.ok).toBe(false);
    expect(q("INSERT INTO")).toHaveLength(0);
  });
});

describe("saveAtelierDay — el registro diario de la supervisora", () => {
  it("guarda venta/pedidos/mermas y refleja al deck (byte_ventas_daily)", async () => {
    const r = await saveAtelierDay({ date: "2026-07-14", venta: 1103.5, pedidos: 43, mermas: 25 });
    expect(r.ok).toBe(true);
    expect(q("INSERT INTO upselling_daily")).toHaveLength(1);
    expect(q("INSERT INTO byte_ventas_daily")).toHaveLength(1);
  });

  it("lo manual NUNCA pisa un día del reporte oficial (venta/pedidos protegidos)", async () => {
    await saveAtelierDay({ date: "2026-07-14", venta: 1, pedidos: 1, mermas: null });
    const ups = q("INSERT INTO upselling_daily")[0].text;
    // venta/pedidos solo cambian si el día NO vino del import
    expect(ups).toContain("CASE WHEN upselling_daily.source = 'import' THEN upselling_daily.personas ELSE EXCLUDED.personas END");
    expect(ups).toContain("CASE WHEN upselling_daily.source = 'import' THEN upselling_daily.revenue ELSE EXCLUDED.revenue END");
    const bvd = q("INSERT INTO byte_ventas_daily")[0].text;
    expect(bvd).toContain("WHERE byte_ventas_daily.source <> 'import'");
  });

  it("mermas vacías nunca borran lo guardado (COALESCE) — lección de los tiempos", async () => {
    await saveAtelierDay({ date: "2026-07-14", venta: 1103.5, pedidos: 43, mermas: null });
    expect(q("INSERT INTO upselling_daily")[0].text)
      .toContain("mermas_soles = COALESCE(EXCLUDED.mermas_soles, upselling_daily.mermas_soles)");
  });

  it("solo en Atelier: en otra sede activa se rechaza", async () => {
    fake.state.activeBusiness = 2;
    const r = await saveAtelierDay({ date: "2026-07-14", venta: 100, pedidos: 5, mermas: null });
    expect(r.ok).toBe(false);
    expect(q("INSERT INTO")).toHaveLength(0);
  });

  it("pedidos deben ser entero > 0 (es un conteo, no un monto)", async () => {
    const r = await saveAtelierDay({ date: "2026-07-14", venta: 100, pedidos: 4.5, mermas: null });
    expect(r.ok).toBe(false);
  });
});
