/**
 * Tests de updateReceivableAmount: editar cuánto debe Fonavi/Centro por un
 * gasto compartido SIN mover saldos de banco. Driver fake — no toca Neon.
 *
 * Garantías que se prueban:
 *  - Ajusta las 3 piezas (parte del deudor en el gasto, cuenta por cobrar,
 *    espejo) en UNA transacción; el TOTAL del gasto no se toca → banco intacto.
 *  - Rechaza cuentas con cobros, montos <= 0 y montos por encima del tope.
 *  - Fonavi edita fonavi_amount; Centro edita centro_amount.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeQuery = { text: string };

const fake = vi.hoisted(() => {
  const state = {
    queries: [] as FakeQuery[],
    txCalls: [] as FakeQuery[][],
    // fila que devuelve el SELECT de la cuenta por cobrar + gasto
    receivable: { col: 0, status: "pending", debtor: 2, expense_id: "exp-1", total: 1227.9, fonavi: 613.95, centro: 0 } as Record<string, unknown>,
  };
  const respond = (text: string): unknown[] => {
    if (text.includes("FROM fonavi_receivables fr JOIN expenses e")) return [state.receivable];
    if (text.includes("business_id::int AS business_id FROM expenses")) return [{ date: "2026-06-08", business_id: state.receivable.debtor }];
    return [];
  };
  const makeTag = () => {
    const tag = (strings: TemplateStringsArray, ..._v: unknown[]) => {
      const q: FakeQuery = { text: strings.join(" $ ") };
      state.queries.push(q);
      return {
        q,
        then(onRes: (v: unknown) => unknown, onRej?: (e: unknown) => unknown) {
          return Promise.resolve(respond(q.text)).then(onRes, onRej);
        },
      };
    };
    tag.transaction = async (qs: Array<{ q: FakeQuery }>) => {
      state.txCalls.push(qs.map((x) => x.q));
      return qs.map(() => []);
    };
    return tag;
  };
  return { state, makeTag };
});

vi.mock("@neondatabase/serverless", () => ({ neon: () => fake.makeTag() }));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => 1) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateReceivableAmount } from "./fonavi-receivables";

beforeEach(() => {
  fake.state.queries = [];
  fake.state.txCalls = [];
  fake.state.receivable = { col: 0, status: "pending", debtor: 2, expense_id: "exp-1", total: 1227.9, fonavi: 613.95, centro: 0 };
});

const txText = () => fake.state.txCalls[0].map((q) => q.text).join("\n");

describe("updateReceivableAmount", () => {
  it("Fonavi pendiente: ajusta fonavi_amount + cuenta por cobrar + espejo en UNA transacción", async () => {
    const r = await updateReceivableAmount("rec-1", 861.65);
    expect(r.ok).toBe(true);
    expect(fake.state.txCalls).toHaveLength(1);
    const t = txText();
    expect(t).toContain("SET fonavi_amount");
    expect(t).toContain("atelier_amount = amount");
    expect(t).toContain("UPDATE fonavi_receivables SET amount_due");
    expect(t).toContain("linked_receivable_id");
    expect(t).toContain("pendiente_atelier");
    // el TOTAL del gasto nunca se toca (banco Atelier intacto)
    expect(t).not.toMatch(/UPDATE expenses SET amount = .* WHERE id =/);
  });

  it("Centro pendiente: edita centro_amount (no fonavi)", async () => {
    fake.state.receivable = { col: 0, status: "pending", debtor: 3, expense_id: "exp-2", total: 1000, fonavi: 0, centro: 500 };
    const r = await updateReceivableAmount("rec-2", 700);
    expect(r.ok).toBe(true);
    expect(txText()).toContain("SET centro_amount");
  });

  it("rechaza si la cuenta ya tiene cobros (amount_collected > 0)", async () => {
    fake.state.receivable = { ...fake.state.receivable, col: 100 };
    const r = await updateReceivableAmount("rec-1", 500);
    expect(r.ok).toBe(false);
    expect(fake.state.txCalls).toHaveLength(0);
  });

  it("rechaza si la cuenta está cobrada", async () => {
    fake.state.receivable = { ...fake.state.receivable, status: "collected" };
    const r = await updateReceivableAmount("rec-1", 500);
    expect(r.ok).toBe(false);
  });

  it("rechaza monto <= 0", async () => {
    const r = await updateReceivableAmount("rec-1", 0);
    expect(r.ok).toBe(false);
    expect(fake.state.txCalls).toHaveLength(0);
  });

  it("rechaza monto por encima del tope (total - parte del otro local)", async () => {
    // total 1227.9, centro 0 → tope 1227.9; pedir 1300 debe fallar
    const r = await updateReceivableAmount("rec-1", 1300);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no puede superar");
    expect(fake.state.txCalls).toHaveLength(0);
  });

  it("permite el tope exacto (parte del otro local respetada)", async () => {
    // total 1000, centro 400 → tope para Fonavi = 600
    fake.state.receivable = { col: 0, status: "pending", debtor: 2, expense_id: "exp-3", total: 1000, fonavi: 200, centro: 400 };
    const ok = await updateReceivableAmount("rec-3", 600);
    expect(ok.ok).toBe(true);
    const over = await updateReceivableAmount("rec-3", 600.01);
    expect(over.ok).toBe(false);
  });
});
