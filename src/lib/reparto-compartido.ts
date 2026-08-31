/**
 * Empareja un egreso del Excel con la regla de reparto entre sedes que
 * le corresponde — o admite que no sabe.
 *
 * ─── Por qué existe ───
 *
 * Jahnn (30-ago-2026): "de hoy en adelante yo prácticamente no voy a
 * colocar nada a mano en el sistema. Kelly me va a pasar los tres excels
 * por cada sede y yo los voy a cargar y el sistema tiene que hacerlo
 * todo".
 *
 * Hasta julio él marcaba a mano qué gastos de Atelier se comparten con
 * Fonavi y en qué proporción. En agosto dejó de hacerlo y el sistema tomó
 * todo literal: Atelier absorbió S/1,705 de luz, agua y gas cuando en
 * julio le correspondían S/1,102 de S/1,631. Unos S/600 al mes que son de
 * Fonavi. Los dos puntos de equilibrio quedan mal: el de Atelier alto y
 * el de Fonavi bajo.
 *
 * ─── Por qué no reparte todo solo ───
 *
 * Las reglas guardadas dicen "Agua 1er piso", "Luz Monofásico", "Gas".
 * Kelly escribe "AGUA 1ER PISO (SEDACAJ)", "TRUFASICO (HIDRANDINA)",
 * "LUZ 1ER PISO (HIDRANDINA)". Tres de los siete servicios de agosto no
 * emparejan con ninguna regla existente.
 *
 * Equivocarse acá es peor que equivocarse de categoría: mueve dinero de
 * un negocio a otro. Un error deja a Atelier pagando lo de Fonavi —o al
 * revés— y descuadra los dos sin que nadie lo note. Por eso solo reparte
 * cuando la coincidencia es completa y única, y en cualquier otro caso se
 * lo pregunta a Jahnn en la pantalla de importación.
 *
 * ─── La regla del emparejamiento ───
 *
 * CLARA   · todas las palabras significativas de la regla aparecen en el
 *           concepto de Kelly, y ninguna otra regla de esa categoría
 *           empareja igual de bien. "AGUA 1ER PISO (SEDACAJ)" → la regla
 *           "Agua 1er piso" y solo esa.
 * DUDOSA  · empareja a medias, o emparejan dos reglas a la vez.
 *           "TRUFASICO (HIDRANDINA)" se parece a "Luz Trifásico" pero le
 *           falta la palabra "luz" — y son S/966, demasiado para adivinar.
 * NINGUNA · no hay regla que se le parezca. "LUZ 1ER PISO" no tiene
 *           regla creada todavía.
 *
 * Solo CLARA se aplica sola. Las otras dos van a la lista de preguntas.
 */

import { normalizeCategory } from "./category-normalize";

/** Una regla de reparto tal como está guardada. */
export type ReglaReparto = {
  id: string;
  /** Categoría a la que aplica (nombre canónico). */
  categoria: string;
  /** El concepto que le puso Jahnn: "Alquiler", "Luz 2do piso"… */
  concepto: string;
  /** "percentage" | "fixed" — solo se transporta, no se interpreta acá. */
  modo: string;
  atelierPct: number;
  fonaviPct: number;
  centroPct: number;
  atelierFijo: number | null;
  fonaviFijo: number | null;
  centroFijo: number | null;
};

export type EgresoAEvaluar = {
  excelRow: number;
  fecha: string;
  monto: number;
  categoria: string;
  concepto: string;
};

export type ConfianzaReparto = "clara" | "dudosa" | "ninguna";

export type EvaluacionReparto = {
  excelRow: number;
  fecha: string;
  monto: number;
  categoria: string;
  concepto: string;
  /** La regla elegida, o null si no hay ninguna suficientemente clara. */
  regla: ReglaReparto | null;
  /** Las que compitieron, para mostrárselas a Jahnn cuando hay duda. */
  candidatas: ReglaReparto[];
  confianza: ConfianzaReparto;
  motivo: string;
};

/** Sin tildes, en MAYÚSCULA, sin puntuación. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Palabras que no distinguen nada y solo agregan ruido al emparejar.
 * "PAGO DE LUZ" y "LUZ" tienen que valer lo mismo.
 */
const VACIAS = new Set([
  "DE", "DEL", "LA", "EL", "LOS", "LAS", "POR", "PARA", "Y", "A", "EN",
  "PAGO", "PAGOS", "MES", "MENSUAL", "SERVICIO", "RECIBO", "REEMBOLSO",
]);

function palabras(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((p) => p.length > 0 && !VACIAS.has(p));
}

