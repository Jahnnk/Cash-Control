/**
 * Tests del drag & drop de "Movimientos diarios" (mover/reordenar):
 *  - reordenar dentro del mismo día NO recalcula el banco.
 *  - mover a otro día re-fecha y recalcula el banco de AMBOS días.
 *  - guards: filas especiales y gastos compartidos no se mueven entre días.
 * Driver de BD falso — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => {
  const state = { executed: [] as string[], responses: [] as unknown[][], businessId: 1 };
  function sqlText(q: unknown): string {
    const o = q as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(o?.queryChunks)) return o.queryChunks.map(sqlText).join("");
    if (Array.isArray(o?.value)) return (o.value as string[]).join("");
    if (o && typeof o === "object" && "value" in o) return String((o as { value: unknown }).value);
    return "";
  }
  return { state, sqlText };
});

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(async (q: unknown) => {
      fake.state.executed.push(fake.sqlText(q));
      return { rows: fake.state.responses.shift() ?? [] };
    }),
  },
}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => () => Promise.resolve([]) }));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => fake.state.businessId) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./daily-records", () => ({ recalcBankBalance: vi.fn(async () => 0) }));

import { moveBankIncomeItem } from "./bank-income";
import { moveExpenseItem } from "./expenses";
import { recalcBankBalance } from "./daily-records";

// "Hoy"/"ayer" en hora de Lima (igual que validateMovementDate): usar UTC
// hacía fallar estos tests de noche en Lima (UTC ya rodó al día siguiente).
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const YESTERDAY = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

beforeEach(() => {
  fake.state.executed = [];
  fake.state.responses = [];
  fake.state.businessId = 1;
  vi.mocked(recalcBankBalance).mockClear();
});

describe("moveBankIncomeItem", () => {
  const normalRow = {
    date: YESTERDAY, is_special_loan: false, is_internal_transfer: false,
    is_byte_sale: false, is_fonavi_reimbursement: false, archived: false,
  };

  it("reordenar dentro del mismo día: actualiza sort_order y NO recalcula el banco", async () => {
    fake.state.responses = [[{ ...normalRow, date: TODAY }]];
    const r = await moveBankIncomeItem({ id: "a", toDate: TODAY, orderedIds: ["b", "a", "c"] });
    expect(r.ok).toBe(true);
    expect(fake.state.executed.filter((q) => q.includes("SET sort_order"))).toHaveLength(3);
    expect(fake.state.executed.some((q) => q.includes("SET date"))).toBe(false);
    expect(recalcBankBalance).not.toHaveBeenCalled();
  });

  it("mover a otro día: re-fecha y recalcula AMBOS días", async () => {
    fake.state.responses = [[normalRow]]; // estaba en YESTERDAY
    const r = await moveBankIncomeItem({ id: "a", toDate: TODAY, orderedIds: ["a"] });
    expect(r.ok).toBe(true);
    expect(fake.state.executed.some((q) => q.includes("INSERT INTO daily_records"))).toBe(true);
    expect(fake.state.executed.some((q) => q.includes("SET date"))).toBe(true);
    expect(recalcBankBalance).toHaveBeenCalledWith(YESTERDAY);
    expect(recalcBankBalance).toHaveBeenCalledWith(TODAY);
  });

  it("rechaza mover una fila especial (préstamo / transferencia / Byte / reembolso)", async () => {
    fake.state.responses = [[{ ...normalRow, is_special_loan: true }]];
    const r = await moveBankIncomeItem({ id: "a", toDate: TODAY, orderedIds: ["a"] });
    expect(r.ok).toBe(false);
    expect(recalcBankBalance).not.toHaveBeenCalled();
  });

  it("rechaza fecha futura", async () => {
    const FUTURE = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    fake.state.responses = [[normalRow]];
    const r = await moveBankIncomeItem({ id: "a", toDate: FUTURE, orderedIds: ["a"] });
    expect(r.ok).toBe(false);
  });

  it("movimiento inexistente → error", async () => {
    fake.state.responses = [[]];
    const r = await moveBankIncomeItem({ id: "x", toDate: TODAY, orderedIds: ["x"] });
    expect(r.ok).toBe(false);
  });
});

describe("moveExpenseItem", () => {
  const normalExp = {
    date: YESTERDAY, is_special_loan: false, is_internal_transfer: false,
    archived: false, is_shared: false, linked_atelier_expense_id: null,
  };

  it("mover gasto normal a otro día: re-fecha y recalcula ambos días", async () => {
    fake.state.responses = [[normalExp]];
    const r = await moveExpenseItem({ id: "e", toDate: TODAY, orderedIds: ["e"] });
    expect(r.ok).toBe(true);
    expect(recalcBankBalance).toHaveBeenCalledWith(YESTERDAY);
    expect(recalcBankBalance).toHaveBeenCalledWith(TODAY);
  });

  it("gasto COMPARTIDO no se puede mover a otro día (pero sí reordenar en el mismo)", async () => {
    fake.state.responses = [[{ ...normalExp, is_shared: true }]];
    const cross = await moveExpenseItem({ id: "e", toDate: TODAY, orderedIds: ["e"] });
    expect(cross.ok).toBe(false);
    expect(recalcBankBalance).not.toHaveBeenCalled();

    // mismo día (reordenar) sí: la fila compartida está en TODAY y se queda
    fake.state.responses = [[{ ...normalExp, is_shared: true, date: TODAY }]];
    const same = await moveExpenseItem({ id: "e", toDate: TODAY, orderedIds: ["e", "f"] });
    expect(same.ok).toBe(true);
  });

  it("espejo (linked_atelier_expense_id) tampoco se mueve entre días", async () => {
    fake.state.responses = [[{ ...normalExp, linked_atelier_expense_id: "parent-uuid" }]];
    const r = await moveExpenseItem({ id: "e", toDate: TODAY, orderedIds: ["e"] });
    expect(r.ok).toBe(false);
  });
});
