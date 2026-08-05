/**
 * Único lugar que reconoce "<mes-3-letras><año-2-dígitos, OPCIONAL>" en
 * nombres de pestaña de Excel (Control de VTAS, Ing&Gtos). Antes el mapa
 * de abreviaturas y el año obligatorio estaban copiados en 3 archivos
 * (control-vtas-parser.ts, excel-importer.ts, excel-month-pairing.ts) y
 * se fueron desincronizando (SET faltaba en uno de ellos).
 *
 * Reporte de Jahnn (ago-2026): Kelly nombra la pestaña "Control de
 * VTAS-JUL" sin el año, y el sistema la ignoraba en silencio — el año
 * de 2 dígitos era obligatorio en el regex. Ahora es opcional: si falta,
 * se usa el año que indique el llamador (`fallbackYear`).
 *
 * Sin dependencia de XLSX a propósito (lo usa excel-month-pairing.ts,
 * que se mantiene puro y testeable sin esa librería).
 */

export const MONTH_ABBREV: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
};

/**
 * Recorre TODOS los tokens "<3 letras><2 dígitos?>" del nombre (no solo
 * el primero que matchee el regex) y se queda con el primero que sea una
 * abreviatura de mes válida — así "VTAS" no se confunde con un mes por
 * su substring "TAS" cuando el año ya no está pegado al mes real.
 */
export function parseSheetMonthYear(
  sheetName: string,
  fallbackYear: number,
): { month: number; year: number } | null {
  const re = /([A-Za-z]{3})(\d{2})?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sheetName)) !== null) {
    const month = MONTH_ABBREV[m[1].toUpperCase()];
    if (month) {
      const year = m[2] ? 2000 + parseInt(m[2], 10) : fallbackYear;
      return { month, year };
    }
  }
  return null;
}

/** Año en curso en hora de Perú — fallback por defecto cuando el nombre no trae año. */
export function currentYearLima(): number {
  return Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 4));
}
