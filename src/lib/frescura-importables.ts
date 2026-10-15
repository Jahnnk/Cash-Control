/**
 * «Datos cargados»: hasta qué fecha llega cada cosa que Jahnn sube (puro).
 *
 * Pedido de Jahnn (15-oct-2026): finanzas no siempre manda sus reportes a tiempo y
 * necesita ver por lo menos Byte (ventas, mayor y menor rotación), que sube él una vez
 * por semana; dos botones en el dashboard (Byte y Excel de Kelly) y que el sistema diga
 * a qué fecha tiene cada información. Misma regla que la banda de frescura: el grupo
 * vale por su PEOR sede (mostrar la mejor sería la mentira cómoda).
 */

export type TonoFecha = "al-dia" | "atrasado" | "muy-atrasado" | "sin-datos";

/** Días de rezago a partir de los cuales una fecha deja de ser «al día» (Byte se sube cada semana). */
export const DIAS_AL_DIA = 8;
export const DIAS_MUY_ATRASADO = 15;

const dia = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 86_400_000;

export function diasDeRezago(hasta: string | null, hoy: string): number | null {
  return hasta ? Math.max(0, Math.round(dia(hoy) - dia(hasta))) : null;
}

export function tonoDeFecha(hasta: string | null, hoy: string): TonoFecha {
  const d = diasDeRezago(hasta, hoy);
  if (d === null) return "sin-datos";
  return d <= DIAS_AL_DIA ? "al-dia" : d <= DIAS_MUY_ATRASADO ? "atrasado" : "muy-atrasado";
}

/** La fecha del grupo: la de la sede más atrasada. Si a alguna sede le falta, el grupo no tiene el dato. */
export function fechaDelGrupo(fechas: (string | null)[]): string | null {
  if (fechas.length === 0 || fechas.some((f) => f === null)) return null;
  return (fechas as string[]).reduce((m, f) => (f < m ? f : m));
}

/** Qué sedes arrastran al grupo (las de la fecha más atrasada, o las que no tienen nada). */
export function sedesQueArrastran(sedes: { nombre: string; hasta: string | null }[]): string[] {
  const sin = sedes.filter((s) => s.hasta === null).map((s) => s.nombre);
  if (sin.length) return sin;
  const peor = fechaDelGrupo(sedes.map((s) => s.hasta));
  return sedes.filter((s) => s.hasta === peor).map((s) => s.nombre);
}

/** «13/10». */
export const ddmm = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : "—");