/**
 * ¿Está esta palabra de la regla dentro del concepto de Kelly?
 *
 * Se acepta un error de tipeo en palabras largas ("TRIFASICO" contra
 * "TRUFASICO") pero NUNCA en las cortas: con tres letras cualquier cosa
 * se parece a cualquier cosa, y "1ER" contra "2DO" es exactamente la
 * diferencia que no se puede perdonar — son pisos distintos, sedes
 * distintas, plata distinta.
 */
function apareceEn(palabra: string, enConcepto: string[]): boolean {
  if (enConcepto.includes(palabra)) return true;
  if (palabra.length < 7) return false;
  return enConcepto.some((p) => p.length >= 7 && distanciaUno(p, palabra));
}

/** true si difieren en exactamente una letra (sustitución, alta o baja). */
function distanciaUno(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return false;
  let i = 0, j = 0, fallos = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++fallos > 1) return false;
    if (a.length === b.length) { i++; j++; }
    else if (a.length > b.length) i++;
    else j++;
  }
  return fallos + (a.length - i) + (b.length - j) === 1;
}

export function evaluarReparto(
  egreso: EgresoAEvaluar,
  reglas: ReglaReparto[],
): EvaluacionReparto {
  const base = {
    excelRow: egreso.excelRow,
    fecha: egreso.fecha,
    monto: egreso.monto,
    categoria: egreso.categoria,
    concepto: egreso.concepto,
  };

  const deLaCategoria = reglas.filter(
    (r) => normalizeCategory(r.categoria) === normalizeCategory(egreso.categoria),
  );

  if (deLaCategoria.length === 0) {
    return {
      ...base, regla: null, candidatas: [], confianza: "ninguna",
      motivo: "No hay reglas de reparto para esta categoría.",
    };
  }

  const concepto = palabras(egreso.concepto);

  // Una regla "empareja entero" cuando TODAS sus palabras están.
  const enteras = deLaCategoria.filter((r) => {
    const suyas = palabras(r.concepto);
    return suyas.length > 0 && suyas.every((p) => apareceEn(p, concepto));
  });

  if (enteras.length === 1) {
    return {
      ...base, regla: enteras[0], candidatas: enteras, confianza: "clara",
      motivo: `Coincide con la regla "${enteras[0].concepto}".`,
    };
  }

  if (enteras.length > 1) {
    return {
      ...base, regla: null, candidatas: enteras, confianza: "dudosa",
      motivo: `Coinciden ${enteras.length} reglas a la vez — hay que elegir.`,
    };
  }

  // Ninguna entera: ¿alguna comparte al menos una palabra? Eso es una
  // pista, no una respuesta.
  const parciales = deLaCategoria.filter((r) =>
    palabras(r.concepto).some((p) => apareceEn(p, concepto)),
  );

  if (parciales.length > 0) {
    return {
      ...base, regla: null, candidatas: parciales, confianza: "dudosa",
      motivo: "Se parece a una regla pero no coincide del todo.",
    };
  }

  return {
    ...base, regla: null, candidatas: [], confianza: "ninguna",
    motivo: "Ninguna regla de la categoría se le parece.",
  };
}

/** Evalúa una lista y deja solo lo que tiene algo que ver con el reparto. */
export function evaluarRepartos(
  egresos: EgresoAEvaluar[],
  reglas: ReglaReparto[],
): EvaluacionReparto[] {
  const categoriasConRegla = new Set(reglas.map((r) => normalizeCategory(r.categoria)));
  return egresos
    .filter((e) => categoriasConRegla.has(normalizeCategory(e.categoria)))
    .map((e) => evaluarReparto(e, reglas));
}

/**
 * Cómo se parte un monto según su regla.
 *
 * Se calcula la parte de Atelier (y la de Centro si la hay) y lo que queda
 * se obtiene por RESTA, nunca aplicando un segundo porcentaje: así las
 * partes suman siempre el total exacto y no se pierde un céntimo por
 * redondeo. En un gasto de S/966.20 al 70/30, tres decimales perdidos son
 * plata que no le queda registrada a nadie.
 */
export function partirMonto(
  monto: number,
  r: ReglaReparto,
): { atelier: number; fonavi: number; centro: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (r.modo === "fixed") {
    const atelier = r2(r.atelierFijo ?? monto);
    const centro = r2(r.centroFijo ?? 0);
    return { atelier, centro, fonavi: r2(monto - atelier - centro) };
  }
  const atelier = r2((monto * r.atelierPct) / 100);
  const centro = r2((monto * r.centroPct) / 100);
  return { atelier, centro, fonavi: r2(monto - atelier - centro) };
}
