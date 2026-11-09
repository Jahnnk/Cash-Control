/**
 * Saldo de los fondos mutuos · lógica pura (8-nov-2026).
 *
 * Solo hay dos fondos: el de Atelier y el de Centro. El sistema no puede leer el saldo real, así que
 * Jahnn anota el del estado de cuenta (fondos_mutuos_saldo) y entre una anotación y la siguiente el sistema
 * lo mantiene al día con lo que ya conoce: suma lo depositado (gasto «AHORRO») y resta lo rescatado
 * (ingreso «rescate») DESPUÉS de la fecha anotada. No calcula rendimientos: se corrigen al anotar el siguiente estado.
 */

export type NotaFondo = { saldo: number; fecha: string };
export type EstadoFondo = {
  anotado: NotaFondo | null;
  /** Depositado al fondo después de la fecha anotada. */
  depositos: number;
  /** Rescatado del fondo después de la fecha anotada. */
  rescates: number;
  /** Lo anotado + depósitos − rescates; null si nunca se anotó un saldo. */
  estimado: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function estadoDelFondo(anotado: NotaFondo | null, depositos: number, rescates: number): EstadoFondo {
  if (!anotado) return { anotado: null, depositos: r2(depositos), rescates: r2(rescates), estimado: null };
  return { anotado, depositos: r2(depositos), rescates: r2(rescates), estimado: r2(Math.max(0, anotado.saldo + depositos - rescates)) };
}
