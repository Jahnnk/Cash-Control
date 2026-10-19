/**
 * La semana de la reunión de los lunes · lógica PURA (19-oct-2026).
 *
 * Jahnn: «todos los lunes es mi reunión semanal con socias y administradores… hoy lunes 19 revisamos los KPIs de
 * cada sede del 11 al 17, y el sistema me proponía del 18 al 24 (la semana en curso)». La reunión siempre mira la
 * ÚLTIMA SEMANA CERRADA (domingo → sábado), no la que recién empieza.
 */

import { weekStartOf, weekEndOf } from "./engine";

const mover = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Domingo y sábado de la última semana que ya terminó (si hoy es sábado, la semana en curso aún no cierra). */
export function semanaDeLaReunion(hoy: string): { start: string; end: string } {
  const start = mover(weekStartOf(hoy), -7);
  return { start, end: weekEndOf(start) };
}
