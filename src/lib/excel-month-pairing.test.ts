import { describe, it, expect } from "vitest";
import {
  sheetMonthKey,
  pairSheetsByMonth,
  validateSelection,
  classifyMonthsLoaded,
  monthRange,
} from "./excel-month-pairing";

describe("sheetMonthKey — tolerante a capitalización y separadores", () => {
  it("parsea Ing&Gtos en distintas capitalizaciones", () => {
    expect(sheetMonthKey("Ing&Gtos Abr26")).toBe("2026-04");
    expect(sheetMonthKey("Ing&Gtos MAY26")).toBe("2026-05");
    expect(sheetMonthKey("ing&gtos may26")).toBe("2026-05");
    expect(sheetMonthKey("Ing&Gtos ABR26")).toBe("2026-04");
  });

  it("parsea Control de VTAS con guion o espacio", () => {
    expect(sheetMonthKey("Control de VTAS-ABR26")).toBe("2026-04");
    expect(sheetMonthKey("Control de VTAS-MAY26")).toBe("2026-05");
    expect(sheetMonthKey("Control de VTAS Abr26")).toBe("2026-04");
    expect(sheetMonthKey("control de vtas-set26")).toBe("2026-09");
  });

  it("acepta SET y SEP como septiembre", () => {
    expect(sheetMonthKey("Ing&Gtos Set26")).toBe("2026-09");
    expect(sheetMonthKey("Ing&Gtos Sep26")).toBe("2026-09");
  });

  it("devuelve null cuando no hay patrón de mes", () => {
    expect(sheetMonthKey("Resumen")).toBeNull();
    expect(sheetMonthKey("Ing&Gtos")).toBeNull();
    expect(sheetMonthKey("Hoja1")).toBeNull();
  });

  it("con el año faltante, usa el fallback en vez de ignorar la pestaña (reporte Jahnn ago-2026)", () => {
    expect(sheetMonthKey("Control de VTAS-JUL", 2026)).toBe("2026-07");
    expect(sheetMonthKey("Ing&Gtos-JUL", 2026)).toBe("2026-07");
  });
});

describe("pairSheetsByMonth — empareja por mes", () => {
  it("empareja cada mes con sus dos pestañas (abril + mayo)", () => {
    const { months, unparsed } = pairSheetsByMonth(
      ["Ing&Gtos Abr26", "Ing&Gtos MAY26"],
      ["Control de VTAS-ABR26", "Control de VTAS-MAY26"],
    );
    expect(unparsed).toEqual([]);
    expect(months).toHaveLength(2);
    expect(months[0]).toMatchObject({
      monthKey: "2026-04",
      ingGtosSheet: "Ing&Gtos Abr26",
      controlVtasSheet: "Control de VTAS-ABR26",
      status: "complete",
    });
    expect(months[1]).toMatchObject({
      monthKey: "2026-05",
      ingGtosSheet: "Ing&Gtos MAY26",
      controlVtasSheet: "Control de VTAS-MAY26",
      status: "complete",
    });
  });

  it("marca meses con un solo lado", () => {
    const { months } = pairSheetsByMonth(
      ["Ing&Gtos Abr26"],
      ["Control de VTAS-MAY26"],
    );
    const abr = months.find((m) => m.monthKey === "2026-04")!;
    const may = months.find((m) => m.monthKey === "2026-05")!;
    expect(abr.status).toBe("only-inggtos");
    expect(abr.controlVtasSheet).toBeNull();
    expect(may.status).toBe("only-vtas");
    expect(may.ingGtosSheet).toBeNull();
  });

  it("recolecta pestañas no parseables en unparsed", () => {
    const { months, unparsed } = pairSheetsByMonth(["Ing&Gtos Abr26", "Resumen"], []);
    expect(months).toHaveLength(1);
    expect(unparsed).toEqual(["Resumen"]);
  });

  it("ordena los meses ascendentemente", () => {
    const { months } = pairSheetsByMonth(
      ["Ing&Gtos MAY26", "Ing&Gtos Abr26"],
      [],
    );
    expect(months.map((m) => m.monthKey)).toEqual(["2026-04", "2026-05"]);
  });
});

