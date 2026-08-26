/**
 * Las ventas Byte de un mes. UNA sola copia de la cadena de fuentes.
 *
 * Había dos copias idénticas (breakeven.ts y product-sales-import.ts).
 * Copiar la cadena de fuentes es exactamente el error que produjo el
 * saldo de banco negativo — tres copias y solo una con la guarda.
 *
 * ─── Las tres fuentes ───
 *
 *   1. `byte_sales_daily`  — el reporte de ventas de Byte que se sube
 *                            cada semana (efectivo + yape/plin + POS).
 *   2. `daily_records`     — el cierre de caja diario (byte_total).
 *   3. `upselling_daily`   — el registro diario del administrador.
 *
 * Las tres miden LO MISMO: la venta del día. Comprobado en julio-2026
 * día por día, `byte_sales_daily` daba el 97.5% del registro del
 * administrador en Fonavi y el 99.0% en Centro. Esas diferencias son
 * ruido de redondeo, no metodologías distintas.
 *
 * ─── La regla: gana la fuente con MÁS DÍAS con venta ───
 *
 * Si las tres miden lo mismo, la mejor es la que cubre más días del
 * periodo. En empate manda el orden de arriba, que es el de preferencia.
 *
 * ─── Los dos casos reales que obligaron a esto (ago-2026) ───
 *
 * · ATELIER: una carga dejó 31 filas de agosto con total = 0, salvo una
 *   de S/117.52. La cadena original preguntaba "¿la suma es distinta de
 *   cero?" — y S/118 lo es, así que se quedaba ahí y nunca caía a las
 *   siguientes fuentes. El sistema creía que Atelier había vendido S/118
 *   en el mes cuando su administrador tenía 19 días por S/31,568.
 *
 * · FONAVI y CENTRO: la carga de agosto de `byte_sales_daily` entró SIN
 *   la columna POS (0 días con tarjeta en Fonavi, 7 en Centro; en julio
 *   eran 30 y 31). Por eso agosto daba el 59% y el 68% del registro del
 *   administrador. El sistema decía que Fonavi vendió S/13,523 cuando el
 *   reporte de Byte de Jahnn decía S/22,857.77 del 1 al 18 — y ese es
 *   exactamente el número que tiene el registro del administrador.
 *
 * Con la regla de "más días", agosto usa el registro del administrador
 * en las tres sedes (24, 23 y 19 días contra 18, 18 y 1), y julio y los
 * meses anteriores siguen usando el reporte de Byte, que ahí es el más
 * completo. Ninguna cifra sana se mueve.
 *
 * ─── Lo que esta regla NO arregla ───
 *
 * Que a la carga de agosto le falte la venta con tarjeta. Eso se corrige
 * volviendo a subir el reporte de ventas de Byte de agosto; mientras
 * tanto, la regla evita que el número incompleto se use como si fuera el
 * total del mes.
 */
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
    return { total: 0, fuente: null, ultimoDia: null, fuentes, descartadas: [] };
  }

  // Gana la que más días cubra. `conDatos` viene en orden de
  // preferencia y `find` devuelve el PRIMERO, así que un empate lo
  // resuelve ese orden sin necesidad de desempatar aparte.
  const maxDias = Math.max(...conDatos.map((f) => f.dias));
  const mejor = conDatos.find((f) => f.dias === maxDias)!;

  return {
    total: mejor.total,
    fuente: mejor.fuente,
    ultimoDia: mejor.ultimoDia ?? null,
    fuentes,
    // Las que quedaron fuera teniendo datos: sirve para explicar en
    // pantalla por qué el número no salió de la fuente de siempre.
    descartadas: conDatos.filter((f) => f !== mejor).map((f) => f.fuente),
  };
}
