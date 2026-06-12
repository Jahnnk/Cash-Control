import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeBankBalance,
  computeCashBalance,
  isBankIncomeEligible,
  isBankExpenseEligible,
  type BankMovement,
} from "./bank-balance-formula";

const tx = (amount: number, extra: Partial<BankMovement> = {}): BankMovement => ({
  amount,
  paymentMethod: "transferencia",
  ...extra,
});

describe("computeBankBalance — reglas canónicas de la cadena", () => {
  // ── Caso 1: el bug real del 21-may ──────────────────────────────
  // Ingresos: 826.85, 652(loan), 584.83(loan), 450(loan), 450, 73.45, 25, 11.20
  // Egresos:  253.66, 70 | Base (saldo 20-may): 4214.75
  // Correcto = 5277.59 (NO 6964.42, que era el bug al incluir préstamos-socio)
  it("1. excluye préstamos-socio — caso 21-may da 5277.59 (no 6964.42)", () => {
    const base = 4214.75;
    const incomes: BankMovement[] = [
      tx(826.85),
      tx(652, { isSpecialLoan: true }),
      tx(584.83, { isSpecialLoan: true }),
      tx(450, { isSpecialLoan: true }),
      tx(450),
      tx(73.45),
      tx(25),
      tx(11.2),
    ];
    const expenses: BankMovement[] = [tx(253.66), tx(70)];

    expect(computeBankBalance(base, incomes, expenses)).toBe(5277.59);
    // Y NO el resultado inflado de la fórmula buggy:
    expect(computeBankBalance(base, incomes, expenses)).not.toBe(6964.42);
  });

  // ── Caso 2: efectivo NO suma al banco ───────────────────────────
  it("2. excluye ingresos en efectivo del saldo del banco", () => {
    const incomes = [tx(100), tx(500, { paymentMethod: "efectivo" })];
    // Solo cuenta el de 100 (transferencia).
    expect(computeBankBalance(0, incomes, [])).toBe(100);
    expect(isBankIncomeEligible(tx(500, { paymentMethod: "efectivo" }))).toBe(false);
  });

  // ── Caso 3: transferencias internas (comportamiento REAL de la cadena) ──
  // ⚠️ La cadena NO excluye is_internal_transfer en bloque: trata cada
  // pata por su payment_method. Una transferencia interna efectivo→BCP
  // suma su pata BCP (transferencia) y excluye su pata efectivo.
  it("3. transferencia interna: la pata BCP cuenta, la pata efectivo no", () => {
    const incomes = [tx(300, { isInternalTransfer: true })]; // pata BCP entra
    const expenses = [
      tx(300, { isInternalTransfer: true, paymentMethod: "efectivo" }), // pata efectivo sale de caja, no del banco
    ];
    // Banco: +300 (pata BCP), egreso efectivo excluido → +300
    expect(computeBankBalance(0, incomes, expenses)).toBe(300);
  });

  // ── Caso 4: archivados no cuentan ───────────────────────────────
  it("4. excluye movimientos archivados", () => {
    const incomes = [tx(100), tx(999, { archived: true })];
    const expenses = [tx(50), tx(888, { archived: true })];
    expect(computeBankBalance(0, incomes, expenses)).toBe(50); // 100 - 50
    expect(isBankIncomeEligible(tx(999, { archived: true }))).toBe(false);
    expect(isBankExpenseEligible(tx(888, { archived: true }))).toBe(false);
  });

  // ── Caso 6: egresos efectivo / pendiente_atelier no restan ──────
  it("6. egresos efectivo y pendiente_atelier no restan del banco", () => {
    const expenses = [
      tx(100), // transferencia → resta
      tx(200, { paymentMethod: "efectivo" }), // no resta
      tx(300, { paymentMethod: "pendiente_atelier" }), // no resta
    ];
    expect(computeBankBalance(1000, [], expenses)).toBe(900); // 1000 - 100
    expect(isBankExpenseEligible(tx(200, { paymentMethod: "efectivo" }))).toBe(false);
    expect(isBankExpenseEligible(tx(300, { paymentMethod: "pendiente_atelier" }))).toBe(false);
  });
});

// ── Caso 8: préstamos del socio que SÍ pasaron por el banco ───────
describe("loan_via_bank — préstamos/devoluciones que pasaron por BCP", () => {
  it("8a. préstamo del socio depositado al BCP SÍ suma al banco", () => {
    // El caso real: S/1,000 de Jahnn para pagar RestaPro entró al BCP.
    const loan = tx(1000, { isSpecialLoan: true, loanViaBank: true });
    expect(isBankIncomeEligible(loan)).toBe(true);
    expect(computeBankBalance(5000, [loan], [])).toBe(6000);
  });

  it("8b. préstamo 'directo' (Jahnn pagó el gasto) sigue excluido del banco", () => {
    const loan = tx(1812, { isSpecialLoan: true, loanViaBank: false });
    expect(isBankIncomeEligible(loan)).toBe(false);
    // Y sin la marca (filas históricas con default false) también excluido:
    expect(isBankIncomeEligible(tx(652, { isSpecialLoan: true }))).toBe(false);
  });

  it("8c. devolución a Jahnn por transferencia SÍ resta del banco", () => {
    const refund = tx(500, { isSpecialLoan: true, loanViaBank: true });
    expect(isBankExpenseEligible(refund)).toBe(true);
    expect(computeBankBalance(5000, [], [refund])).toBe(4500);
  });

  it("8d. devolución en efectivo no toca el banco (sale de caja) aunque viaBank quede false", () => {
    const refund = tx(200, {
      isSpecialLoan: true,
      loanViaBank: false,
      paymentMethod: "efectivo",
    });
    expect(isBankExpenseEligible(refund)).toBe(false);
    expect(computeCashBalance(1000, [], [refund])).toBe(800);
  });

  it("8e. loanViaBank en una fila NO-préstamo no cambia nada (solo aplica al par con isSpecialLoan)", () => {
    expect(isBankIncomeEligible(tx(100, { loanViaBank: true }))).toBe(true);
    expect(isBankIncomeEligible(tx(100, { loanViaBank: false }))).toBe(true);
  });
});

