/**
 * Tests de las actions de "Préstamos del socio" tras la unificación con
 * el Registro Diario (loan_via_bank). Driver falso — no toca Neon.
 *
 * Qué se protege:
 *  - createLoan escribe payment_method + loan_via_bank según la entrada
 *    (banco / caja / directo) y solo recalcula el banco cuando entró al BCP.
 *  - createRefund marca loan_via_bank cuando la devolución sale del BCP
 *    (fix del descuadre silencioso) y recalcula solo en ese caso.
 *  - getLoansSummary suma préstamos via-banco al saldo pendiente (el caso
 *    real de S/1,000 de RestaPro) y deriva la entrada para la UI.
 *  - createBankIncomeItem (Registro Diario) solo acepta isPartnerLoan en
 *    Atelier + categoría de préstamos y sin cliente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => {
  const state = {
    executed: [] as string[],
    // Cola FIFO de respuestas para db.execute (cada una es rows[]).
    responses: [] as unknown[][],
    businessId: 1,
  };
  // Serializa un objeto SQL de drizzle a texto con los params inline.
  function sqlText(q: unknown): string {
    const o = q as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(o?.queryChunks)) return o.queryChunks.map(sqlText).join("");
    if (Array.isArray(o?.value)) return (o.value as string[]).join("");
    if (o && typeof o === "object" && "value" in o) {
      return JSON.stringify((o as { value: unknown }).value);
    }
    return JSON.stringify(q);
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
vi.mock("@/lib/active-business", () => ({
  activeBusinessId: vi.fn(async () => fake.state.businessId),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./daily-records", () => ({ recalcBankBalance: vi.fn(async () => 0) }));

import { createLoan, createRefund, getLoansSummary, updateLoanMovement } from "./loans";
import { createBankIncomeItem } from "./bank-income";
import { recalcBankBalance } from "./daily-records";

beforeEach(() => {
  fake.state.executed = [];
  fake.state.responses = [];
  fake.state.businessId = 1;
  vi.mocked(recalcBankBalance).mockClear();
});

const TODAY = new Date().toISOString().slice(0, 10);

describe("createLoan — payment_method y loan_via_bank por entrada", () => {
  it("entry 'banco': transferencia + loan_via_bank=true + recalcula el banco", async () => {
    await createLoan({ date: TODAY, amount: 1000, entry: "banco", concept: "Para RestaPro" });
    const insert = fake.state.executed.find((q) => q.includes("INSERT INTO bank_income_items"));
    expect(insert).toBeTruthy();
    expect(insert!).toContain('"transferencia", true, true');
    expect(recalcBankBalance).toHaveBeenCalledWith(TODAY);
  });

  it("entry 'directo': método fantasma + loan_via_bank=false + NO recalcula (no tocó cuentas)", async () => {
    await createLoan({ date: TODAY, amount: 584.83, entry: "directo", concept: "Compras metro" });
    const insert = fake.state.executed.find((q) => q.includes("INSERT INTO bank_income_items"));
    expect(insert!).toContain('"transferencia", true, false');
    expect(recalcBankBalance).not.toHaveBeenCalled();
  });

  it("entry 'caja': efectivo (la caja lo cuenta) + loan_via_bank=false + sin recálculo de banco", async () => {
    await createLoan({ date: TODAY, amount: 500, entry: "caja", concept: "Efectivo a caja" });
    const insert = fake.state.executed.find((q) => q.includes("INSERT INTO bank_income_items"));
    expect(insert!).toContain('"efectivo", true, false');
    expect(recalcBankBalance).not.toHaveBeenCalled();
  });
});

describe("createRefund — devoluciones via banco restan del BCP", () => {
  it("transferencia: loan_via_bank=true + recalcula (antes el banco no bajaba — bug latente)", async () => {
    await createRefund({
      date: TODAY, amount: 300, paymentMethod: "transferencia", concept: "Devolución parcial",
    });
    const insert = fake.state.executed.find((q) => q.includes("INSERT INTO expenses"));
    expect(insert).toBeTruthy();
    expect(insert!).toContain("loan_via_bank");
    expect(insert!).toContain("true, true"); // is_special_loan, loan_via_bank
    expect(recalcBankBalance).toHaveBeenCalledWith(TODAY);
  });

  it("efectivo: loan_via_bank=false (sale de caja) y no recalcula el banco", async () => {
    await createRefund({
      date: TODAY, amount: 200, paymentMethod: "efectivo", concept: "Devolución en efectivo",
    });
    const insert = fake.state.executed.find((q) => q.includes("INSERT INTO expenses"));
    expect(insert!).toContain("true, false");
    expect(recalcBankBalance).not.toHaveBeenCalled();
  });
});

describe("updateLoanMovement — la edición conserva la semántica via-banco", () => {
  it("devolución que pasa de efectivo a transferencia actualiza loan_via_bank", async () => {
    fake.state.responses = [
      [{ date: TODAY, payment_method: "efectivo", amount: 200 }], // before
      [{ total: "1000" }], // loaned
      [{ total: "0" }],    // refunded
    ];
    const r = await updateLoanMovement("id-1", "refund", {
      date: TODAY, amount: 200, paymentMethod: "transferencia", concept: "Devolución",
    });
    expect(r.success).toBe(true);
    const update = fake.state.executed.find((q) => q.includes("UPDATE expenses"));
    expect(update!).toContain("loan_via_bank = true");
  });
});

describe("getLoansSummary — el préstamo via-banco cuenta en el saldo pendiente", () => {
  it("suma préstamos directos + via banco y deriva la entrada para la UI", async () => {
    fake.state.responses = [
      [
        { id: "a", kind: "loan", date: "2026-05-21", amount: 1000, payment_method: "transferencia", loan_via_bank: true, concept: "Préstamo de Jahnn para pago RestaPro", notes: null, created_at: "t1" },
        { id: "b", kind: "loan", date: "2026-06-04", amount: 1812, payment_method: "transferencia", loan_via_bank: false, concept: "Compras virgen de la puerta", notes: null, created_at: "t2" },
        { id: "c", kind: "loan", date: "2026-06-05", amount: 100, payment_method: "efectivo", loan_via_bank: false, concept: "Efectivo a caja", notes: null, created_at: "t3" },
      ],
      [
        { id: "d", kind: "refund", date: "2026-06-06", amount: 500, payment_method: "transferencia", loan_via_bank: true, concept: "Devolución", notes: null, created_at: "t4" },
      ],
    ];
    const s = await getLoansSummary();
    expect(s.totalLoaned).toBe(2912);
    expect(s.totalRefunded).toBe(500);
    expect(s.pendingBalance).toBe(2412);
    const byId = Object.fromEntries(s.movements.map((m) => [m.id, m]));
    expect(byId["a"].entry).toBe("banco");
    expect(byId["a"].viaBank).toBe(true);
    expect(byId["b"].entry).toBe("directo");
    expect(byId["c"].entry).toBe("caja");
    expect(byId["d"].entry).toBeNull(); // devoluciones muestran método, no entrada
    expect(byId["d"].viaBank).toBe(true);
  });
});

describe("createBankIncomeItem — préstamo del socio desde el Registro Diario", () => {
  const LOAN_CAT = "Préstamos / financiamiento recibido";

  it("marca is_special_loan + loan_via_bank cuando es préstamo por transferencia", async () => {
    const r = await createBankIncomeItem({
      date: TODAY, amount: 1000, note: "Préstamo de Jahnn",
      paymentMethod: "transferencia", nonOperativeCategory: LOAN_CAT, isPartnerLoan: true,
    });
    expect(r.success).toBe(true);
    const insert = fake.state.executed.find((q) => q.includes("INSERT INTO bank_income_items"));
    expect(insert!).toContain("is_special_loan, loan_via_bank");
    expect(insert!).toContain("true, true");
  });

  it("préstamo en efectivo: is_special_loan=true pero loan_via_bank=false (va a caja)", async () => {
    const r = await createBankIncomeItem({
      date: TODAY, amount: 500, note: "Préstamo efectivo",
      paymentMethod: "efectivo", nonOperativeCategory: LOAN_CAT, isPartnerLoan: true,
    });
    expect(r.success).toBe(true);
    const insert = fake.state.executed.find((q) => q.includes("INSERT INTO bank_income_items"));
    expect(insert!).toContain("true, false");
  });

  it("rechaza isPartnerLoan fuera de Atelier", async () => {
    fake.state.businessId = 2; // Kelly en Fonavi
    const r = await createBankIncomeItem({
      date: TODAY, amount: 100, nonOperativeCategory: LOAN_CAT, isPartnerLoan: true,
    });
    expect(r).toEqual({ success: false, error: expect.stringContaining("Atelier") });
  });

  it("rechaza isPartnerLoan sin la categoría de préstamos", async () => {
    const r = await createBankIncomeItem({
      date: TODAY, amount: 100, nonOperativeCategory: "Venta de activos", isPartnerLoan: true,
    });
    expect(r.success).toBe(false);
  });

  it("rechaza isPartnerLoan con cliente (un préstamo no es cobro a cliente)", async () => {
    const r = await createBankIncomeItem({
      date: TODAY, amount: 100, clientId: "uuid-cliente",
      nonOperativeCategory: LOAN_CAT, isPartnerLoan: true,
    });
    expect(r.success).toBe(false);
  });

  it("ingreso normal (sin isPartnerLoan) inserta los flags en false", async () => {
    const r = await createBankIncomeItem({ date: TODAY, amount: 250, note: "Cobro" });
    expect(r.success).toBe(true);
    const insert = fake.state.executed.find((q) => q.includes("INSERT INTO bank_income_items"));
    expect(insert!).toContain("false, false");
  });
});
