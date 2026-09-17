/**
 * Meta de ventas del bono · MOTOR (lógica pura).
 *
 * ─── De dónde sale ───
 *
 * Reunión de socios del 14-sep-2026: desde octubre 2026 el bono tiene un
 * requisito de ventas del mes, todo o nada, y se elimina el piso de
 * tráfico (las ventas ya son personas × ticket).
 *
 * ─── Por qué el PROMEDIO de los últimos 3 meses y no el punto de equilibrio ───
 *
 * Primero la meta fue el punto de equilibrio de referencia. Kelly lo
 * cuestionó y Jahnn le dio la razón (17-sep-2026): el punto de equilibrio
 * dice cuánto hay que vender para no perder, no cuánto vende la sede.
 * Fonavi y Centro ya venden unos S/10,000 más que su equilibrio (jun–ago
 * 2026: Fonavi ≈ S/37,200 contra S/27,600; Centro ≈ S/40,800 contra
 * ≈ S/29,000): con esa meta el bono se cobraba vendiendo mucho menos que
 * hoy. Decisión:
 *   · META = promedio del total vendido (Byte) de los últimos 3 meses
 *     cerrados y completos. Sin porcentaje de crecimiento: agosto fue un
 *     mes alto y la meta ya lo arrastra.
 *   · El punto de equilibrio queda como PISO de alarma para dirección
 *     (dashboard, reportes), fuera del bono.
 *
 * Se CONGELA el primer lunes del mes, cuando ya está completo el mes
 * anterior: el equipo conoce su meta desde el inicio y nadie se la mueve.
 * Un mes con menos del 90% de días con venta no entra (quedaría una meta
 * baja por falta de carga, no por el negocio); se toma el anterior.
 */

export type EntradaCandadoVentas = {
  /** Meta de ventas del mes (promedio de 3 meses). null = no se pudo calcular. */
  meta: number | null;
  /** true = todavía no llega el primer lunes: la meta puede ajustarse. */
  provisional: boolean;
  /**
   * true = ese mes la meta ES requisito del bono (y se congela).
   * false = solo informativa: el administrador ve cómo va su sede contra
   * la meta, pero el bono no depende de eso ese mes.
   */
  vinculante: boolean;
  /** Meses cerrados que alimentan la meta (auditoría). */
  mesesReferencia: string[];
  /** Ventas del mes a la fecha (el mismo total vendido que alimenta la meta). */
  ventas: number;
  /** Días con venta registrada. */
  diasConVenta: number;
};

export type EstadoCandadoVentas = EntradaCandadoVentas & {
  /** Ventas proyectadas al cierre al ritmo actual. null sin días. */
  proyeccion: number | null;
  /** % de la meta cubierto por las ventas a la fecha. */
  avancePct: number | null;
  /** Cuánto falta vender para cubrir la meta. */
  falta: number | null;
  /** Mes cerrado: ¿cubrió? Mes en curso: ¿ya cubrió con lo vendido? */
  cumple: boolean;
  /** Mes en curso: ¿la proyección alcanza la meta? */
  enCamino: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Primer lunes de un mes YYYY-MM, en YYYY-MM-DD. */
export function primerLunesDelMes(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  const falta = (1 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(1 + falta);
  return d.toISOString().slice(0, 10);
}

/** ¿Ya corresponde congelar la meta de ese mes? */
export function tocaCongelar(month: string, todayISO: string): boolean {
  return todayISO >= primerLunesDelMes(month);
}

/** La meta se redondea hacia ARRIBA a los S/100: se comunica como "S/31,600", no "S/31,523.47". */
export function redondearMeta(n: number): number {
  return Math.ceil(n / 100) * 100;
}

/** Meses cerrados que entran al promedio, y cuántos se miran hacia atrás para encontrarlos. */
export const MESES_PROMEDIO_META = 3;
export const MESES_A_BUSCAR_META = 6;
/** Fracción mínima de días con venta para que un mes cuente como completo. */
export const COBERTURA_MINIMA_MES = 0.9;

export type VentaMesCerrado = { month: string; total: number; diasConVenta: number; diasDelMes: number };

/**
 * Meta = promedio de los últimos `MESES_PROMEDIO_META` meses cerrados y
 * completos, redondeado hacia arriba a S/100. null si no hay ninguno.
 */
export function metaPorPromedioDeVentas(
  meses: VentaMesCerrado[],
): { meta: number; exacta: number; mesesReferencia: string[] } | null {
  const usados = [...meses]
    .sort((a, b) => b.month.localeCompare(a.month))
    .filter((m) => m.total > 0 && m.diasConVenta >= m.diasDelMes * COBERTURA_MINIMA_MES)
    .slice(0, MESES_PROMEDIO_META);
  if (usados.length === 0) return null;
  const exacta = r2(usados.reduce((t, m) => t + m.total, 0) / usados.length);
  return { meta: redondearMeta(exacta), exacta, mesesReferencia: usados.map((m) => m.month).sort() };
}

export function evaluarCandadoVentas(
  e: EntradaCandadoVentas,
  diasDelMes: number,
): EstadoCandadoVentas {
  const { meta, ventas, diasConVenta } = e;
  const proyeccion = diasConVenta > 0 ? r2((ventas / diasConVenta) * diasDelMes) : null;
  if (meta === null || meta <= 0) {
    return { ...e, proyeccion, avancePct: null, falta: null, cumple: false, enCamino: false };
  }
  return {
    ...e,
    proyeccion,
    avancePct: Math.round((ventas / meta) * 1000) / 10,
    falta: r2(Math.max(0, meta - ventas)),
    cumple: ventas >= meta,
    enCamino: proyeccion !== null && proyeccion >= meta,
  };
}
