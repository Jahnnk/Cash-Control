/**
 * Base de ingresos para el EBITDA — función pura canónica (espejo de
 * splitExpenses en expense-split.ts).
 *
 * Regla: los ingresos NO operativos (venta de activos, préstamos recibidos,
 * aportes de socios…) y los reembolsos de Fonavi SÍ entran al flujo de caja
 * y a los saldos (el dinero entró de verdad), pero NO cuentan como ventas
 * ni en la base del EBITDA.
 *
 * Tanto el reporte directo como el comparativo "mes anterior" DEBEN pasar
 * sus filas por esta misma función — nunca lógica paralela (ver bug
 * histórico del comparativo de egresos, ×N por JOIN sin scope).
 */

export const NON_OPERATIVE_CATEGORIES = [
  "Venta de activos",
  "Préstamos / financiamiento recibido",
  "Aportes de socios",
  "Otros no operativos",
] as const;

export type IncomeLike = {
  amount: number;
  /** Reembolso de Fonavi por gasto compartido (is_fonavi_reimbursement). */
  isReimbursement: boolean;
  /** NULL/undefined = operativo; texto = categoría no operativa. */
  nonOperativeCategory: string | null;
};

export type IncomeSplit = {
  /** Todo lo que entró (sin special_loan/internal/archived, ya filtrados en query). */
  gross: number;
  /** Reembolsos Fonavi (se excluyen de la base, como siempre). */
  fonaviReimbursements: number;
  /** Ingresos no operativos (excluidos de ventas/EBITDA). */
  nonOperative: number;
  /** Base EBITDA: gross − reembolsos − no operativos. */
  adjusted: number;
  count: number;
};

export function splitIncomes(incomes: IncomeLike[]): IncomeSplit {
  let gross = 0;
  let fonaviReimbursements = 0;
  let nonOperative = 0;
  for (const i of incomes) {
    gross += i.amount;
    if (i.isReimbursement) {
      fonaviReimbursements += i.amount;
    } else if (i.nonOperativeCategory != null && i.nonOperativeCategory !== "") {
      // else-if: si una fila tuviera ambas marcas, se excluye UNA sola vez.
      nonOperative += i.amount;
    }
  }
  return {
    gross,
    fonaviReimbursements,
    nonOperative,
    adjusted: gross - fonaviReimbursements - nonOperative,
    count: incomes.length,
  };
}
