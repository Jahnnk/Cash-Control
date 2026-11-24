/** Piezas pequeñas de Grupo → Insumos (formato de montos, fechas y edad del precio). */

import type { TonoEdad } from "@/lib/insumos-ficha";

export const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
export const solesRedondo = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

export const TONO_EDAD: Record<TonoEdad, "verde" | "ambar" | "rojo"> = { reciente: "verde", medio: "ambar", viejo: "rojo" };

export function textoEdad(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias === 1) return "hace 1 día";
  if (dias < 60) return `hace ${dias} días`;
  return `hace ${Math.round(dias / 30)} meses`;
}
