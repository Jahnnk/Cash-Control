/**
 * Tests de ATOMICIDAD de saveBankIncomeItems (guardado del día).
 *
 * No tocan Neon: el driver se reemplaza por un fake que registra cada
 * query y permite simular un fallo a media operación. Lo que se verifica
 * es la propiedad que garantiza el rollback: TODAS las escrituras
 * (DELETE + INSERTs + cache) viajan en UNA sola llamada a
 * sql.transaction() y NINGUNA se ejecuta suelta fuera de ella. Si la
 * transacción falla, Neon revierte todo — no pueden quedar ingresos del
 * día parcialmente borrados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeQuery = { text: string; awaited: boolean };

const fake = vi.hoisted(() => {
  const state = {
    queries: [] as FakeQuery[],
    txCalls: [] as FakeQuery[][],
    failTx: false,
  };
  const makeTag = () => {
    const tag = (strings: TemplateStringsArray, ..._values: unknown[]) => {
      const q: FakeQuery = { text: strings.join(" $ "), awaited: false };
      state.queries.push(q);
      return {
        q,
        then(onRes: (v: unknown) => unknown, onRej?: (e: unknown) => unknown) {
          q.awaited = true; // ejecutada SUELTA (fuera de transacción)
          return Promise.resolve([]).then(onRes, onRej);
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
vi.mock("@/db", () => ({ db: { execute: vi.fn(async () => ({ rows: [] })) } }));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => 1) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./daily-records", () => ({ recalcBankBalance: vi.fn(async () => undefined) }));

import { saveBankIncomeItems } from "./bank-income";
import { recalcBankBalance } from "./daily-records";

const ITEMS = [
  { amount: 100, clientId: null, note: "Ingreso del día", paymentMethod: "transferencia" },
  { amount: 50.5, clientId: null, note: "Yape", paymentMethod: "yape" },
];

beforeEach(() => {
  fake.state.queries.length = 0;
  fake.state.txCalls.length = 0;
  fake.state.failTx = false;
  vi.mocked(recalcBankBalance).mockClear();
});

describe("saveBankIncomeItems — atomicidad", () => {
  it("todo el guardado del día (DELETE + INSERTs + cache) va en UNA transacción", async () => {
    await saveBankIncomeItems("2026-06-09", ITEMS);

    expect(fake.state.txCalls).toHaveLength(1);
    const tx = fake.state.txCalls[0];
    // 1 DELETE + 2 INSERT + 1 UPDATE cache, en ese orden
    expect(tx).toHaveLength(4);
    expect(tx[0].text).toContain("DELETE FROM bank_income_items");
    expect(tx[1].text).toContain("INSERT INTO bank_income_items");
    expect(tx[2].text).toContain("INSERT INTO bank_income_items");
    expect(tx[3].text).toContain("UPDATE daily_records SET bank_income");
    // El DELETE preserva los filtros (no toca préstamos/transferencias/Byte)
    expect(tx[0].text).toContain("is_special_loan = false");
    expect(tx[0].text).toContain("is_byte_sale = false");
  });

  it("NINGUNA escritura se ejecuta suelta fuera de la transacción", async () => {
    await saveBankIncomeItems("2026-06-09", ITEMS);
    const loose = fake.state.queries.filter((q) => q.awaited);
    expect(loose).toHaveLength(0);
  });

  it("el recálculo de saldo corre DESPUÉS de la transacción exitosa", async () => {
    await saveBankIncomeItems("2026-06-09", ITEMS);
    expect(recalcBankBalance).toHaveBeenCalledTimes(1);
    expect(recalcBankBalance).toHaveBeenCalledWith("2026-06-09");
  });

  it("fallo a media operación → error propagado, rollback total (nada ejecutado suelto, sin recálculo)", async () => {
    fake.state.failTx = true;

    await expect(saveBankIncomeItems("2026-06-09", ITEMS)).rejects.toThrow(
      "conexión perdida con Neon",
    );

    // La transacción se intentó UNA vez y falló: Neon revierte todo.
    expect(fake.state.txCalls).toHaveLength(1);
    // Cero queries ejecutadas fuera de la transacción → imposible que el
    // DELETE se haya aplicado sin los INSERTs (el bug que motivó este fix).
    expect(fake.state.queries.filter((q) => q.awaited)).toHaveLength(0);
    // Y el saldo no se recalcula sobre datos a medias.
    expect(recalcBankBalance).not.toHaveBeenCalled();
  });
});
