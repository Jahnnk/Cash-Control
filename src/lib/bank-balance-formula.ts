/**
 * Fórmula pura del saldo del banco (BCP) — espejo testeable de la lógica
 * que vive en SQL en dos lugares:
 *   - src/app/actions/daily-records.ts → recalcBankBalance (cadena bank_balance_real)
 *   - src/app/actions/record-edits.ts → recalcBankBalanceQuery (edit/delete)
 *   - src/app/actions/bank-balance.ts → getUnifiedBankBalance (saldo mostrado)
 *
 * NO reemplaza esas queries (la BD sigue calculando con SQL). Es una
 * réplica fiel de los MISMOS predicados de filtrado, extraída a funciones
 * puras para poder testear el contrato sin conexión a BD. Si las queries
 * SQL cambian sus filtros, los tests de contrato (bank-balance-formula.test.ts)
 * deben actualizarse en conjunto.
 *
 * Contexto: estos predicados blindan la corrección del bug de mayo 2026,
 * donde la fórmula de edit/delete NO excluía is_special_loan ni efectivo en
 * ingresos, inflando el saldo en S/1,686.83.
 *
 * ─── Reglas canónicas de la CADENA bank_balance_real (el saldo que se muestra) ───
 *   Ingreso cuenta para el banco si:  !archived && (!is_special_loan || loan_via_bank) && payment_method != 'efectivo'
 *   Egreso  cuenta para el banco si:  !archived && (!is_special_loan || loan_via_bank) && payment_method NOT IN ('efectivo','pendiente_atelier','socio')
 *
 * ⚠️ loan_via_bank (junio 2026): un préstamo del socio que SÍ pasó por la
 *    cuenta BCP (Jahnn depositó al banco, o Atelier le devolvió por
 *    transferencia) debe contar en la cadena — el dinero se movió de
 *    verdad. Los préstamos históricos (Jahnn pagando gastos directo con
 *    su dinero) tienen loan_via_bank=false y siguen excluidos. En SQL el
 *    predicado es: (is_special_loan = false OR loan_via_bank = true).
 *
 * ⚠️ La cadena NO excluye is_internal_transfer: cada pata de una
 *    transferencia interna mueve su propia cuenta (la pata BCP suma/resta
 *    al banco; la pata efectivo se excluye por la regla de 'efectivo').
 *    (El cache bank_income/bank_expense sí excluye internal_transfer, pero
 *    ese cache NO es el saldo mostrado.)
 *
 * ─── Regla del saldo EFECTIVO (separado del banco) ───
 *   getCashBalance: payment_method = 'efectivo' && !archived
 *   (NO excluye is_special_loan: la caja física no distingue préstamos.)
 */

export type BankMovement = {
  amount: number;
  paymentMethod: string;
  isSpecialLoan?: boolean;
  /** Préstamo/devolución del socio que SÍ pasó por la cuenta BCP. */
  loanViaBank?: boolean;
  isInternalTransfer?: boolean;
  archived?: boolean;
};

/** Redondeo a 2 decimales, igual que ROUND(x, 2) en SQL y Math.round(x*100)/100. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ¿Este ingreso suma al saldo del BANCO? (regla canónica de la cadena) */
export function isBankIncomeEligible(m: BankMovement): boolean {
  return (
    !m.archived &&
    (!m.isSpecialLoan || m.loanViaBank === true) &&
    m.paymentMethod !== "efectivo"
  );
}

/** ¿Este egreso resta del saldo del BANCO? (regla canónica de la cadena) */
export function isBankExpenseEligible(m: BankMovement): boolean {
  return (
    !m.archived &&
    (!m.isSpecialLoan || m.loanViaBank === true) &&
    m.paymentMethod !== "efectivo" &&
    m.paymentMethod !== "pendiente_atelier" &&
    // 'socio': gasto pagado por Jahnn con su dinero (préstamo directo) —
    // gasto operativo real, pero nunca salió de la cuenta BCP.
    m.paymentMethod !== "socio"
  );
}

/** ¿Este movimiento afecta el saldo de EFECTIVO (caja física)? */
export function isCashEligible(m: BankMovement): boolean {
  return !m.archived && m.paymentMethod === "efectivo";
}

/**
 * Saldo del banco = base + Σ ingresos elegibles − Σ egresos elegibles.
 * `base` es el saldo del día previo (ancla de la cadena).
 */
export function computeBankBalance(
  base: number,
  incomes: BankMovement[],
  expenses: BankMovement[],
): number {
  const income = incomes
    .filter(isBankIncomeEligible)
    .reduce((s, m) => s + m.amount, 0);
  const expense = expenses
    .filter(isBankExpenseEligible)
    .reduce((s, m) => s + m.amount, 0);
  return round2(base + income - expense);
}

/**
 * Saldo de efectivo (caja física) = inicial + Σ ingresos efectivo − Σ egresos efectivo.
 * Independiente del saldo del banco.
 */
export function computeCashBalance(
  initial: number,
  incomes: BankMovement[],
  expenses: BankMovement[],
): number {
  const income = incomes.filter(isCashEligible).reduce((s, m) => s + m.amount, 0);
  const expense = expenses.filter(isCashEligible).reduce((s, m) => s + m.amount, 0);
  return round2(initial + income - expense);
}
