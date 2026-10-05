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

import type { CeldaCobertura, PeriodoCargado } from "./cobertura-rotacion";
import type { Rango } from "./cobertura-datos";

/**
 * «revisar» = el archivo SÍ está guardado y cubre el periodo, pero su total no cuadra
 * con las ventas: no falta subir nada, hay que mirar el reporte en Byte. No es «falta».
 */
export type EstadoUnReporte = "completo" | "parcial" | "vacio" | "revisar";
export type DetalleReporte = { estado: EstadoUnReporte; texto: string };
export type TresReportes = { ventas: DetalleReporte; mayor: DetalleReporte; menor: DetalleReporte };
export type TipoReporte = keyof TresReportes;

/** Ventas de dirección de una sede en un mes (primer y último día con venta, cuántos días y cuánto sumaron). */
export type VentasDelMes = { businessId: number; month: string; desde: string; hasta: string; dias: number; total: number };

/**
 * Cuánto puede diferir el total del reporte de productos del total de ventas del mes para darlo
 * por bueno. En los meses buenos de las cafeterías el reporte de productos suma entre +1% y +4%
 * más que las ventas (y +12% en abril); una carga a medias (−24%) o duplicada (+123%) queda lejos.
 */
export const TOLERANCIA_PRODUCTOS_VS_VENTAS = 0.15;

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

/**
 * Mayor rotación. Cuenta como completo solo si:
 *   1. lo subió gerencia (dirección) y cubre el mes —lo que subió la sede no basta:
 *      dice «solo de la sede»—, y
 *   2. en un mes cerrado, su total cuadra con el reporte de ventas del mismo mes
 *      (tolerancia ±15%); si no, avisa cuánto se aparta.
 */
export function estadoMayor(c: CeldaCobertura, periodos: PeriodoCargado[], month: string, hoy: string, ventasTotal: number | null = null): DetalleReporte {
  if (c.estado === "vacio") return { estado: "vacio", texto: "sin subir" };
  const dir = periodos.filter((p) => p.origen === "direccion");
  if (dir.length === 0) return { estado: "parcial", texto: "solo de la sede, falta el tuyo" };

  // ¿Cubre el mes lo de gerencia? (junta sus períodos)
  const orden = dir.map((p) => ({ desde: p.desde, hasta: p.hasta })).sort((a, b) => a.desde.localeCompare(b.desde));
  const desde = orden[0].desde;
  const hasta = orden.reduce((m, r) => (r.hasta > m ? r.hasta : m), orden[0].hasta);
  const huecos = orden.slice(1).some((r, i) => dia(r.desde) > dia(orden.slice(0, i + 1).reduce((m, x) => (x.hasta > m ? x.hasta : m), orden[0].hasta)) + 1);
  const cobertura = contra(desde, hasta, month, hoy);
  if (cobertura.estado !== "completo" || huecos) {
    return { estado: "parcial", texto: huecos ? "tuyo con huecos" : `tuyo ${cobertura.texto}` };
  }

  // Cruce con las ventas del mes (solo meses cerrados: en el en curso los totales no llegan al mismo día).
  const enCurso = hoy.slice(0, 7) === month;
  if (!enCurso && ventasTotal !== null && ventasTotal > 0) {
    const dif = (c.ventas - ventasTotal) / ventasTotal;
    if (Math.abs(dif) > TOLERANCIA_PRODUCTOS_VS_VENTAS) {
      return { estado: "revisar", texto: `no cuadra con ventas (${dif > 0 ? "+" : "−"}${Math.round(Math.abs(dif) * 100)}%)` };
    }
  }
  return { estado: "completo", texto: enCurso ? "tuyo, al día" : "tuyo, mes completo" };
}

export const NOMBRE_REPORTE: Record<TipoReporte, string> = { ventas: "Reporte de ventas", mayor: "Mayor rotación", menor: "Menor rotación" };

export function tresReportes(args: { celda: CeldaCobertura; periodos: PeriodoCargado[]; ventas: VentasDelMes | undefined; menor: Rango[]; month: string; hoy: string }): TresReportes {
  return {
    ventas: estadoVentas(args.ventas, args.month, args.hoy),
    mayor: estadoMayor(args.celda, args.periodos, args.month, args.hoy, args.ventas?.total ?? null),
    menor: estadoMenor(args.menor, args.month, args.hoy),
  };
}

/** Qué reportes faltan por subir (vacíos o incompletos) en un mes. Un «revisar» no falta: ya está guardado. */
export function reportesQueFaltan(t: TresReportes): TipoReporte[] {
  return (Object.keys(t) as TipoReporte[]).filter((k) => t[k].estado === "vacio" || t[k].estado === "parcial");
}

/** Reportes ya guardados cuyo total no cuadra con las ventas: no hay que subir nada, hay que revisar el archivo en Byte. */
export function reportesPorRevisar(t: TresReportes): TipoReporte[] {
  return (Object.keys(t) as TipoReporte[]).filter((k) => t[k].estado === "revisar");
}

export const todoCompleto = (t: TresReportes) => (Object.keys(t) as TipoReporte[]).every((k) => t[k].estado === "completo");
