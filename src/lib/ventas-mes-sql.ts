/**
 * Las ventas Byte de un mes. UNA sola copia de la cadena de fuentes.
 *
 * Había dos copias idénticas (breakeven.ts y product-sales-import.ts).
 * Copiar la cadena de fuentes es exactamente el error que produjo el
 * saldo de banco negativo — tres copias y solo una con la guarda.
 *
 * ─── Las tres fuentes, en orden de preferencia ───
 *
 *   1. `byte_sales_daily`  — el reporte de ventas de Byte que se sube
 *                            cada semana. Es la fuente oficial.
 *   2. `daily_records`     — el cierre de caja diario (byte_total).
 *   3. `upselling_daily`   — el registro que llena el administrador.
 *
 * OJO, y esto es lo importante: NO miden exactamente lo mismo. En los
 * mismos días de agosto, el registro del administrador de Fonavi venía
 * entre S/194 y S/572 por encima del reporte de Byte, todos los días —
 * porque incluye delivery y consumo del personal. Por eso el orden es
 * una PREFERENCIA y no un "el más grande gana": mezclar las fuentes
 * inflaría la venta.
 *
 * ─── El bug que motivó este archivo (26-ago-2026) ───
 *
 * Una carga dejó en `byte_sales_daily` 31 filas de Atelier de agosto con
 * total = 0, salvo una de S/117.52. La cadena original preguntaba
 * "¿suma distinto de cero?" — y S/118 es distinto de cero, así que se
 * quedaba ahí y nunca caía a las siguientes fuentes. El sistema creía
 * que Atelier había vendido S/118 en el mes cuando su administrador
 * tenía 19 días registrados por S/31,568. El punto de equilibrio y el
 * Executive Brief de dirección mostraban esa cifra.
 *
 * ─── La regla que lo arregla, y por qué es esta ───
 *
 * Una fuente se descarta cuando OTRA tiene al menos el DOBLE de días con
 * venta: eso ya no es "estar un poco atrasada", es estar rota o vacía.
 *
 * La regla obvia —"gana la que tenga más días"— se probó y se descartó:
 * en agosto habría cambiado también Fonavi (de S/13,523 a S/29,412) y
 * Centro (de S/20,496 a S/37,305), porque el reporte de Byte va hasta el
 * 18 y el registro del admin hasta el 24. Ahí la primera fuente no está
 * rota, solo menos actualizada — y como miden cosas distintas, cambiarla
 * habría inflado las ventas de dos sedes que estaban bien.
 *
 * Con el factor de 2×, agosto queda así:
 *   Atelier  byte 1 día vs admin 19  → 19 ≥ 2   → se descarta byte ✓
 *   Fonavi   byte 18 días vs admin 24 → 24 < 36 → se queda byte ✓
 *   Centro   byte 18 días vs admin 23 → 23 < 36 → se queda byte ✓
 *
 * Es decir: arregla el caso roto y no toca ningún número sano.
 */

/** Cuántas veces más días necesita otra fuente para descartar a la de arriba. */
export const FACTOR_DESCARTE = 2;

export type FuenteVenta = {
  /** Cuál de las tres es, para poder decir de dónde salió el número. */
  fuente: "byte" | "cierre" | "registro";
  total: number;
  /** Días con venta > 0 en el periodo. */
  dias: number;
  /**
   * Último día con venta (YYYY-MM-DD). Es lo que evita la conclusión
   * equivocada en el mes en curso: el reporte de Byte de Fonavi llegaba
   * al 18-ago y su punto de equilibrio se veía "en riesgo" simplemente
   * porque faltaban 8 días de venta por cargar, no porque el negocio
   * fuera mal. Quien mira el número tiene que saber hasta cuándo mide.
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

  const maxDias = Math.max(...conDatos.map((f) => f.dias));
  const descartadas: FuenteVenta["fuente"][] = [];

  for (const f of conDatos) {
    // Otra fuente tiene el doble de días o más: esta está rota o vacía.
    if (maxDias >= f.dias * FACTOR_DESCARTE) {
      descartadas.push(f.fuente);
      continue;
    }
    // La primera que sobrevive gana: el orden es la preferencia.
    return { total: f.total, fuente: f.fuente, ultimoDia: f.ultimoDia ?? null, fuentes, descartadas };
  }

  // Todas descartadas es imposible (la de maxDias nunca se descarta a sí
  // misma), pero si pasara, mejor la más completa que un cero mudo.
  const mejor = conDatos.find((f) => f.dias === maxDias)!;
  return { total: mejor.total, fuente: mejor.fuente, ultimoDia: mejor.ultimoDia ?? null, fuentes, descartadas };
}
