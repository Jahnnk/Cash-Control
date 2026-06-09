import { describe, it, expect } from "vitest";
import { splitIncomes, NON_OPERATIVE_CATEGORIES, type IncomeLike } from "./income-base";

const op = (amount: number): IncomeLike => ({ amount, isReimbursement: false, nonOperativeCategory: null });
const reemb = (amount: number): IncomeLike => ({ amount, isReimbursement: true, nonOperativeCategory: null });
const noOp = (amount: number, cat = "Venta de activos"): IncomeLike => ({ amount, isReimbursement: false, nonOperativeCategory: cat });

describe("splitIncomes (base EBITDA canónica)", () => {
  it("sin marcas: adjusted = gross (comportamiento histórico)", () => {
    const r = splitIncomes([op(1000), op(500.5)]);
    expect(r.gross).toBeCloseTo(1500.5, 2);
    expect(r.adjusted).toBeCloseTo(1500.5, 2);
    expect(r.nonOperative).toBe(0);
    expect(r.fonaviReimbursements).toBe(0);
  });

  it("excluye reembolsos Fonavi de la base, como siempre", () => {
    const r = splitIncomes([op(1000), reemb(900)]);
    expect(r.gross).toBeCloseTo(1900, 2);
    expect(r.adjusted).toBeCloseTo(1000, 2);
    expect(r.fonaviReimbursements).toBeCloseTo(900, 2);
  });

  it("caso congeladora: 6,340 efectivo + 1,660 transferencia NO entran al EBITDA pero SÍ al gross", () => {
    const r = splitIncomes([
      op(10000),                          // ventas normales
      noOp(6340, "Venta de activos"),     // congeladora, efectivo
      noOp(1660, "Venta de activos"),     // congeladora, transferencia
    ]);
    expect(r.gross).toBeCloseTo(18000, 2);     // todo el dinero entró
    expect(r.nonOperative).toBeCloseTo(8000, 2);
    expect(r.adjusted).toBeCloseTo(10000, 2);  // EBITDA solo ve las ventas
  });

  it("una fila con doble marca (reembolso + no-operativo) se excluye UNA sola vez", () => {
    const r = splitIncomes([
      { amount: 500, isReimbursement: true, nonOperativeCategory: "Otros no operativos" },
      op(1000),
    ]);
    expect(r.gross).toBeCloseTo(1500, 2);
    expect(r.adjusted).toBeCloseTo(1000, 2); // no 500 (doble resta)
    expect(r.fonaviReimbursements).toBeCloseTo(500, 2);
    expect(r.nonOperative).toBe(0);
  });

  it("cadena vacía o categoría '' cuentan como operativo", () => {
    const r = splitIncomes([{ amount: 700, isReimbursement: false, nonOperativeCategory: "" }]);
    expect(r.adjusted).toBeCloseTo(700, 2);
    expect(r.nonOperative).toBe(0);
  });

  it("siempre cierra: adjusted + reembolsos + nonOperative === gross", () => {
    const rows = [op(123.45), reemb(67.89), noOp(890.11, "Aportes de socios"), op(0.01)];
    const r = splitIncomes(rows);
    expect(r.adjusted + r.fonaviReimbursements + r.nonOperative).toBeCloseTo(r.gross, 2);
    expect(r.count).toBe(4);
  });

  it("expone las 4 categorías iniciales", () => {
    expect(NON_OPERATIVE_CATEGORIES).toEqual([
      "Venta de activos",
      "Préstamos / financiamiento recibido",
      "Aportes de socios",
      "Otros no operativos",
    ]);
  });
});
