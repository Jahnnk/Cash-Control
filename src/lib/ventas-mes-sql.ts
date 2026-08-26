/**
 * Las ventas Byte de un mes. UNA sola copia de la cadena de fuentes.
 *
 * Había dos copias idénticas (breakeven.ts y product-sales-import.ts).
 * Copiar la cadena de fuentes es exactamente el error que produjo el
 * saldo de banco negativo — tres copias y solo una con la guarda.
 *
 * ─── Las tres fuentes ───
 *
 *   1. `byte_sales_daily`  — el reporte de ventas de Byte, que sale de
 *                            la pestaña "Control de VTAS" del Excel
 *                            mensual (efectivo + yape/plin + POS).
 *   2. `daily_records`     — el cierre de caja diario (byte_total).
 *   3. `upselling_daily`   — el registro diario del administrador.
 *
 * ─── El hecho del que sale todo lo demás ───
 *
 * Las tres miden LO MISMO: la venta del día. Comprobado en julio-2026
 * sobre los mismos días, `byte_sales_daily` daba el 97.5% del registro
 * del administrador en Fonavi y el 99.0% en Centro. Diferencias de ese
 * tamaño son redondeo, no metodologías distintas.
 *
 * Eso tiene una consecuencia fuerte: con los MISMOS días cargados,
 * ninguna fuente puede reportar de más. Si una reporta bastante MENOS
 * que otra, es porque perdió algo — no porque mida distinto.
 *
 * ─── La regla, en dos pasos ───
 *
 *   1. Se descartan las fuentes que cubren pocos días frente a la mejor
 *      (menos del 90% de sus días): están atrasadas o vacías.
 *   2. Entre las que quedan, gana la de MAYOR total: con la misma
 *      cobertura, la que reporta menos es la que perdió componentes.
 *
 * ─── Los casos reales que obligaron a cada paso (ago-2026) ───
 *
 * · Paso 1 · ATELIER: una carga dejó las filas de agosto en total = 0
 *   salvo una de S/117.52. El sistema creía que Atelier había vendido
 *   S/118 en el mes cuando su administrador tenía 19 días registrados
 *   por S/31,568. Con 1 día contra 19, esa fuente se descarta.
 *
 * · Paso 2 · FONAVI: la carga de agosto entró SIN la columna POS (0 días
 *   con tarjeta; en julio eran 30). Sobre los MISMOS 25 días daba
 *   S/18,790 contra S/30,371 del registro del administrador — el 61.9%.
 *   Como ambas cubren los mismos días, el paso 1 no la descartaba y el
 *   orden de preferencia se quedaba con la incompleta. Gana la mayor.
 *
 * Verificado contra todas las combinaciones de sede × mes de abril a
 * agosto: en julio y antes gana el reporte de Byte (que ahí es el más
 * completo) y ninguna cifra sana se mueve; en agosto gana el registro
 * del administrador en las tres sedes.
 *
 * ─── Lo que esta regla NO arregla ───
 *
 * Que a la carga de agosto le falte la venta con tarjeta. Eso se corrige
 * volviendo a subir el Excel del mes con la pestaña "Control de VTAS"
 * completa; mientras tanto, la regla evita que el número incompleto se
 * use como si fuera el total del mes.
 */

/**
 * Qué fracción de los días de la mejor fuente hay que cubrir para
 * competir con ella. Por debajo, la fuente está atrasada o rota y no
 * entra a la comparación por monto.
 */
export const COBERTURA_COMPARABLE = 0.9;
export type FuenteVenta = {
  /** Cuál de las tres es, para poder decir de dónde salió el número. */
  fuente: "byte" | "cierre" | "registro";
  total: number;
  /** Días con venta > 0 en el periodo. */
  dias: number;
  /**
   * Último día con venta (YYYY-MM-DD). Evita la conclusión equivocada en
   * el mes en curso: una sede cuyas ventas llegan al día 18 cuando el
   * mes va por el 26 se ve "en riesgo" por días sin cargar, no por
   * vender poco. Quien mira el número tiene que saber hasta cuándo mide.
   */
  ultimoDia?: string | null;
};

export type VentasMes = {
  total: number;
  fuente: FuenteVenta["fuente"] | null;
  /**
   * Días con venta de la fuente elegida. Sirve para saber si el mes está
   * COMPLETO — un mes a medias no puede servir de referencia histórica
   * (ver `buildReference` en actions/breakeven.ts).
   */
  dias: number;
  /** Hasta qué día llega el número elegido. null = sin datos. */
  ultimoDia: string | null;
  /** Las tres, para diagnóstico y para explicarlo en pantalla. */
  fuentes: FuenteVenta[];
  /** Fuentes descartadas por estar claramente incompletas. */
  descartadas: FuenteVenta["fuente"][];
};

/**
 * Elige la fuente buena entre las tres. Puro: el SQL vive en la action,
 * la decisión vive acá y se puede probar.
 *
 * @param fuentes en ORDEN DE PREFERENCIA (byte, cierre, registro).
 */
export function elegirFuenteVentas(fuentes: FuenteVenta[]): VentasMes {
  const conDatos = fuentes.filter((f) => f.dias > 0);
  if (conDatos.length === 0) {
    return { total: 0, fuente: null, dias: 0, ultimoDia: null, fuentes, descartadas: [] };
  }

  // Paso 1: solo compiten las que cubren una cantidad de días parecida
  // a la mejor. Una fuente con 1 día no puede opinar frente a una con 19.
  const maxDias = Math.max(...conDatos.map((f) => f.dias));
  const comparables = conDatos.filter((f) => f.dias >= maxDias * COBERTURA_COMPARABLE);

  // Paso 2: entre esas, gana la de mayor total. Como todas miden la
  // misma venta, con cobertura pareja la que reporta menos es la que
  // perdió componentes (una columna, un método de pago).
  //
  // `reduce` se queda con la PRIMERA en caso de empate exacto, y
  // `comparables` conserva el orden de preferencia — así un empate real
  // lo resuelve ese orden sin desempatar aparte.
  const mejor = comparables.reduce((a, b) => (b.total > a.total ? b : a));

  return {
    total: mejor.total,
    fuente: mejor.fuente,
    dias: mejor.dias,
    ultimoDia: mejor.ultimoDia ?? null,
    fuentes,
    // Las que quedaron fuera teniendo datos: sirve para explicar en
    // pantalla por qué el número no salió de la fuente de siempre.
    descartadas: conDatos.filter((f) => f !== mejor).map((f) => f.fuente),
  };
}
