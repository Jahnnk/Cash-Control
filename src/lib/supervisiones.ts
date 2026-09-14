/**
 * Supervisiones de Juani · MOTOR (lógica pura).
 *
 * ─── De dónde sale ───
 *
 * Reunión de socios del 13-sep-2026: el bono por ticket se paga solo si se
 * cumplen tres requisitos — el ticket, las ventas del mes contra el punto
 * de equilibrio, y pasar las supervisiones de Juani. Juani (socia) visita
 * los locales una o dos veces por semana. Decisiones de Jahnn, 14-sep:
 *
 *   · Juani revisa con una LISTA FIJA de puntos, igual para Fonavi y
 *     Centro. Cada "no cumple" se vuelve una OBSERVACIÓN con plazo.
 *   · Plazo fijo por gravedad: crítica 24 h, normal 7 días. Nadie
 *     negocia el plazo en cada caso.
 *   · El administrador sube la foto de la corrección y Juani la confirma.
 *   · Requisito del bono: TODAS las observaciones CRÍTICAS del mes se
 *     corrigieron dentro del plazo y Juani lo confirmó. Las normales se
 *     registran y se ven, pero no bloquean.
 *   · Un mes sin visita NO bloquea: si Juani no pudo ir, el equipo no
 *     tiene la culpa (misma lógica del Highlight).
 *
 * ─── "A tiempo" se decide por la corrección, no por la confirmación ───
 *
 * El plazo corre para el administrador, no para Juani. Si el admin subió
 * la foto a las 20 h y Juani la confirma a los tres días, la observación
 * se corrigió a tiempo. Lo que no puede pasar es que el bono dependa de
 * cuándo Juani tuvo un rato para revisar.
 *
 * Si Juani RECHAZA la corrección (la foto no muestra el arreglo), el
 * administrador recibe un plazo nuevo del mismo largo desde el rechazo —
 * había cumplido con responder a tiempo. Pero si esa corrección rechazada
 * ya había llegado tarde, la observación queda marcada fuera de plazo
 * para siempre (`vencidaAlgunaVez`): un rechazo no puede lavar un atraso.
 */

/** Sedes que tienen supervisiones (cafeterías). */
export const SEDES_SUPERVISADAS = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
];

export type Gravedad = "critica" | "normal";
export type EstadoObservacion = "abierta" | "corregida" | "confirmada";

export const PLAZO_HORAS: Record<Gravedad, number> = {
  critica: 24,
  normal: 7 * 24,
};

export const ETIQUETA_GRAVEDAD: Record<Gravedad, string> = {
  critica: "Crítica",
  normal: "Normal",
};

/** Fin del plazo desde un momento dado (ISO con zona). */
export function plazoDesde(desdeISO: string, gravedad: Gravedad): string {
  return new Date(Date.parse(desdeISO) + PLAZO_HORAS[gravedad] * 3_600_000).toISOString();
}

export type Observacion = {
  id: string;
  gravedad: Gravedad;
  estado: EstadoObservacion;
  /** Fecha de la VISITA (YYYY-MM-DD): define a qué mes pertenece. */
  fechaVisita: string;
  plazoHasta: string;
  corregidaEn: string | null;
  /** Una corrección llegó tarde en algún momento (no se borra con un rechazo). */
  vencidaAlgunaVez: boolean;
};

export type SituacionObservacion =
  /** Todavía hay tiempo para corregir. */
  | "en_plazo"
  /** El admin la corrigió a tiempo; falta que Juani confirme. */
  | "por_confirmar"
  /** Corregida a tiempo y confirmada. */
  | "cumplida"
  /** Se venció sin corregir, o se corrigió tarde. */
  | "fuera_de_plazo";

export function situacionObservacion(o: Observacion, ahoraISO: string): SituacionObservacion {
  const ahora = Date.parse(ahoraISO);
  const plazo = Date.parse(o.plazoHasta);
  const corregidaTarde = o.corregidaEn !== null && Date.parse(o.corregidaEn) > plazo;
  if (o.vencidaAlgunaVez || corregidaTarde) return "fuera_de_plazo";
  if (o.estado === "abierta") return ahora > plazo ? "fuera_de_plazo" : "en_plazo";
  if (o.estado === "corregida") return "por_confirmar";
  return "cumplida";
}

/**
 * ¿La corrección que se está registrando ahora llega tarde?
 * Se guarda en `vencidaAlgunaVez` al rechazarla, para que el plazo nuevo
 * no la lave.
 */
