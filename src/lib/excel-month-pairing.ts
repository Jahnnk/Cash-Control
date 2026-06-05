/**
 * Lógica pura para la importación multi-mes del Excel de Kelly (Fonavi/Centro).
 *
 * Resuelve dos cosas SIN tocar la base de datos:
 *  1. Emparejar las pestañas por mes — cada mes arrastra su par Ing&Gtos +
 *     Control de VTAS — tolerante a la capitalización inconsistente de los
 *     nombres ("Ing&Gtos Abr26", "Control de VTAS-MAY26", "...Set26", etc.).
 *  2. Clasificar qué meses ya están cargados (idempotencia) a partir de
 *     conteos por mes que el server provee (la query es read-only y vive
 *     en la Parte 2; aquí solo la lógica de clasificación, testeable).
 *
 * Espejo del parser de mes ya usado en excel-importer.ts
 * (getLastDayOfSheetMonth) y control-vtas-parser.ts (parseSheetMonth);
 * se replica el mapa de abreviaturas para mantener este módulo puro y
 * sin dependencias de XLSX.
 */

/** Abreviaturas de 3 letras → número de mes (1-12). SET y SEP = septiembre. */
const MONTH_ABBREV: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
};

/**
 * Extrae la clave de mes "YYYY-MM" del nombre de una pestaña.
 * Busca el patrón `<abrev-3-letras><año-2-dígitos>` en cualquier parte del
 * nombre, case-insensitive y con separador/espacio opcional. Devuelve null
 * si no se puede deducir el mes.
 */
export function sheetMonthKey(sheetName: string): string | null {
  const m = sheetName.match(/([A-Za-z]{3})\s*(\d{2})\b/);
  if (!m) return null;
  const month = MONTH_ABBREV[m[1].toUpperCase()];
  if (!month) return null;
  const year = 2000 + parseInt(m[2], 10);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export type MonthPairStatus = "complete" | "only-inggtos" | "only-vtas";

export type MonthPair = {
  /** "2026-04" */
  monthKey: string;
  ingGtosSheet: string | null;
  controlVtasSheet: string | null;
  status: MonthPairStatus;
};

export type PairResult = {
  /** Meses ordenados ascendentemente por clave. */
  months: MonthPair[];
  /** Nombres de pestaña cuyo mes no se pudo parsear. */
  unparsed: string[];
};

/**
 * Agrupa las pestañas candidatas por mes. Cada mes queda con su Ing&Gtos
 * y su Control de VTAS (si existen). Un mes con un solo lado queda marcado
 * (only-inggtos / only-vtas) para que la UI pueda advertir.
 */
export function pairSheetsByMonth(
  ingGtos: string[],
  controlVtas: string[],
): PairResult {
  const map = new Map<string, MonthPair>();
  const unparsed: string[] = [];

  const ensure = (k: string): MonthPair => {
    let e = map.get(k);
    if (!e) {
      e = { monthKey: k, ingGtosSheet: null, controlVtasSheet: null, status: "only-inggtos" };
      map.set(k, e);
    }
    return e;
  };

  for (const s of ingGtos) {
    const k = sheetMonthKey(s);
    if (!k) { unparsed.push(s); continue; }
    ensure(k).ingGtosSheet = s;
  }
  for (const s of controlVtas) {
    const k = sheetMonthKey(s);
    if (!k) { unparsed.push(s); continue; }
    ensure(k).controlVtasSheet = s;
  }

  for (const e of map.values()) {
    e.status = e.ingGtosSheet && e.controlVtasSheet
      ? "complete"
      : e.ingGtosSheet
        ? "only-inggtos"
        : "only-vtas";
  }

  const months = Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return { months, unparsed };
}

/**
 * Valida una selección manual de un par. "Crossed" = el usuario eligió un
 * Ing&Gtos de un mes junto con un Control de VTAS de OTRO mes. La UI debe
 * advertir antes de continuar.
 */
export function validateSelection(
  ingGtosSheet: string | null,
  controlVtasSheet: string | null,
): { ok: boolean; crossed: boolean; ingMonth: string | null; vtasMonth: string | null } {
  const ingMonth = ingGtosSheet ? sheetMonthKey(ingGtosSheet) : null;
  const vtasMonth = controlVtasSheet ? sheetMonthKey(controlVtasSheet) : null;
  const crossed = !!(ingMonth && vtasMonth && ingMonth !== vtasMonth);
  return { ok: !crossed, crossed, ingMonth, vtasMonth };
}

export type MonthLoadStatus = {
  monthKey: string;
  existingCount: number;
  /** true si ya hay registros importados de ese mes (idempotencia). */
  loaded: boolean;
};

/**
 * Clasifica los meses objetivo en cargados vs nuevos a partir de los conteos
 * de registros importados por mes (provistos por el server, read-only).
 * Pura y testeable; no toca la base.
 */
export function classifyMonthsLoaded(
  monthKeys: string[],
  existingCountByMonth: Record<string, number>,
): MonthLoadStatus[] {
  return monthKeys.map((monthKey) => {
    const existingCount = existingCountByMonth[monthKey] ?? 0;
    return { monthKey, existingCount, loaded: existingCount > 0 };
  });
}

/**
 * "2026-04" → { start: "2026-04-01", end: "2026-04-30" }. Maneja años
 * bisiestos (Feb24 → 29). Devuelve null si la clave es inválida. Lo usará
 * la query de detección de duplicados en la Parte 2.
 */
export function monthRange(monthKey: string): { start: string; end: string } | null {
  const m = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(lastDay).padStart(2, "0")}` };
}
