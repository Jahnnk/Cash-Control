/**
 * Métodos de pago de egresos.
 *
 * - transferencia, efectivo, yape: los 3 reales que el usuario elige
 *   manualmente al registrar un movimiento.
 * - pendiente_atelier: especial. Solo se aplica al gasto-espejo en
 *   Fonavi cuando Atelier registra un gasto compartido (CAMBIO 7.5).
 *   Mientras un gasto esté en este estado, NO afecta el saldo BCP de
 *   Fonavi. Cuando Fonavi reembolsa, el método cambia al real
 *   (transferencia/yape/efectivo) y empieza a impactar el saldo.
 */
export const PAYMENT_METHODS = ["transferencia", "efectivo", "yape"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

/** Método de pago reservado para el auto-mirror Atelier→Fonavi. */
export const PENDING_ATELIER_METHOD = "pendiente_atelier";

/** Métodos que NO afectan el saldo BCP del negocio (se excluyen en cálculos). */
export const NON_BANK_METHODS = ["efectivo", PENDING_ATELIER_METHOD] as const;

/**
 * Cláusula SQL para excluir métodos no-bancarios al calcular saldo BCP.
 * Uso: `... AND payment_method NOT IN ('efectivo', 'pendiente_atelier')`
 */
export const NOT_BANK_PAYMENT_SQL = `payment_method NOT IN ('efectivo', '${PENDING_ATELIER_METHOD}')`;
