/**
 * Tests de importCajaChica: registra la reposición como egresos por
 * transferencia, atómico, con validación de categorías y anti-duplicados.
 * Driver fake — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeQuery = { text: string };

const fake = vi.hoisted(() => {
  const state = {
    businessId: 1,
    cats: ["Insumos", "Deliverys", "Fletes", "Mantenimientos", "Packaging"] as string[],
    dupeCount: 0,
    txCalls: [] as FakeQuery[][],
    failTx: false,
  };
  function drizzleText(q: unknown): string {
    const o = q as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(o?.queryChunks)) return o.queryChunks.map(drizzleText).join("");
    if (Array.isArray(o?.value)) return (o.value as string[]).join("");
    if (o && typeof o === "object" && "value" in o) return String((o as { value: unknown }).value);
    return "";
  }
  return { state, drizzleText };
});

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(async (q: unknown) => {
      const t = fake.drizzleText(q);
      if (t.includes("FROM expense_categories")) return { rows: fake.state.cats.map((name) => ({ name })) };
      if (t.includes("COUNT(*)::int AS n FROM expenses")) return { rows: [{ n: fake.state.dupeCount }] };
      return { rows: [] };
    }),
  },
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    const tag = (strings: TemplateStringsArray) => ({ text: strings.join(" $ ") });
    tag.transaction = async (qs: FakeQuery[]) => {
      fake.state.txCalls.push(qs);
      if (fake.state.failTx) throw new Error("conexión perdida");
      return qs.map(() => []);
    };
    return tag;
  },
}));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => fake.state.businessId) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./daily-records", () => ({ recalcBankBalance: vi.fn(async () => 0) }));

import { importCajaChica } from "./caja-chica-import";
import { recalcBankBalance } from "./daily-records";

const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const ITEMS = [
  { category: "Insumos", concept: "Picador de cebolla", itemDate: "2026-06-24", amount: 299 },
  { category: "Deliverys", concept: "Envío", itemDate: "2026-06-22", amount: 91 },
];

beforeEach(() => {
  fake.state.businessId = 1;
  fake.state.cats = ["Insumos", "Deliverys", "Fletes", "Mantenimientos", "Packaging"];
  fake.state.dupeCount = 0;
  fake.state.txCalls = [];
  fake.state.failTx = false;
  vi.mocked(recalcBankBalance).mockClear();
});

describe("importCajaChica", () => {
  it("registra los gastos en UNA transacción, como transferencia, y recalcula el banco", async () => {
    const r = await importCajaChica({ items: ITEMS, reposicionDate: TODAY, generado: "2026-07-01" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inserted).toBe(2);
    expect(r.total).toBe(390);
    expect(fake.state.txCalls).toHaveLength(1);
    const tx = fake.state.txCalls[0];
    // 1 daily_record + 1 grupo visual (la reposición = un cargo en el banco) + 2 inserts
    expect(tx).toHaveLength(4);
    expect(tx[0].text).toContain("INSERT INTO daily_records");
    expect(tx[1].text).toContain("INSERT INTO expense_groups");
    expect(tx[2].text).toContain("INSERT INTO expenses");
    expect(tx[2].text).toContain("'transferencia'");
    expect(tx[2].text).toContain("group_id");
    expect(recalcBankBalance).toHaveBeenCalledWith(TODAY);
  });

  it("rechaza categorías que no existen en el sistema", async () => {
    fake.state.cats = ["Insumos"]; // falta Deliverys
    const r = await importCajaChica({ items: ITEMS, reposicionDate: TODAY, generado: "g" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Deliverys");
    expect(fake.state.txCalls).toHaveLength(0);
  });

  it("avisa si la reposición ya fue subida (mismo Generado) y NO inserta", async () => {
    fake.state.dupeCount = 26;
    const r = await importCajaChica({ items: ITEMS, reposicionDate: TODAY, generado: "2026-07-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.alreadyImported).toBe(true); expect(r.alreadyCount).toBe(26); }
    expect(fake.state.txCalls).toHaveLength(0);
  });

  it("con force=true, sube igual aunque ya exista", async () => {
    fake.state.dupeCount = 26;
    const r = await importCajaChica({ items: ITEMS, reposicionDate: TODAY, generado: "2026-07-01", force: true });
    expect(r.ok).toBe(true);
    expect(fake.state.txCalls).toHaveLength(1);
  });

  it("rechaza fecha de reposición futura", async () => {
    const future = new Date(Date.now() + 5 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const r = await importCajaChica({ items: ITEMS, reposicionDate: future, generado: "g" });
    expect(r.ok).toBe(false);
    expect(fake.state.txCalls).toHaveLength(0);
  });

  it("solo Atelier", async () => {
    fake.state.businessId = 2;
    const r = await importCajaChica({ items: ITEMS, reposicionDate: TODAY, generado: "g" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Atelier");
  });

  it("rechaza lista vacía", async () => {
    const r = await importCajaChica({ items: [], reposicionDate: TODAY, generado: "g" });
    expect(r.ok).toBe(false);
  });
});
