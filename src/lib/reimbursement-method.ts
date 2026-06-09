/**
 * Método con el que Fonavi reembolsa a Atelier un gasto compartido cobrado.
 * Regla canónica del saldo: transferencia/yape-plin entran al banco; el
 * efectivo NO (suma a la caja en efectivo de Atelier).
 */
export type ReimbursementMethod = "transferencia" | "efectivo" | "yape_plin";

export const REIMBURSEMENT_METHODS: ReimbursementMethod[] = [
  "transferencia",
  "efectivo",
  "yape_plin",
];

export function isReimbursementMethod(v: string): v is ReimbursementMethod {
  return (REIMBURSEMENT_METHODS as string[]).includes(v);
}

/**
 * ¿El cobro entra al saldo BANCARIO? efectivo → false (va a caja efectivo);
 * transferencia/yape-plin → true.
 */
export function reimbursementHitsBank(method: ReimbursementMethod): boolean {
  return method !== "efectivo";
}

/**
 * payment_method que debe quedar en el gasto-espejo de Fonavi cuando se
 * "activa" tras el cobro. Refleja cómo pagó Fonavi: si fue efectivo, el
 * espejo es 'efectivo' (no afecta el banco de Fonavi); si fue
 * transferencia/yape, queda como gasto bancario de Fonavi.
 * Valores compatibles con expenses.payment_method (transferencia/efectivo/yape).
 */
export function reimbursementMirrorMethod(
  method: ReimbursementMethod,
): "transferencia" | "efectivo" | "yape" {
  if (method === "efectivo") return "efectivo";
  if (method === "yape_plin") return "yape";
  return "transferencia";
}
