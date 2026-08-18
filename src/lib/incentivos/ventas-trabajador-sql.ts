/**
 * La consulta de Ventas por Trabajador, en UN solo lugar.
 *
 * Encontrado el 18-ago-2026 revisando la rutina de los administradores.
 *
 * ─── Qué estaba mal ───
 *
 * Cada carga del reporte se guardaba con su rango, y al importar solo
 * se borraba el rango IDÉNTICO. Como los administradores suben el
 * acumulado del 1 a hoy cada sábado, la tabla se fue llenando de
 * períodos que se pisan entre sí:
 *
 *   Centro julio: 01→12, 01→18, 01→25, 01→31, 01→ago-01  (cinco)
 *
 * Las tres pantallas que lo leen se defendían tomando solo las filas de
 * la ÚLTIMA carga (`imported_at = MAX(...)`). Eso evitaba el doble
 * conteo, pero la regla era "la última gana", no "la más completa" — y
 * eso solo funciona si la última carga resulta ser también la mayor.
 *
 * En Fonavi julio funcionó de casualidad: las semanas se subieron antes
 * que el mes completo. Al revés, el ranking del mes habría mostrado
 * S/9,069 en vez de S/35,611 — 3.9x menos, sin avisar a nadie. Y bastaba
 * con que alguien recargara una semana tarde para corregir algo: agosto
 * de Fonavi habría caído de S/19,062 a S/6,663.
 *
 * ─── La regla, la misma que la de rotación ───
 *
 * Al importar, una carga nueva REEMPLAZA a las que pisa. Al leer, se
 * SUMAN los períodos que quedan (que por construcción no se pisan).
 * Así el orden de carga deja de importar y no hay forma de contar dos
 * veces.
 *
 * Se saca a este archivo porque la consulta estaba copiada en tres
 * (incentives, group-incentives, mejor-vendedor) — exactamente la
 * situación que causó el incidente del saldo BCP: tres copias, una sin
 * el candado.
 */

export type EtiquetaSQL<T> = (s: TemplateStringsArray, ...v: unknown[]) => T;

/**
 * Trae las filas CRUDAS de la ventana, con su rango y su fecha de carga.
 * Los solapes se resuelven en JS (ver ventas-trabajador.ts) para no
 * tener que borrar nada de la tabla: la administradora de Centro hace
 * seguimiento diario y los números no pueden moverse de un día a otro.
 */
export function filasVentasTrabajador<T>(
  sql: EtiquetaSQL<T>,
  bId: number,
  desde: string,
  hasta: string,
): T {
  return sql`
    SELECT nombre, mesas, total::float AS total,
           period_start::text AS "periodStart",
           period_end::text AS "periodEnd",
           imported_at::text AS "importedAt"
    FROM worker_period_sales
    WHERE business_id = ${bId}
      AND period_start >= ${desde} AND period_start <= ${hasta}
  `;
}

/**
 * Los períodos que una carga nueva PISA y hay que borrar antes de
 * insertar. Antes se borraba solo el rango idéntico, que es lo que
 * dejaba entrar los solapes.
 */
export function borrarPeriodosQuePisa<T>(
  sql: EtiquetaSQL<T>,
  bId: number,
  desde: string,
  hasta: string,
): T {
  return sql`
    DELETE FROM worker_period_sales
    WHERE business_id = ${bId}
      AND period_start <= ${hasta}::date AND ${desde}::date <= period_end
  `;
}
