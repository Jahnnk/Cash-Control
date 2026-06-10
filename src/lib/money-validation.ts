/**
 * Validaciones compartidas de montos y fechas para las server actions.
 * Mensajes en español, pensados para mostrarse tal cual al usuario.
 *
 * Tope de monto: el mismo que ya usaba record-edits (999,999.99) —
 * ningún movimiento real del negocio se acerca; ataja typos como un
 * cero de más o un monto pegado con el número de operación.
 */

export const MAX_AMOUNT = 999_999.99;

/** Hoy en Perú (YYYY-MM-DD). La app opera en America/Lima. */
export function todayLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** null = válido; string = mensaje de error para el usuario. */
export function validateAmount(amount: number): string | null {
  if (!Number.isFinite(amount)) return "El monto no es un número válido";
  if (amount <= 0) return "El monto debe ser mayor a 0";
  if (amount > MAX_AMOUNT) {
    return `El monto no puede superar S/ ${MAX_AMOUNT.toLocaleString("es-PE", { minimumFractionDigits: 2 })} — revisa si hay un dígito de más`;
  }
  return null;
}

/** null = válido; string = mensaje de error. Formato YYYY-MM-DD y no futura. */
export function validateMovementDate(
  date: string,
  today: string = todayLima(),
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Fecha inválida";
  if (date > today) return "No se pueden registrar movimientos con fecha futura";
  return null;
}
