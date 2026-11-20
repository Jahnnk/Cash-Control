/**
 * Saludo del Panel de Sede según la hora de Lima (pedido de Jahnn, 20-nov-2026):
 * de 5:00 a 11:59 «Buenos días», de 12:00 a 18:59 «Buenas tardes», el resto «Buenas noches».
 */

export type Saludo = "Buenos días" | "Buenas tardes" | "Buenas noches";

/** Hora (0-23) en Lima del instante dado. */
export function horaLima(ahora: Date): number {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Lima" }).format(ahora));
  return h === 24 ? 0 : h;
}

export function saludoPorHora(hora: number): Saludo {
  if (hora >= 5 && hora < 12) return "Buenos días";
  if (hora >= 12 && hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** «¡Buenos días, Sol!» — sin nombre, solo «¡Buenos días!». Usa el primer nombre. */
export function textoSaludo(ahora: Date, nombre: string | null | undefined): string {
  const s = saludoPorHora(horaLima(ahora));
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  return primero ? `¡${s}, ${primero}!` : `¡${s}!`;
}

/** «Viernes, 20 de noviembre de 2026» en hora de Lima. */
export function fechaLarga(ahora: Date): string {
  const t = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Lima" }).format(ahora);
  return t.charAt(0).toUpperCase() + t.slice(1);
}
