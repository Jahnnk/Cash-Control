/**
 * Cuál de los tres reportes de Byte falta, por sede y mes (puro).
 *
 * Pedido de Jahnn (4-oct-2026): «son 3 archivos por mes por sede; ¿hay manera de
 * saber cuál falta o está incompleto, para no subir los tres siempre?».
 *
 *   · Reporte de ventas    — venta de cada día (byte_ventas_direccion).
 *   · Mayor rotación       — ventas por producto del mes (product_period_sales; ver cobertura-rotacion.ts).
 *   · Menor rotación       — foto por sede de un rango de fechas (productos_menor_rotacion): un mes
 *                            «está» si el rango guardado lo cubre.
 *
 * Un mes está completo si el reporte empieza en los primeros días y llega a los
 * últimos (se toleran 3 días en el cierre: hay locales que no abren todos los días).
 * En el mes en curso, «el último día» es ayer.
 */

import type { CeldaCobertura } from "./cobertura-rotacion";
import type { Rango } from "./cobertura-datos";

export type EstadoUnReporte = "completo" | "parcial" | "vacio";
export type DetalleReporte = { estado: EstadoUnReporte; texto: string };
export type TresReportes = { ventas: DetalleReporte; mayor: DetalleReporte; menor: DetalleReporte };
export type TipoReporte = keyof TresReportes;

/** Ventas de dirección de una sede en un mes (primer y último día con venta, y cuántos días). */
export type VentasDelMes = { businessId: number; month: string; desde: string; hasta: string; dias: number };

export const TOLERANCIA_DIAS = 3;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const corta = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;
const dia = (f: string) => Date.parse(`${f}T12:00:00Z`) / 86_400_000;
const iso = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** Primer y último día que debería cubrir un reporte de ese mes (ayer, si el mes está en curso). */
export function limitesDelMes(month: string, hoy: string): { ini: string; fin: string } {
  const [y, m] = month.split("-").map(Number);
  const ini = `${month}-01`;
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const enCurso = hoy.slice(0, 7) === month;
  return { ini, fin: enCurso ? iso(dia(hoy) - 1) : ultimo };
}

function contra(desde: string, hasta: string, month: string, hoy: string): DetalleReporte {
  const { ini, fin } = limitesDelMes(month, hoy);
  if (fin < ini) return { estado: "completo", texto: "mes recién empieza" };
  const empiezaBien = dia(desde) <= dia(ini) + TOLERANCIA_DIAS;
  const llegaBien = dia(hasta) >= dia(fin) - TOLERANCIA_DIAS;
  if (empiezaBien && llegaBien) return { estado: "completo", texto: `${corta(desde)} → ${corta(hasta)}` };
  if (!empiezaBien && !llegaBien) return { estado: "parcial", texto: `${corta(desde)} → ${corta(hasta)}` };
  return { estado: "parcial", texto: llegaBien ? `empieza el ${corta(desde)}` : `llega al ${corta(hasta)}` };
}

export function estadoVentas(v: VentasDelMes | undefined, month: string, hoy: string): DetalleReporte {
  if (!v || v.dias === 0) return { estado: "vacio", texto: "sin subir" };
  return contra(v.desde, v.hasta, month, hoy);
}

export function estadoMenor(rangos: Rango[], month: string, hoy: string): DetalleReporte {
  const { ini, fin } = limitesDelMes(month, hoy);
  const cruzan = rangos.filter((r) => r.desde <= (fin < ini ? ini : fin) && r.hasta >= ini);
  if (cruzan.length === 0) return { estado: "vacio", texto: "sin subir" };
  // El que mejor cubre el mes (el más largo dentro del mes).
  const mejor = cruzan.slice().sort((a, b) => (dia(b.hasta) - dia(b.desde)) - (dia(a.hasta) - dia(a.desde)))[0];
  return contra(mejor.desde, mejor.hasta, month, hoy);
}

export function estadoMayor(c: CeldaCobertura): DetalleReporte {
  if (c.estado === "completo") return { estado: "completo", texto: "mes completo" };
  if (c.estado === "en-curso") return { estado: "completo", texto: "al día" };
  if (c.estado === "parcial") return { estado: "parcial", texto: c.faltan ? `faltan ${c.faltan}` : `${c.diasCubiertos} de ${c.diasMes} días` };
  return { estado: "vacio", texto: "sin subir" };
}

export const NOMBRE_REPORTE: Record<TipoReporte, string> = { ventas: "Reporte de ventas", mayor: "Mayor rotación", menor: "Menor rotación" };

export function tresReportes(args: { celda: CeldaCobertura; ventas: VentasDelMes | undefined; menor: Rango[]; month: string; hoy: string }): TresReportes {
  return { ventas: estadoVentas(args.ventas, args.month, args.hoy), mayor: estadoMayor(args.celda), menor: estadoMenor(args.menor, args.month, args.hoy) };
}

/** Qué reportes faltan (vacíos o incompletos) en un mes. */
export function reportesQueFaltan(t: TresReportes): TipoReporte[] {
  return (Object.keys(t) as TipoReporte[]).filter((k) => t[k].estado !== "completo");
}

export const todoCompleto = (t: TresReportes) => reportesQueFaltan(t).length === 0;