export function correccionLlegoTarde(o: Pick<Observacion, "plazoHasta" | "corregidaEn">): boolean {
  return o.corregidaEn !== null && Date.parse(o.corregidaEn) > Date.parse(o.plazoHasta);
}

/** Horas que quedan (negativas si ya venció). Para el contador del panel. */
export function horasRestantes(plazoHastaISO: string, ahoraISO: string): number {
  return Math.round(((Date.parse(plazoHastaISO) - Date.parse(ahoraISO)) / 3_600_000) * 10) / 10;
}

export type EstadoSupervisionMes =
  /** No hubo visita: el requisito se da por cumplido. */
  | "sin_visitas"
  /** Todas las críticas cumplidas (o no hubo críticas). */
  | "al_dia"
  /** Hay críticas en plazo o esperando confirmación: todavía se puede cumplir. */
  | "pendiente"
  /** Al menos una crítica fuera de plazo: este mes no hay bono. */
  | "incumplido";

export type ResumenSupervisionMes = {
  estado: EstadoSupervisionMes;
  /** ¿El requisito del bono está cumplido HOY? (pendiente = todavía no). */
  cumple: boolean;
  visitas: number;
  /** Promedio de % de puntos cumplidos en las visitas. null sin visitas. */
  puntajePromedio: number | null;
  criticas: { total: number; enPlazo: number; porConfirmar: number; cumplidas: number; fueraDePlazo: number };
  normales: { total: number; abiertas: number; fueraDePlazo: number };
};

export type VisitaResumen = { puntosEvaluados: number; puntosCumplidos: number };

/** Lo que el motor de incentivos recibe para decidir el requisito del mes. */
export type EntradaSupervision = { visitas: VisitaResumen[]; observaciones: Observacion[]; ahoraISO: string };

export function resumirSupervisionMes(
  visitas: VisitaResumen[],
  observaciones: Observacion[],
  ahoraISO: string,
): ResumenSupervisionMes {
  const criticas = { total: 0, enPlazo: 0, porConfirmar: 0, cumplidas: 0, fueraDePlazo: 0 };
  const normales = { total: 0, abiertas: 0, fueraDePlazo: 0 };
  for (const o of observaciones) {
    const s = situacionObservacion(o, ahoraISO);
    if (o.gravedad === "critica") {
      criticas.total++;
      if (s === "en_plazo") criticas.enPlazo++;
      else if (s === "por_confirmar") criticas.porConfirmar++;
      else if (s === "cumplida") criticas.cumplidas++;
      else criticas.fueraDePlazo++;
    } else {
      normales.total++;
      if (s === "fuera_de_plazo") normales.fueraDePlazo++;
      else if (s !== "cumplida") normales.abiertas++;
    }
  }

  const evaluadas = visitas.filter((v) => v.puntosEvaluados > 0);
  const puntajePromedio =
    evaluadas.length > 0
      ? Math.round(
          (evaluadas.reduce((t, v) => t + v.puntosCumplidos / v.puntosEvaluados, 0) / evaluadas.length) * 1000,
        ) / 10
      : null;

  let estado: EstadoSupervisionMes;
  if (visitas.length === 0) estado = "sin_visitas";
  else if (criticas.fueraDePlazo > 0) estado = "incumplido";
  else if (criticas.enPlazo > 0 || criticas.porConfirmar > 0) estado = "pendiente";
  else estado = "al_dia";

  return {
    estado,
    cumple: estado === "sin_visitas" || estado === "al_dia",
    visitas: visitas.length,
    puntajePromedio,
    criticas,
    normales,
  };
}

/** "vence en 5 h", "vence en 3 días", "venció hace 2 h" — para el contador. */
export function textoPlazo(plazoHastaISO: string, ahoraISO: string): string {
  const h = horasRestantes(plazoHastaISO, ahoraISO);
  const abs = Math.abs(h);
  const cuanto = abs < 1 ? "menos de 1 h" : abs < 48 ? `${Math.floor(abs)} h` : `${Math.floor(abs / 24)} días`;
  return h >= 0 ? `vence en ${cuanto}` : `venció hace ${cuanto}`;
}

export const ETIQUETA_ESTADO_MES: Record<EstadoSupervisionMes, string> = {
  sin_visitas: "Sin visitas este mes",
  al_dia: "Al día",
  pendiente: "Críticas pendientes",
  incumplido: "Crítica fuera de plazo",
};
