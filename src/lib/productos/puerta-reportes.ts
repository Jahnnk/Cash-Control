/**
 * Una sola puerta por reporte de Byte (decisión de Jahnn, 24-oct-2026): el reporte de ventas se sube
 * en el Dashboard de Grupo (es la plata del día a día, junto con el Excel de finanzas) y los de mayor
 * y menor rotación en Grupo → Productos (deciden la carta). Si se suelta un reporte donde no va, no
 * se sube: se dice adónde llevarlo. Lógica pura.
 */

import type { TipoReporteByte } from "./reportes-direccion";

export const TITULO_TIPO: Record<TipoReporteByte, string> = { ventas: "Reporte de ventas", mayor: "Productos con mayor rotación", menor: "Productos con menor rotación" };

/** Dónde se sube cada reporte: el de ventas en el Dashboard de Grupo, los de rotación en Grupo → Productos. */
const PUERTA: Record<TipoReporteByte, { href: string; lugar: string }> = {
  ventas: { href: "/grupo/dashboard", lugar: "el Dashboard" },
  mayor: { href: "/grupo/productos", lugar: "Productos" },
  menor: { href: "/grupo/productos", lugar: "Productos" },
};

/** El título de la ventana según los reportes que acepta. */
export function tituloVentana(tipos: TipoReporteByte[]): string {
  if (tipos.length === 1 && tipos[0] === "ventas") return "Subir el reporte de ventas de Byte";
  if (tipos.every((t) => t !== "ventas")) return "Subir reportes de rotación de Byte";
  return "Subir reportes de Byte";
}

/** Si el reporte no se sube en este lugar, el aviso y adónde llevarlo (null = se sube aquí). */
export function otraPuerta(tipo: TipoReporteByte, tipos: TipoReporteByte[]): { error: string; href: string; lugar: string } | null {
  if (tipos.includes(tipo)) return null;
  const p = PUERTA[tipo];
  return { error: `Este archivo es «${TITULO_TIPO[tipo]}»: se sube en ${p.lugar}, no aquí. No se guardó.`, ...p };
}