describe("validateSelection — detecta pares cruzados", () => {
  it("ok cuando ambas pestañas son del mismo mes", () => {
    const r = validateSelection("Ing&Gtos Abr26", "Control de VTAS-ABR26");
    expect(r).toEqual({ ok: true, crossed: false, ingMonth: "2026-04", vtasMonth: "2026-04" });
  });

  it("crossed cuando son de meses distintos", () => {
    const r = validateSelection("Ing&Gtos Abr26", "Control de VTAS-MAY26");
    expect(r.crossed).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.ingMonth).toBe("2026-04");
    expect(r.vtasMonth).toBe("2026-05");
  });

  it("no es crossed si falta un lado", () => {
    expect(validateSelection("Ing&Gtos Abr26", null).crossed).toBe(false);
    expect(validateSelection(null, "Control de VTAS-MAY26").crossed).toBe(false);
  });
});

describe("classifyMonthsLoaded — idempotencia (clasificación pura)", () => {
  it("marca cargados vs nuevos según los conteos", () => {
    const r = classifyMonthsLoaded(
      ["2026-04", "2026-05"],
      { "2026-04": 137, "2026-05": 0 },
    );
    expect(r).toEqual([
      { monthKey: "2026-04", existingCount: 137, loaded: true },
      { monthKey: "2026-05", existingCount: 0, loaded: false },
    ]);
  });

  it("trata meses ausentes del mapa como no cargados", () => {
    const r = classifyMonthsLoaded(["2026-06"], {});
    expect(r[0]).toEqual({ monthKey: "2026-06", existingCount: 0, loaded: false });
  });
});

describe("monthRange — rango de fechas del mes", () => {
  it("calcula primer y último día", () => {
    expect(monthRange("2026-04")).toEqual({ start: "2026-04-01", end: "2026-04-30" });
    expect(monthRange("2026-05")).toEqual({ start: "2026-05-01", end: "2026-05-31" });
  });

  it("maneja febrero bisiesto y no bisiesto", () => {
    expect(monthRange("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(monthRange("2025-02")).toEqual({ start: "2025-02-01", end: "2025-02-28" });
  });

  it("devuelve null para clave inválida", () => {
    expect(monthRange("2026-13")).toBeNull();
    expect(monthRange("abril")).toBeNull();
  });
});

describe("seguridad anti-huérfanos: el borrado cubre el MES COMPLETO", () => {
  // El reemplazo de un mes debe borrar el rango del mes calendario completo
  // (día 1 al último), NO solo las fechas del archivo nuevo. Así, un registro
  // del archivo ANTERIOR con una fecha que el archivo nuevo no trae NO
  // sobrevive al reemplazo. Esta es la garantía que fullMonthDeleteRange
  // (excel-import.ts) implementa usando monthRange; aquí se verifica el
  // contrato a nivel de fechas.
  it("una fecha presente solo en el archivo viejo cae dentro del rango de borrado", () => {
    // El archivo nuevo de abril solo trae hasta el día 15.
    const newFileMaxDate = "2026-04-15";
    // El archivo viejo tenía un registro el día 28.
    const oldOnlyDate = "2026-04-28";

    const delRange = monthRange("2026-04")!; // rango de borrado = mes completo
    expect(delRange).toEqual({ start: "2026-04-01", end: "2026-04-30" });

    // El huérfano (28-abr) SÍ está dentro del rango de borrado del mes completo
    // → se elimina al reemplazar.
    expect(delRange.start <= oldOnlyDate && oldOnlyDate <= delRange.end).toBe(true);
    // El rango de borrado va más allá de la última fecha del archivo nuevo.
    expect(delRange.end > newFileMaxDate).toBe(true);
    // Contraste: si se borrara SOLO por el rango del archivo nuevo (hasta el
    // 15), el huérfano del 28 sobreviviría. Esto demuestra por qué el borrado
    // por mes completo es necesario.
    expect(oldOnlyDate <= newFileMaxDate).toBe(false);
  });

  it("febrero: borra hasta el último día real del mes (bisiesto/no bisiesto)", () => {
    expect(monthRange("2024-02")!.end).toBe("2024-02-29");
    expect(monthRange("2025-02")!.end).toBe("2025-02-28");
  });
});
