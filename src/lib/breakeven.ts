/**
 * Punto de equilibrio del mes · MOTOR (lógica pura).
 *
 * Metodología clásica de gestión, con los datos que el sistema ya
 * clasifica (decisión contable de Jahnn en Configuración):
 *
 *   margen de contribución = 1 − (costos variables / ventas)
 *   punto de equilibrio    = costos fijos / margen de contribución
 *
 * Honestidad del dato (filosofía del Centro de Comando):
 * - Solo cuenta lo CLASIFICADO: si hay egresos "sin clasificar", el
 *   resultado se marca con aviso — no se adivina si son fijos o variables.
 * - No-operativos quedan fuera (misma exclusión canónica del EBITDA).
 * - Sin ventas o sin fijos clasificados → "sin_datos", nunca un número
 *   inventado.
 *
 * MES EN CURSO — la trampa a evitar (detectada por Jahnn en el piloto):
 * los fijos REGISTRADOS a la fecha son solo una fracción de los fijos
 * reales del mes (alquiler y planillas se pagan en fechas puntuales).
 * Compararse contra ellos da un equilibrio ridículamente bajo y un
 * "superado" falso. Por eso, en el mes en curso el equilibrio se calcula
 * con una REFERENCIA de meses cerrados (promedio de fijos mensuales y %
 * de variables sobre ventas) y solo las VENTAS son las del mes a la
 * fecha. El ritmo diario real proyecta el cierre y el día de cruce.
 */

export type BreakevenReference = {
  /** Fijos mensuales de referencia (promedio de los meses usados). */
  fijos: number;
  /** Costos variables como fracción de ventas en esos meses (0-1). */
  varRatio: number;
  /** Meses cerrados que alimentan la referencia (ej. ["2026-04","2026-05","2026-06"]). */
  monthsUsed: string[];
};

export type BreakevenInput = {
  /** Costos fijos del mes (clasificados). */
  fijos: number;
  /** Costos variables del mes (clasificados). */
  variables: number;
  /** Egresos operativos sin clasificar (aviso, no entran a la fórmula). */
  sinClasificar: number;
  /** Ventas del mes a la fecha (Byte). */
  ventas: number;
  /** Días transcurridos con posibilidad de venta (mes en curso) o días del mes (cerrado). */
  daysElapsed: number;
  daysInMonth: number;
  /**
   * MES EN CURSO: referencia de meses cerrados. Si viene, la fórmula usa
   * ESTOS fijos y ratio (no los registrados a la fecha). Mes cerrado:
   * omitir (se usan los reales del mes).
   */
  reference?: BreakevenReference | null;
};

export type BreakevenEstado = "superado" | "en_camino" | "en_riesgo" | "sin_datos";

export type BreakevenResult = {
  fijos: number;
  variables: number;
  sinClasificar: number;
  ventas: number;
  /** Costos variables como fracción de ventas (0-1); null sin ventas. */
  varRatio: number | null;
  /** Margen de contribución (1 − varRatio); null sin ventas. */
  contributionMargin: number | null;
  /** Ventas del mes necesarias para cubrir todos los costos. */
  breakEven: number | null;
  /** % del punto de equilibrio ya cubierto con las ventas a la fecha. */
  avancePct: number | null;
  /** Ventas proyectadas al cierre con el ritmo actual. */
  ventasProyectadas: number | null;
  /** Día del mes en que se cruzaría el equilibrio al ritmo actual (null = no se cruza este mes). */
  diaEstimadoCruce: number | null;
  estado: BreakevenEstado;
  /** Meses cerrados usados como referencia (solo mes en curso). */
  referenceMonths: string[] | null;
  /** Avisos de calidad del dato (sin clasificar, margen negativo…). */
  warnings: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeBreakeven(input: BreakevenInput): BreakevenResult {
  const { sinClasificar, ventas, daysElapsed, daysInMonth, reference } = input;
  const warnings: string[] = [];

  if (sinClasificar > 0) {
    warnings.push(
      `Hay S/${r2(sinClasificar).toFixed(2)} de egresos sin clasificar como fijo/variable — no entran a la fórmula. Asígnalos en Configuración para afinar el punto de equilibrio.`,
    );
  }

  // Base de la fórmula: con referencia (mes en curso) se usan los fijos
  // mensuales y el ratio históricos; sin ella (mes cerrado), los reales.
  const fijosBase = reference ? reference.fijos : input.fijos;

  const base: Omit<BreakevenResult, "estado"> = {
    fijos: r2(fijosBase),
    variables: r2(input.variables),
    sinClasificar: r2(sinClasificar),
    ventas: r2(ventas),
    varRatio: null,
    contributionMargin: null,
    breakEven: null,
    avancePct: null,
    ventasProyectadas: null,
    diaEstimadoCruce: null,
    referenceMonths: reference?.monthsUsed ?? null,
    warnings,
  };

  if (ventas <= 0 || fijosBase <= 0) {
    if (fijosBase <= 0 && ventas > 0) {
      warnings.push(
        reference
          ? "La referencia histórica no tiene costos fijos clasificados — clasifica las categorías en Configuración."
          : "No hay costos fijos clasificados este mes — sin ellos no existe punto de equilibrio que calcular.",
      );
    }
    return { ...base, estado: "sin_datos" };
  }

  const varRatio = reference ? reference.varRatio : input.variables / ventas;
  const contributionMargin = 1 - varRatio;
  base.varRatio = Math.round(varRatio * 10000) / 10000;
  base.contributionMargin = Math.round(contributionMargin * 10000) / 10000;

  if (contributionMargin <= 0) {
    warnings.push(
      reference
        ? "En los meses de referencia, los costos variables superaron a las ventas: cada sol vendido pierde plata. El problema es de margen, no de volumen."
        : "Los costos variables superan a las ventas: cada sol vendido pierde plata. No hay punto de equilibrio alcanzable — el problema es de margen, no de volumen.",
    );
    return { ...base, estado: "en_riesgo" };
  }

  const breakEven = r2(fijosBase / contributionMargin);
  base.breakEven = breakEven;
  base.avancePct = Math.round((ventas / breakEven) * 1000) / 10;

  const dailyRate = daysElapsed > 0 ? ventas / daysElapsed : 0;
  base.ventasProyectadas = dailyRate > 0 ? r2(dailyRate * daysInMonth) : null;
  if (dailyRate > 0) {
    const dia = Math.ceil(breakEven / dailyRate);
    base.diaEstimadoCruce = dia <= daysInMonth ? dia : null;
  }

  const estado: BreakevenEstado =
    ventas >= breakEven
      ? "superado"
      : base.ventasProyectadas !== null && base.ventasProyectadas >= breakEven
        ? "en_camino"
        : "en_riesgo";

  return { ...base, estado };
}
