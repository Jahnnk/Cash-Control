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
 * - socio: especial. Gasto pagado por el SOCIO (Jahnn) con su propio
 *   dinero (préstamo directo). Es un gasto operativo REAL (cuenta en
 *   presupuesto, EBITDA, fijo/variable, punto de equilibrio) pero el
 *   dinero nunca pasó por cuentas de Atelier: NO toca el saldo BCP ni
 *   la caja. La contraparte es la deuda en Préstamos del Socio.
 */
export const PAYMENT_METHODS = ["transferencia", "efectivo", "yape"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

/** Método de pago reservado para el auto-mirror Atelier→Fonavi. */
export const PENDING_ATELIER_METHOD = "pendiente_atelier";

/** Método reservado para gastos pagados por el socio (préstamo directo). */
export const SOCIO_METHOD = "socio";

/** Métodos que NO afectan el saldo BCP del negocio (se excluyen en cálculos). */
export const NON_BANK_METHODS = ["efectivo", PENDING_ATELIER_METHOD, SOCIO_METHOD] as const;

/**
 * Cláusula SQL para excluir métodos no-bancarios al calcular saldo BCP.
 * Uso: `... AND payment_method NOT IN ('efectivo', 'pendiente_atelier', 'socio')`
 */
export const NOT_BANK_PAYMENT_SQL = `payment_method NOT IN ('efectivo', '${PENDING_ATELIER_METHOD}', '${SOCIO_METHOD}')`;
