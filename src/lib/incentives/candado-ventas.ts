/**
 * Candado de ventas del bono · MOTOR (lógica pura).
 *
 * ─── De dónde sale ───
 *
 * Reunión de socios del 14-sep-2026. El bono por ticket promedio premia
 * una sola palanca de la venta (cuánto gasta cada cliente). Kelly
 * cuestionaba pagar bono en una sede que no gana plata, y tenía razón:
 * el bono sale de la utilidad nueva, y sin utilidad no hay qué repartir.
 *
 * Decisiones de Jahnn, vigentes desde octubre 2026:
 *   · Requisito para cobrar: las ventas del mes cubren el punto de
 *     equilibrio. Todo o nada.
 *   · Se elimina el piso de tráfico: las ventas ya son personas × ticket;
 *     si el ticket sube y la sede cubre sus costos, el tráfico no se cayó.
 *
 * ─── Por qué el punto de equilibrio de REFERENCIA y congelado ───
 *
 * El punto de equilibrio del propio mes es una lotería: el Excel registra
 * la compra el día que se paga, y Fonavi pasó de S/22,611 (mayo) a S/50,158
 * (junio) vendiendo casi lo mismo. Además, a mitad de mes todavía no se
 * pagaron alquiler ni planilla. Por eso la meta sale de hasta 6 meses
 * CERRADOS y completos anteriores (la misma referencia del punto de
 * equilibrio del dashboard; ver `buildReference` en actions/breakeven.ts) y se CONGELA el primer lunes del mes, cuando ya llegó el
 * Excel de Kelly del mes anterior. El equipo conoce su meta desde el
 * inicio y nadie se la mueve después.
 *
 * Esto es un CANDADO, no una meta más: no suma dinero al bono, solo
 * impide pagarlo cuando la sede no cubre sus costos.
 */

export type EntradaCandadoVentas = {
  /** Punto de equilibrio de referencia. null = no se pudo calcular. */
  meta: number | null;
  /** true = todavía no llega el primer lunes: la meta puede ajustarse. */
  provisional: boolean;
  /** Meses cerrados que alimentan la meta (auditoría). */
  mesesReferencia: string[];
  /** Ventas del mes a la fecha (misma fuente que el punto de equilibrio). */
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
