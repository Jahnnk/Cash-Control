import { describe, it, expect } from "vitest";
import { splitExpenses, type ExpenseLike } from "./expense-split";

const ex = (amount: number, category: string, extra: Partial<ExpenseLike> = {}): ExpenseLike => ({
  amount,
  category,
  isShared: false,
  atelierAmount: amount,
  ...extra,
});

describe("splitExpenses — desglose canónico de egresos", () => {
  it("separa operativo y financiero por categoría excluida", () => {
    const expenses = [ex(100, "Insumos"), ex(50, "Préstamos"), ex(30, "Insumos")];
    const r = splitExpenses(expenses, (c) => c === "Préstamos");
    expect(r.gross).toBe(180);
    expect(r.financial).toBe(50);
    expect(r.operative).toBe(130); // 180 - 50
    expect(r.count).toBe(3);
  });

  it("usa la porción-Atelier en gastos compartidos (no el monto completo)", () => {
    // Gasto compartido de 1000, Atelier 700 / Fonavi 300.
    const expenses = [ex(1000, "Alquiler", { isShared: true, atelierAmount: 700 })];
    const r = splitExpenses(expenses, () => false);
    expect(r.gross).toBe(1000);          // desembolso total
    expect(r.atelierTotal).toBe(700);    // porción Atelier
    expect(r.fonaviShared).toBe(300);    // porción Fonavi (reconciliación)
    expect(r.operative).toBe(700);
  });

  it("cierra: gross − fonaviShared − financial = operative", () => {
    const expenses = [
      ex(1000, "Alquiler", { isShared: true, atelierAmount: 700 }),
      ex(200, "Préstamos"),
      ex(300, "Insumos"),
    ];
    const r = splitExpenses(expenses, (c) => c === "Préstamos");
    expect(r.gross - r.fonaviShared - r.financial).toBeCloseTo(r.operative, 6);
  });

  // ── Caso del bug del comparativo (financieros ×N) ──────────────────
  // El bug viejo hacia JOIN expense_categories ON ec.name=e.category SIN
  // scope de negocio, asi que un egreso en una categoria financiera cuyo
  // nombre existia en los 3 negocios se contaba 3 veces. Aqui, al operar
  // fila por fila, cada egreso se cuenta UNA sola vez, sin importar en
  // cuantos negocios exista la categoria.
  it("cuenta cada egreso financiero UNA sola vez (no multiplica por negocios)", () => {
    // "Préstamos" / "SUNAT" son exclude_from_ebitda en los 3 negocios.
    const expenses = [
      ex(2346, "Préstamos"),
      ex(973.23, "SUNAT"),
      ex(418.12, "Ss Bancarios"),
      ex(5000, "Insumos"),
    ];
    const excluded = new Set(["Préstamos", "SUNAT", "Ss Bancarios"]);
    const r = splitExpenses(expenses, (c) => excluded.has(c));
    // Financiero = suma una sola vez (no ×3).
    expect(r.financial).toBeCloseTo(2346 + 973.23 + 418.12, 6); // 3737.35
    expect(r.operative).toBeCloseTo(r.gross - r.financial, 6);   // operativo NO deflactado
    // Si se hubiera multiplicado ×3 el financiero seria 11212.05 → esto lo descarta.
    expect(r.financial).not.toBeCloseTo(11212.05, 2);
  });

  it("conjunto vacío → todo en cero", () => {
    const r = splitExpenses([], () => true);
    expect(r).toEqual({ gross: 0, atelierTotal: 0, financial: 0, operative: 0, fonaviShared: 0, count: 0 });
  });
});