// ── Caso 7: saldo efectivo separado del banco ─────────────────────
describe("computeCashBalance — caja física separada del banco", () => {
  it("7. suma solo efectivo, independiente del banco, e incluye préstamos-socio", () => {
    const incomes = [
      tx(500, { paymentMethod: "efectivo" }),
      tx(1000), // transferencia → NO es caja
      tx(300, { paymentMethod: "efectivo", isSpecialLoan: true }), // efectivo SÍ cuenta aunque sea préstamo
    ];
    const expenses = [
      tx(200, { paymentMethod: "efectivo" }),
      tx(9999), // transferencia → NO afecta caja
    ];
    // Caja: 500 + 300 - 200 = 600
    expect(computeCashBalance(0, incomes, expenses)).toBe(600);
    // El mismo set en el banco: ingreso 1000 (transf) - egreso 9999 (transf) = -8999
    expect(computeBankBalance(0, incomes, expenses)).toBe(1000 - 9999);
  });
});

// ── Caso 5: las dos fórmulas SQL coinciden (guardia de regresión) ──
// Lee el código fuente de las dos implementaciones de recálculo y verifica
// que AMBAS apliquen los mismos filtros críticos en la suma de ingresos.
// Este es el test que habría cazado el bug de mayo 2026: la fórmula de
// edit/delete (record-edits.ts) carecía de `is_special_loan = false` y
// `payment_method <> 'efectivo'` en ingresos.
describe("5. las fórmulas de create y edit/delete usan los mismos filtros", () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
  const dailyRecords = read("src/app/actions/daily-records.ts");
  const recordEdits = read("src/app/actions/record-edits.ts");

  // Extrae la(s) cláusula(s) de suma de ingresos de bank_income_items.
  // Las cláusulas viven en UNA línea de SQL, así que se captura hasta el
  // fin de línea (no hasta el primer ')': el predicado de préstamos tiene
  // paréntesis propios desde junio 2026).
  const incomeClauses = (src: string): string[] => {
    const matches = src.match(
      /SUM\(amount\) FROM bank_income_items WHERE[^\n]*?date = dr\.date[^\n]*/g,
    );
    return matches ?? [];
  };

  it("daily-records.ts: la cadena excluye préstamos-socio (salvo via banco) y efectivo en ingresos", () => {
    const chainClause = incomeClauses(dailyRecords).find((c) =>
      c.includes("payment_method <> 'efectivo'"),
    );
    expect(chainClause, "no se encontró la cláusula de la cadena").toBeTruthy();
    expect(chainClause!).toContain("(is_special_loan = false OR loan_via_bank = true)");
    expect(chainClause!).toContain("payment_method <> 'efectivo'");
    expect(chainClause!).toContain("archived = false");
  });

  it("record-edits.ts: la cadena excluye préstamos-socio (salvo via banco) y efectivo en ingresos (fix del bug)", () => {
    const clauses = incomeClauses(recordEdits);
    expect(clauses.length, "no se encontró la suma de ingresos").toBeGreaterThan(0);
    const chainClause = clauses.find((c) => c.includes("payment_method <> 'efectivo'"));
    expect(
      chainClause,
      "record-edits.ts NO excluye efectivo/préstamos en ingresos — REGRESIÓN del bug de mayo 2026",
    ).toBeTruthy();
    expect(chainClause!).toContain("(is_special_loan = false OR loan_via_bank = true)");
    expect(chainClause!).toContain("payment_method <> 'efectivo'");
    expect(chainClause!).toContain("archived = false");
  });

  it("TODAS las réplicas de la cadena usan el predicado extendido de préstamos via banco", () => {
    // Si una réplica conserva el predicado viejo (is_special_loan = false a
    // secas en la cadena), un préstamo via-banco contaría en unas vistas y
    // en otras no → saldos divergentes según la pantalla.
    const replicas = [
      "src/app/actions/daily-records.ts",
      "src/app/actions/record-edits.ts",
      "src/app/actions/bank-balance.ts",
      "src/app/actions/bank-real-checks.ts",
      "src/app/actions/excel-import.ts",
      "src/app/actions/grupo.ts",
      "src/app/actions/fonavi-receivables.ts",
    ];
    for (const rel of replicas) {
      const src = read(rel);
      expect(
        src.includes("(is_special_loan = false OR loan_via_bank = true)"),
        `${rel} no tiene el predicado extendido de la cadena (loan_via_bank)`,
      ).toBe(true);
    }
  });

  it("ambas implementaciones comparten los mismos filtros de ingreso en la cadena", () => {
    const norm = (s: string) =>
      s.replace(/\$\{[^}]+\}/g, "?").replace(/\s+/g, " ").trim();
    const a = incomeClauses(dailyRecords).find((c) => c.includes("payment_method <> 'efectivo'"));
    const b = incomeClauses(recordEdits).find((c) => c.includes("payment_method <> 'efectivo'"));
    expect(a && b).toBeTruthy();
    expect(norm(a!)).toBe(norm(b!));
  });
});
