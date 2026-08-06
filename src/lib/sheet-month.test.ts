/**
 * Reporte de Jahnn (ago-2026): Kelly nombra la pestaña "Control de
 * VTAS-JUL" sin el año, y el sistema la ignoraba en silencio porque el
 * año de 2 dígitos era obligatorio en el regex. Estas pruebas fijan que
 * el año es opcional y que un substring casual como "TAS" (de "VTAS")
 * no se confunda con un mes real.
 */
import { describe, it, expect } from "vitest";
import { parseSheetMonthYear, MONTH_ABBREV } from "./sheet-month";

describe("parseSheetMonthYear — año opcional", () => {
  it("con año: lo usa tal cual", () => {
    expect(parseSheetMonthYear("Control de VTAS-JUL26", 2099)).toEqual({ month: 7, year: 2026 });
  });

  it("sin año: usa el fallback, no se ignora la pestaña", () => {
    expect(parseSheetMonthYear("Control de VTAS-JUL", 2026)).toEqual({ month: 7, year: 2026 });
    expect(parseSheetMonthYear("Ing&Gtos-JUL", 2026)).toEqual({ month: 7, year: 2026 });
  });

  it("no confunde 'TAS' (substring de VTAS) con un mes", () => {
    // Sin esta protección, "TAS" pasaría el regex genérico antes de llegar
    // a "JUL" y la función devolvería null aunque el mes SÍ esté presente.
    expect(parseSheetMonthYear("Control de VTAS-JUL", 2026)).toEqual({ month: 7, year: 2026 });
    expect(parseSheetMonthYear("Control de VTAS-JUL26", 2099)).toEqual({ month: 7, year: 2026 });
  });

  it("acepta SET y SEP como septiembre", () => {
    expect(parseSheetMonthYear("Ing&Gtos-SET26", 2000)).toEqual({ month: 9, year: 2026 });
    expect(parseSheetMonthYear("Ing&Gtos-SEP", 2026)).toEqual({ month: 9, year: 2026 });
  });

  it("devuelve null si no hay ningún mes reconocible", () => {
    expect(parseSheetMonthYear("Resumen", 2026)).toBeNull();
    expect(parseSheetMonthYear("Hoja1", 2026)).toBeNull();
  });

  it("el mapa de meses cubre los 12 meses", () => {
    expect(Object.keys(MONTH_ABBREV).length).toBeGreaterThanOrEqual(12);
    expect(MONTH_ABBREV.DIC).toBe(12);
  });
});
