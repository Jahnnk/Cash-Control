/**
 * Constantes y helpers para "Préstamos del socio" (Jahnn → Atelier).
 *
 * Caso de uso: cuando Jahnn presta dinero personal a Atelier para liquidez,
 * estos movimientos NO son operación normal. La columna `is_special_loan`
 * en expenses / bank_income_items / expense_categories permite filtrarlos
 * de los reportes operativos (ingresos del mes, EBITDA, categorías,
 * presupuesto, vista Grupo) sin perder trazabilidad.
 */

import type { NON_OPERATIVE_CATEGORIES } from "@/lib/income-base";

/** Nombre canónico de la categoría especial. NUNCA cambiarlo sin migrar datos. */
export const LOAN_CATEGORY = "Préstamos del socio";

/**
 * Categoría de ingreso NO operativo bajo la cual se puede marcar un
 * ingreso del Registro Diario como préstamo del socio (Jahnn → Atelier).
 * Tipada contra la lista canónica para que un rename rompa el compile.
 */
export const LOAN_NON_OPERATIVE_CATEGORY: (typeof NON_OPERATIVE_CATEGORIES)[number] =
  "Préstamos / financiamiento recibido";

/** Solo Atelier (business_id=1) tiene préstamos del socio. */
export const ATELIER_BUSINESS_ID = 1;

/** Tipos de movimiento en la página /atelier/prestamos-socio. */
export type LoanKind = "loan" | "refund";

/**
 * Snippet SQL reusable para EXCLUIR préstamos del socio de queries
 * operativos. Se inyecta en los WHERE como condición adicional:
 *
 *   WHERE business_id = ${bId} AND ${EXCLUDE_LOANS_EXPENSES_SQL}
 *
 * Implementado como string template para usar con drizzle `sql.raw`.
 */
export const EXCLUDE_LOANS_EXPENSES_SQL = "is_special_loan = false";
export const EXCLUDE_LOANS_INCOME_SQL = "is_special_loan = false";
