/**
 * ¿El bono por ticket promedio se paga solo? · MOTOR (lógica pura).
 *
 * ─── De dónde sale esta lámina ───
 *
 * Reunión semanal del 8-sep-2026. Centro llegó al Nivel 2 en agosto y se
 * repartieron S/891. Kelly puso en duda la metodología: "Centro no ha
 * ganado lo suficiente para justificar los bonos". La duda era legítima
 * —el bono fue el 21% de la utilidad operativa del mes— y el sistema no
 * tenía cómo responderla: mostraba cuánto se paga, nunca qué se ganó.
 *
 * Esta lámina existe para que esa pregunta se responda con datos en la
 * reunión, no con opiniones.
 *
 * ─── La pregunta correcta ───
 *
 * "¿La sede ganó lo suficiente?" es la pregunta equivocada, porque
 * mezcla dos cosas. El bono NO se paga de la utilidad del mes: se paga
 * de la VENTA NUEVA que el mejor ticket generó. Si el ticket sube y el
 * tráfico se mantiene, esa venta extra no existía antes — y el equipo
 * se lleva una parte de lo que ayudó a crear.
 *
 * La pregunta correcta es: la utilidad EXTRA que trajo el ticket más
 * alto, ¿alcanza para pagar el bono y sobra?
 *
 * ─── Los tres candados de honestidad ───
 *
 * 1. **Se compara contra el mes anterior REAL, no contra la base del
 *    programa.** La base es una meta negociada; el mes anterior es lo
 *    que de verdad pasaba antes. Si el ticket ya venía subiendo solo,
 *    esta comparación lo castiga — y así debe ser.
 *
 * 2. **Se usa el tráfico del mes actual en los dos escenarios.** Sin
 *    esto, un mes con más gente parecería mérito del upselling cuando
 *    es mérito de que entró más gente.
 *
 * 3. **El margen se muestra en un RANGO, no en un número.** El programa
 *    supone uno; la contabilidad de caja dice otro; las recetas dicen un
 *    tercero. Elegir el que conviene sería hacer trampa. Se muestran
 *    todos y se responde con el PEOR: si aun con el peor supuesto el
 *    bono se paga solo, la discusión terminó.
 *
 * ─── Lo que esta lámina NO prueba ───
 *
 * Que el programa CAUSÓ la subida. No hay grupo de control: nadie puede
 * separar el bono del clima, del menú nuevo o de un buen administrador.
 * Lo que sí se puede afirmar —y la lámina lo dice— es que el ticket
 * subió vendiendo MÁS UNIDADES por persona y no subiendo precios, que
 * es exactamente el mecanismo que el programa premia. La correlación se
 * muestra; la causalidad se declara como lo que es.
 */

/** Un mes de operación de una cafetería, ya sin delivery ni consumo del personal. */
export type MesUpselling = {
  month: string;
  /** Personas atendidas (presenciales). */
  personas: number;
  /** Venta presencial del mes. */
  venta: number;
  /** Ítems vendidos. null = el registro de ese mes no los tenía. */
  items: number | null;
};

export type EscenarioMargen = {
  etiqueta: string;
  margen: number;
  /** Utilidad extra que dejó la venta nueva bajo este supuesto. */
  utilidadExtra: number;
  /** Cuántas veces el bono cabe en esa utilidad. */
  veces: number;
};

