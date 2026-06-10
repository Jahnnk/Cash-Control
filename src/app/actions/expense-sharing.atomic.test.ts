/**
 * Tests de la conversión de gastos normales ↔ compartidos al EDITAR
 * (record-edits.updateExpense con el parámetro `shared`).
 *
 * Driver fake (no toca Neon). Verifica los 3 casos y que TODAS las
 * escrituras encadenadas (gasto + por cobrar + espejo) viajen en UNA
 * transacción — sin huérfanos ni datos a medias si algo falla.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeQuery = { text: string; awaited: boolean; values?: unknown[] };

const fake = vi.hoisted(() => {
  const state = {
    queries: [] as FakeQuery[],
    txCalls: [] as FakeQuery[][],
    failTx: false,
    // Fila original que devuelve el SELECT y conteo de reembolsos
    originalRow: {} as Record<string, unknown>,
    allocations: 0,
  };
  const respond = (text: string): unknown[] => {
    if (text.includes("SELECT * FROM expenses WHERE id =")) return [state.originalRow];
    if (text.includes("FROM fonavi_reimbursement_allocations")) return [{ n: state.allocations }];
    return [];
  };
  const makeTag = () => {
    const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q: FakeQuery = { text: strings.join(" $ "), awaited: false, values };
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
      if (state.failTx) throw new Error("conexión perdida con Neon");
      return qs.map(() => []);
    };
    return tag;
  };
  return { state, makeTag };
});

vi.mock("@neondatabase/serverless", () => ({ neon: () => fake.makeTag() }));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => 1) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateExpense } from "./record-edits";

const BASE = {
  amount: 1000,
  category: "Servicios",
  concept: "Gas",
  paymentMethod: "transferencia",
  notes: null,
};

const NORMAL_ROW = {
  id: "e1", business_id: 1, date: "2026-06-05", amount: "1000.00",
  category: "Servicios", concept: "Gas", payment_method: "transferencia",
  notes: null, is_shared: false, is_internal_transfer: false,
  linked_atelier_expense_id: null, shared_rule_id: null,
  atelier_amount: null, fonavi_amount: null,
};
const SHARED_ROW = {
  ...NORMAL_ROW, is_shared: true, shared_rule_id: "rule-1",
  atelier_amount: "700.00", fonavi_amount: "300.00", centro_amount: null,
};

beforeEach(() => {
  fake.state.queries.length = 0;
  fake.state.txCalls.length = 0;
  fake.state.failTx = false;
  fake.state.allocations = 0;
  fake.state.originalRow = NORMAL_ROW;
});

const looseWrites = () =>
  fake.state.queries.filter(
    (q) =>
      q.awaited &&
      (q.text.includes("UPDATE") || q.text.includes("INSERT") || q.text.includes("DELETE")),
  );

describe("updateExpense — condición de compartido (3 casos)", () => {
  it("CASO 1 normal → compartido: crea por cobrar + espejo en la MISMA transacción", async () => {
    const r = await updateExpense("e1", { ...BASE, shared: { ruleId: "rule-1", fonaviAmount: 300 } });
    expect(r.success).toBe(true);

    expect(fake.state.txCalls).toHaveLength(1);
    const tx = fake.state.txCalls[0];
    // UPDATE del gasto con la marca + CTE (receivable + espejo) + audit + recalcs
    expect(tx[0].text).toContain("UPDATE expenses SET");
    expect(tx[0].text).toContain("is_shared");
    const cte = tx.find((q) => q.text.includes("INSERT INTO fonavi_receivables"));
    expect(cte).toBeDefined();
    // El espejo va en la MISMA statement (CTE atómica): pendiente_atelier + link
    expect(cte!.text).toContain("pendiente_atelier");
    expect(cte!.text).toContain("linked_atelier_expense_id");
    expect(tx.some((q) => q.text.includes("INSERT INTO audit_log"))).toBe(true);
    expect(looseWrites()).toHaveLength(0);
  });

  it("CASO 2 compartido → normal: elimina espejo y por cobrar (sin huérfanos), todo en la transacción", async () => {
    fake.state.originalRow = SHARED_ROW;
    const r = await updateExpense("e1", { ...BASE, shared: null });
    expect(r.success).toBe(true);

    const tx = fake.state.txCalls[0];
    const delMirror = tx.find((q) => q.text.includes("DELETE FROM expenses") && q.text.includes("linked_atelier_expense_id"));
    const delReceivable = tx.find((q) => q.text.includes("DELETE FROM fonavi_receivables"));
    expect(delMirror).toBeDefined();
    expect(delReceivable).toBeDefined();
    // El espejo se borra ANTES que el por cobrar (referencia)
    expect(tx.indexOf(delMirror!)).toBeLessThan(tx.indexOf(delReceivable!));
    expect(looseWrites()).toHaveLength(0);
  });

  it("CASO 3 compartido → compartido (ajuste): limpia y recrea por cobrar + espejo en la transacción", async () => {
    fake.state.originalRow = SHARED_ROW;
    const r = await updateExpense("e1", {
      ...BASE, amount: 1200, shared: { ruleId: "rule-1", fonaviAmount: 360 },
    });
    expect(r.success).toBe(true);

    const tx = fake.state.txCalls[0];
    // limpia lo viejo…
    expect(tx.some((q) => q.text.includes("DELETE FROM expenses") && q.text.includes("linked_atelier_expense_id"))).toBe(true);
    expect(tx.some((q) => q.text.includes("DELETE FROM fonavi_receivables"))).toBe(true);
    // …y recrea según la parte vigente (CTE receivable+espejo)
    expect(tx.some((q) => q.text.includes("INSERT INTO fonavi_receivables") && q.text.includes("pendiente_atelier"))).toBe(true);
    expect(looseWrites()).toHaveLength(0);
  });

  it("REPARTO A 3: agregar Centro al editar crea DOS por-cobrar/espejos (deudores 2 y 3) en la transacción", async () => {
    fake.state.originalRow = SHARED_ROW;
    const r = await updateExpense("e1", {
      ...BASE, amount: 1500, shared: { ruleId: "rule-1", fonaviAmount: 500, centroAmount: 500 },
    });
    expect(r.success).toBe(true);

    const tx = fake.state.txCalls[0];
    const recreates = tx.filter((q) => q.text.includes("INSERT INTO fonavi_receivables"));
    expect(recreates).toHaveLength(2);
    const debtors = recreates.map((q) => (q.values ?? []).find((v) => v === 2 || v === 3));
    expect(debtors).toContain(2);
    expect(debtors).toContain(3);
    expect(looseWrites()).toHaveLength(0);
  });

  it("REPARTO A 3: quitar Fonavi (solo Centro) recrea UN solo por-cobrar con deudor 3", async () => {
    fake.state.originalRow = SHARED_ROW;
    const r = await updateExpense("e1", {
      ...BASE, shared: { ruleId: "rule-1", fonaviAmount: 0, centroAmount: 300 },
    });
    expect(r.success).toBe(true);
    const tx = fake.state.txCalls[0];
    const recreates = tx.filter((q) => q.text.includes("INSERT INTO fonavi_receivables"));
    expect(recreates).toHaveLength(1);
    expect(recreates[0].values).toContain(3);
    expect(recreates[0].values).not.toContain(2);
  });

  it("GUARD 3 vías: ninguna cafetería con parte > 0 → error", async () => {
    const r = await updateExpense("e1", { ...BASE, shared: { ruleId: "rule-1", fonaviAmount: 0, centroAmount: 0 } });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("Al menos una cafetería");
    expect(fake.state.txCalls).toHaveLength(0);
  });

  it("GUARD: con reembolsos registrados no se puede tocar la condición ni el monto", async () => {
    fake.state.originalRow = SHARED_ROW;
    fake.state.allocations = 1;
    const r = await updateExpense("e1", { ...BASE, shared: null });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("reembolsos registrados");
    expect(fake.state.txCalls).toHaveLength(0); // nada se escribió
  });

  it("GUARD: las partes no pueden exceder el monto (atelier 0 SÍ es válido, ej. regla 0/100)", async () => {
    const tooBig = await updateExpense("e1", { ...BASE, shared: { ruleId: "rule-1", fonaviAmount: 1100 } });
    expect(tooBig.success).toBe(false);
    const zero = await updateExpense("e1", { ...BASE, shared: { ruleId: "rule-1", fonaviAmount: 0 } });
    expect(zero.success).toBe(false); // ninguna cafetería participa
    expect(fake.state.txCalls).toHaveLength(0);
    // atelier = 0 (cafeterías cubren todo) es válido:
    const atelierZero = await updateExpense("e1", { ...BASE, shared: { ruleId: "rule-1", fonaviAmount: 600, centroAmount: 400 } });
    expect(atelierZero.success).toBe(true);
  });

  it("GUARD: el espejo de Fonavi no se edita directamente", async () => {
    fake.state.originalRow = { ...NORMAL_ROW, linked_atelier_expense_id: "e-atelier" };
    const r = await updateExpense("e1", { ...BASE });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("espejo");
  });

  it("GUARD legacy: sin parámetro shared no se puede cambiar el monto de un compartido (evita desync silencioso)", async () => {
    fake.state.originalRow = SHARED_ROW;
    const r = await updateExpense("e1", { ...BASE, amount: 999 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("compartido");
  });

  it("ROLLBACK: si la transacción falla a medias, error limpio y nada suelto", async () => {
    fake.state.failTx = true;
    const r = await updateExpense("e1", { ...BASE, shared: { ruleId: "rule-1", fonaviAmount: 300 } });
    expect(r.success).toBe(false);
    expect(looseWrites()).toHaveLength(0); // todo viajaba dentro de la transacción
  });
});
