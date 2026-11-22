/**
 * PIN de caja de cada sede — canje de vales SIN cuenta en Cash Control.
 *
 * Los cajeros no usan la app. Cuando el encargado o el administrador no
 * están, el cajero canjea el vale del invitado en su celular escribiendo el
 * PIN de caja de la sede (6 dígitos). Jahnn lo genera —nunca lo elige una
 * persona—, se muestra UNA vez y en la base solo queda su hash (scrypt).
 *
 * Lógica pura acá (formato, generación, reglas de bloqueo); la base de datos
 * y el hash viven en las acciones.
 */

export const LARGO_PIN = 6;
/** Intentos fallidos seguidos que bloquean la caja de esa sede. */
export const MAX_INTENTOS_PIN = 5;
export const MINUTOS_BLOQUEO_PIN = 10;

/** El mayor múltiplo de 10^6 que cabe en 32 bits: lo de arriba se descarta para que ningún dígito salga más seguido. */
const LIMITE_UNIFORME = 4_294_000_000;

function uint32AlAzar(): number {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Un PIN de 6 dígitos al azar (con ceros a la izquierda). `azar` se inyecta solo para probar. */
export function generarPin(azar: () => number = uint32AlAzar): string {
  let n = azar();
  while (n >= LIMITE_UNIFORME) n = azar();
  return String(n % 10 ** LARGO_PIN).padStart(LARGO_PIN, "0");
}

/** Lo que teclea el cajero → solo dígitos. */
export function normalizarPin(entrada: string): string {
  return (entrada ?? "").replace(/\D/g, "");
}

export function formatoPinValido(pin: string): boolean {
  return new RegExp(`^\\d{${LARGO_PIN}}$`).test(pin);
}

/** Cuántos intentos le quedan tras fallar. `intentos` = fallos ya contados, este incluido. */
export function intentosRestantes(intentos: number): number {
  return Math.max(0, MAX_INTENTOS_PIN - intentos);
}

export function mensajePinIncorrecto(intentos: number): string {
  const quedan = intentosRestantes(intentos);
  if (quedan === 0) {
    return `PIN incorrecto. La caja de esta sede queda bloqueada ${MINUTOS_BLOQUEO_PIN} minutos. Que lo canjee el encargado o el administrador.`;
  }
  return `PIN incorrecto. Te ${quedan === 1 ? "queda 1 intento" : `quedan ${quedan} intentos`}.`;
}