export type ImpactoIncentivos = {
  sede: string;
  mesBase: string;
  mesActual: string;
  ticketBase: number;
  ticketActual: number;
  /** Variación del ticket, en %. */
  deltaTicketPct: number;
  personasActual: number;
  /** Personas por día: si cayó, el ticket subió a costa del tráfico. */
  personasDiaBase: number | null;
  personasDiaActual: number | null;
  /** Venta que NO habría existido con el ticket del mes anterior. */
  ventaExtra: number;
  /** Ítems por persona: la señal del upselling. null si no hay datos. */
  itemsPorPersonaBase: number | null;
  itemsPorPersonaActual: number | null;
  /**
   * Qué parte del alza del ticket vino de VENDER MÁS UNIDADES y no de
   * precio. >100% significa que el precio por ítem incluso bajó.
   * null = sin datos de ítems.
   */
  aporteVolumenPct: number | null;
  bonoPagado: number;
  escenarios: EscenarioMargen[];
  /** El peor escenario manda. */
  veredicto: "se_paga_solo" | "ajustado" | "no_se_paga" | "sin_bono" | "sin_datos";
  /** Una frase para leer en voz alta en la reunión. */
  titular: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Ticket de un mes. null si no hubo gente (evita dividir por cero). */
export const ticketDe = (m: MesUpselling): number | null =>
  m.personas > 0 ? r2(m.venta / m.personas) : null;

/**
 * Los supuestos de margen con los que se prueba el programa.
 *
 * No se elige uno: se prueban todos y responde el peor. El orden va del
 * más optimista al más conservador a propósito — la lámina se lee de
 * arriba abajo y termina en el que menos favorece al programa, que es
 * el que zanja la discusión.
 */
export type SupuestoMargen = { etiqueta: string; margen: number };

export function evaluarImpacto(input: {
  sede: string;
  base: MesUpselling;
  actual: MesUpselling;
  /** Días con venta de cada mes, para normalizar el tráfico. */
  diasBase: number;
  diasActual: number;
  bonoPagado: number;
  supuestos: SupuestoMargen[];
}): ImpactoIncentivos {
  const { sede, base, actual, bonoPagado, supuestos } = input;
  const tBase = ticketDe(base);
  const tActual = ticketDe(actual);

  const vacio: ImpactoIncentivos = {
    sede, mesBase: base.month, mesActual: actual.month,
    ticketBase: tBase ?? 0, ticketActual: tActual ?? 0, deltaTicketPct: 0,
    personasActual: actual.personas, personasDiaBase: null, personasDiaActual: null,
    ventaExtra: 0, itemsPorPersonaBase: null, itemsPorPersonaActual: null,
    aporteVolumenPct: null, bonoPagado, escenarios: [],
    veredicto: "sin_datos",
    titular: "Faltan datos del mes anterior para medir el impacto.",
  };
  if (tBase === null || tActual === null) return vacio;

  // La venta que no existía: el salto del ticket aplicado al tráfico
  // REAL de este mes. Si el ticket bajó, esto es negativo y así se dice.
  const ventaExtra = r2((tActual - tBase) * actual.personas);
  const deltaTicketPct = r2(((tActual - tBase) / tBase) * 100);

  const ippBase = base.items !== null && base.personas > 0 ? base.items / base.personas : null;
  const ippActual = actual.items !== null && actual.personas > 0 ? actual.items / actual.personas : null;

  // Qué parte del alza vino de volumen. El ticket es
  // (ítems por persona) × (precio por ítem); si los ítems por persona
  // subieron 9% y el ticket 12%, el volumen explica el 75%.
  let aporteVolumenPct: number | null = null;
  if (ippBase !== null && ippActual !== null && ippBase > 0 && deltaTicketPct !== 0) {
    const deltaIppPct = ((ippActual - ippBase) / ippBase) * 100;
    aporteVolumenPct = r2((deltaIppPct / deltaTicketPct) * 100);
  }

  const escenarios: EscenarioMargen[] = supuestos.map((s) => {
    const utilidadExtra = r2(ventaExtra * s.margen);
    return {
      etiqueta: s.etiqueta,
      margen: s.margen,
      utilidadExtra,
      veces: bonoPagado > 0 ? r2(utilidadExtra / bonoPagado) : 0,
    };
  });

  // El peor escenario es el que decide. Un programa que solo funciona
  // con el supuesto más favorable no funciona.
  const peor = escenarios.reduce<EscenarioMargen | null>(
    (min, e) => (min === null || e.utilidadExtra < min.utilidadExtra ? e : min),
    null,
  );
  // Un mes SIN bono no es un mes fallido: la sede no llegó al nivel, no
  // se pagó nada, y el ticket igual se movió. Sin este caso aparte, la
  // división por cero lo declaraba "no se paga" — que es justo lo
  // contrario, y le habría dado a Kelly munición equivocada sobre
  // Fonavi, que en agosto mejoró S/2,193 sin costar un sol.
  const veredicto: ImpactoIncentivos["veredicto"] =
    peor === null || escenarios.length === 0
      ? "sin_datos"
      : bonoPagado <= 0
        ? "sin_bono"
        : peor.veces >= 2
          ? "se_paga_solo"
          : peor.veces >= 1
            ? "ajustado"
            : "no_se_paga";

  const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
  const titular =
    veredicto === "sin_bono"
      ? ventaExtra > 0
        ? `La sede no llegó a la meta, así que no se pagó bono. Aun así el ticket subió y trajo ${soles(ventaExtra)} de venta nueva: el programa movió la aguja sin costar un sol.`
        : `La sede no llegó a la meta y no se pagó bono. El ticket tampoco mejoró respecto al mes anterior.`
      : veredicto === "se_paga_solo"
      ? `El mejor ticket trajo ${soles(ventaExtra)} de venta nueva. Aun con el supuesto más conservador, deja ${soles(peor!.utilidadExtra)} de utilidad extra: ${peor!.veces.toFixed(1)}× el bono pagado.`
      : veredicto === "ajustado"
        ? `El mejor ticket trajo ${soles(ventaExtra)} de venta nueva. Con el supuesto más conservador la utilidad extra (${soles(peor!.utilidadExtra)}) apenas cubre el bono — el programa está al límite.`
        : veredicto === "no_se_paga"
          ? `El ticket no generó utilidad suficiente para cubrir el bono con el supuesto más conservador. Hay que revisar la política.`
          : "Faltan datos para medir el impacto.";

  return {
    sede, mesBase: base.month, mesActual: actual.month,
    ticketBase: tBase, ticketActual: tActual, deltaTicketPct,
    personasActual: actual.personas,
    personasDiaBase: input.diasBase > 0 ? r2(base.personas / input.diasBase) : null,
    personasDiaActual: input.diasActual > 0 ? r2(actual.personas / input.diasActual) : null,
    ventaExtra,
    itemsPorPersonaBase: ippBase !== null ? r2(ippBase) : null,
    itemsPorPersonaActual: ippActual !== null ? r2(ippActual) : null,
    aporteVolumenPct,
    bonoPagado, escenarios, veredicto, titular,
  };
}
