/**
 * Tests del cambio de FECHA al editar un movimiento (record-edits).
 *
 * Re-fechar mueve dinero de un día a otro: el saldo del día ORIGEN y del
 * DESTINO cambian, y la cadena debe recalcularse desde el más ANTIGUO de
 * los dos (recorre hacia adelante). Un gasto compartido arrastra además su
 * espejo en la otra sede. Todo en UNA transacción.
 *
 * Driver fake — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeQuery = { text: string; awaited: boolean };

const fake = vi.hoisted(() => {
  const state = {
    queries: [] as FakeQuery[],
    txCalls: [] as FakeQuery[][],
    originalRow: {} as Record<string, unknown>,
    allocations: 0,
    clientExists: true,
  };
  const respond = (text: string): unknown[] => {
    if (text.includes("SELECT * FROM expenses WHERE id =")) return [state.originalRow];
    if (text.includes("SELECT * FROM bank_income_items WHERE id =")) return [state.originalRow];
    if (text.includes("FROM fonavi_reimbursement_allocations")) return [{ n: state.allocations }];
    if (text.includes("FROM clients")) return state.clientExists ? [{ id: "c1" }] : [];
    return [];
  };
  const makeTag = () => {
    const tag = (strings: TemplateStringsArray) => {
      const q: FakeQuery = { text: strings.join(" $ "), awaited: false };
      state.queries.push(q);
      return {
        q,
        then(onRes: (v: unknown) => unknown, onRej?: (e: unknown) => unknown) {
          q.awaited = true;
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

import { updateExpense, updateIncomeItem } from "./record-edits";

// Fechas en zona Lima (igual que validateMovementDate).
const lima = (offsetDays = 0) =>
  new Date(Date.now() - offsetDays * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const TODAY = lima(0);
const YESTERDAY = lima(1);
const TWO_AGO = lima(2);
const TOMORROW = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

const EXPENSE_BASE = { amount: 500, category: "Insumos", concept: "Pago carne", paymentMethod: "transferencia", notes: null };
const EXPENSE_ROW = {
  id: "e1", business_id: 1, date: YESTERDAY, amount: "500.00",
  category: "Insumos", concept: "Pago carne", payment_method: "transferencia",
  notes: null, is_shared: false, is_internal_transfer: false, is_special_loan: false,
  linked_atelier_expense_id: null, shared_rule_id: null, atelier_amount: null, fonavi_amount: null,
};
const INCOME_ROW = {
  id: "i1", business_id: 1, date: YESTERDAY, amount: "800.00", note: "Cobro",
  client_id: null, payment_method: "transferencia", is_special_loan: false,
  is_internal_transfer: false, is_fonavi_reimbursement: false,
};

beforeEach(() => {
  fake.state.queries.length = 0;
  fake.state.txCalls.length = 0;
  fake.state.allocations = 0;
  fake.state.originalRow = EXPENSE_ROW;
});

const tx = () => fake.state.txCalls[0];
const inTx = (frag: string) => tx().some((q) => q.text.includes(frag));

describe("updateExpense — cambio de fecha", () => {
  it("sin cambiar la fecha: no crea el día destino y recalcula solo su día", async () => {
    const r = await updateExpense("e1", { ...EXPENSE_BASE, date: YESTERDAY });
    expect(r.success).toBe(true);
    expect(inTx("INSERT INTO daily_records")).toBe(false);
    // Un solo recálculo de totales diarios (el del día del gasto)
    expect(tx().filter((q) => q.text.includes("UPDATE daily_records SET")).length).toBe(1);
  });

  it("mover a otro día: crea el día destino, re-fecha y recalcula AMBOS días", async () => {
    const r = await updateExpense("e1", { ...EXPENSE_BASE, date: TODAY });
    expect(r.success).toBe(true);
    expect(inTx("INSERT INTO daily_records")).toBe(true);
    expect(tx()[1].text).toContain("UPDATE expenses SET");
    expect(tx()[1].text).toContain("date =");
    // Totales diarios de los dos días (origen + destino)
    expect(tx().filter((q) => q.text.includes("UPDATE daily_records SET")).length).toBe(2);
    // La cadena se recalcula una vez (desde el día más antiguo)
    expect(tx().filter((q) => q.text.includes("WITH RECURSIVE chain")).length).toBe(1);
  });

  it("un gasto COMPARTIDO arrastra su espejo al nuevo día (misma transacción)", async () => {
    fake.state.originalRow = { ...EXPENSE_ROW, is_shared: true, shared_rule_id: "r1", fonavi_amount: "200.00" };
    const r = await updateExpense("e1", { ...EXPENSE_BASE, date: TODAY });
    expect(r.success).toBe(true);
    const mirrorMove = tx().find(
      (q) => q.text.includes("UPDATE expenses SET date") && q.text.includes("linked_atelier_expense_id"),
    );
    expect(mirrorMove).toBeDefined();
    // Y se asegura el día destino también en la sede del espejo
    expect(tx().some((q) => q.text.includes("INSERT INTO daily_records") && q.text.includes("linked_atelier_expense_id"))).toBe(true);
  });

  it("rechaza fecha futura", async () => {
    const r = await updateExpense("e1", { ...EXPENSE_BASE, date: TOMORROW });
    expect(r).toEqual({ success: false, error: expect.stringContaining("futura") });
    expect(fake.state.txCalls).toHaveLength(0);
  });

  it("rechaza re-fechar un movimiento del módulo Préstamos socio", async () => {
    fake.state.originalRow = { ...EXPENSE_ROW, is_special_loan: true };
    const r = await updateExpense("e1", { ...EXPENSE_BASE, date: TODAY });
    expect(r).toEqual({ success: false, error: expect.stringContaining("Préstamos socio") });
    expect(fake.state.txCalls).toHaveLength(0);
  });
});

describe("updateIncomeItem — cambio de fecha", () => {
  const INCOME_BASE = { amount: 800, note: "Cobro", clientId: null, paymentMethod: "transferencia" };

  beforeEach(() => { fake.state.originalRow = INCOME_ROW; });

  it("mover a otro día: crea el día destino, re-fecha y recalcula AMBOS días", async () => {
    const r = await updateIncomeItem("i1", { ...INCOME_BASE, date: TODAY });
    expect(r.success).toBe(true);
    expect(inTx("INSERT INTO daily_records")).toBe(true);
    expect(tx().some((q) => q.text.includes("UPDATE bank_income_items") && q.text.includes("date ="))).toBe(true);
    expect(tx().filter((q) => q.text.includes("UPDATE daily_records SET")).length).toBe(2);
  });

  it("mover a un día ANTERIOR recalcula la cadena desde el día más antiguo", async () => {
    fake.state.originalRow = { ...INCOME_ROW, date: YESTERDAY };
    const r = await updateIncomeItem("i1", { ...INCOME_BASE, date: TWO_AGO });
    expect(r.success).toBe(true);
    const chain = tx().find((q) => q.text.includes("WITH RECURSIVE chain"));
    expect(chain).toBeDefined();
    expect(fake.state.txCalls).toHaveLength(1);
  });

  it("rechaza re-fechar un préstamo del socio desde aquí", async () => {
    fake.state.originalRow = { ...INCOME_ROW, is_special_loan: true };
    const r = await updateIncomeItem("i1", { ...INCOME_BASE, date: TODAY });
    expect(r).toEqual({ success: false, error: expect.stringContaining("Préstamos socio") });
    expect(fake.state.txCalls).toHaveLength(0);
  });

  it("sin fecha en los cambios: conserva la del registro (compatibilidad)", async () => {
    const r = await updateIncomeItem("i1", INCOME_BASE);
    expect(r.success).toBe(true);
    expect(inTx("INSERT INTO daily_records")).toBe(false);
  });
});
