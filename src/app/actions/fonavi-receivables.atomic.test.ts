/**
 * Tests de ATOMICIDAD de registerFonaviReimbursement (cascada post-cobro).
 *
 * No tocan Neon: driver fake. Verifican que la activación del gasto
 * espejo de Fonavi + el recálculo de su saldo viajan en UNA transacción:
 * si falla a medias, rollback → el espejo sigue 'pendiente_atelier' y el
 * saldo de Fonavi intacto (estado consistente), con mensaje claro que
 * advierte NO registrar el cobro de nuevo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeQuery = { text: string; awaited: boolean; values?: unknown[] };

const fake = vi.hoisted(() => {
  const state = {
    queries: [] as FakeQuery[],
    txCalls: [] as FakeQuery[][],
    failOnTxCall: 0 as number, // 0 = nunca; 1 = primera transacción; 2 = segunda…
    // deudor que devuelven las receivables en la pre-validación
    debtors: [2] as number[],
  };
  let debtorCursor = 0;
  const respond = (text: string): unknown[] => {
    if (text.includes("amount_due::float as due")) {
      const debtor = state.debtors[Math.min(debtorCursor, state.debtors.length - 1)];
      debtorCursor++;
      return [{ due: 100, col: 0, status: "pending", debtor }]; // pre-validación
    }
    if (text.includes("RETURNING id")) {
      return [{ id: "11111111-1111-1111-1111-111111111111" }]; // income insert
    }
    if (text.includes("status = 'collected'")) {
      return [{ id: "22222222-2222-2222-2222-222222222222" }]; // cobradas
    }
    if (text.includes("business_id::int AS business_id FROM expenses")) {
      // fechas + local de los espejos (el local = deudor configurado)
      return [{ date: "2026-06-01", business_id: state.debtors[0] }];
    }
    return [];
  };
  const resetCursor = () => { debtorCursor = 0; };
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
      if (state.failOnTxCall === state.txCalls.length) {
        throw new Error("conexión perdida con Neon");
      }
      return qs.map(() => []);
    };
    return tag;
  };
  return { state, makeTag, resetCursor };
});

vi.mock("@neondatabase/serverless", () => ({ neon: () => fake.makeTag() }));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => 1) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./daily-records", () => ({ recalcBankBalance: vi.fn(async () => undefined) }));

import { registerFonaviReimbursement } from "./fonavi-receivables";
import { recalcBankBalance } from "./daily-records";

const DATA = {
  date: "2026-06-09",
  totalAmount: 100,
  note: null,
  allocations: [{ receivableId: "22222222-2222-2222-2222-222222222222", amount: 100 }],
  paymentMethod: "transferencia" as const,
};

beforeEach(() => {
  fake.state.queries.length = 0;
  fake.state.txCalls.length = 0;
  fake.state.failOnTxCall = 0;
  fake.state.debtors = [2];
  fake.resetCursor();
  vi.mocked(recalcBankBalance).mockClear();
});

describe("registerFonaviReimbursement — atomicidad de la cascada", () => {
  it("camino feliz: 2 transacciones (cobro y cascada), espejo activado DENTRO de la segunda", async () => {
    const r = await registerFonaviReimbursement(DATA);
    expect(r.success).toBe(true);

    expect(fake.state.txCalls).toHaveLength(2);
    const cascade = fake.state.txCalls[1];
    // UPDATE del espejo + (cache, daily_record, chain) por la fecha afectada
    expect(cascade[0].text).toContain("UPDATE");
    expect(cascade[0].text).toContain("pendiente_atelier");
    expect(cascade.some((q) => q.text.includes("WITH RECURSIVE chain"))).toBe(true);
    expect(cascade.some((q) => q.text.includes("INSERT INTO daily_records"))).toBe(true);

    // Ninguna ESCRITURA de la cascada ejecutada suelta: las únicas queries
    // awaited directo son lecturas (SELECT) o el insert del ingreso con
    // RETURNING + el ON CONFLICT del daily_record de Atelier (pre-cascada).
    const looseWrites = fake.state.queries.filter(
      (q) =>
        q.awaited &&
        (q.text.includes("UPDATE expenses") || q.text.includes("WITH RECURSIVE chain")),
    );
    expect(looseWrites).toHaveLength(0);
  });

  it("fallo en la cascada → rollback: espejo NO activado suelto, mensaje que advierte no duplicar el cobro", async () => {
    fake.state.failOnTxCall = 2; // la transacción de la cascada falla

    const r = await registerFonaviReimbursement(DATA);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("NO registres el cobro de nuevo");
      expect(r.error).toContain("espejo");
    }

    // La cascada viajó completa en la transacción fallida → Neon revierte
    // TODO el paquete: imposible que el espejo quede activado con el saldo
    // de Fonavi sin recalcular.
    expect(fake.state.txCalls).toHaveLength(2);
    const looseWrites = fake.state.queries.filter(
      (q) =>
        q.awaited &&
        (q.text.includes("UPDATE expenses") || q.text.includes("WITH RECURSIVE chain")),
    );
    expect(looseWrites).toHaveLength(0);

    // El recálculo de ATELIER (post-cobro, pre-cascada) sí corrió — el cobro
    // quedó registrado y consistente; solo la cascada de Fonavi se revirtió.
    expect(recalcBankBalance).toHaveBeenCalledWith("2026-06-09");
  });

  it("CENTRO como deudor: el espejo y la cascada van al negocio 3 (generalizado)", async () => {
    fake.state.debtors = [3];
    const r = await registerFonaviReimbursement(DATA);
    expect(r.success).toBe(true);
    const cascade = fake.state.txCalls[1];
    // la cascada del deudor va parametrizada con business_id = 3
    const paramQueries = cascade.filter((q) => q.text.includes("INSERT INTO daily_records") || q.text.includes("WITH RECURSIVE chain"));
    expect(paramQueries.length).toBeGreaterThan(0);
    for (const q of paramQueries) {
      expect(q.values).toContain(3);
      expect(q.values).not.toContain(2);
    }
  });

  it("cuentas de locales DISTINTOS en un mismo reembolso → error claro, nada se escribe", async () => {
    fake.state.debtors = [2, 3];
    const r = await registerFonaviReimbursement({
      ...DATA,
      totalAmount: 200,
      allocations: [
        { receivableId: "22222222-2222-2222-2222-222222222222", amount: 100 },
        { receivableId: "33333333-3333-3333-3333-333333333333", amount: 100 },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("locales distintos");
    expect(fake.state.txCalls).toHaveLength(0);
  });

  it("fallo en la PRIMERA transacción (cobro) → error limpio y nada aplicado", async () => {
    fake.state.failOnTxCall = 1;

    const r = await registerFonaviReimbursement(DATA);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("conexión perdida");

    // Solo se intentó la primera transacción; sin cascada y sin recálculo.
    expect(fake.state.txCalls).toHaveLength(1);
    expect(recalcBankBalance).not.toHaveBeenCalled();
  });
});
