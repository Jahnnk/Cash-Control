import { describe, it, expect } from "vitest";
import {
  evaluarReparto,
  evaluarRepartos,
  type ReglaReparto,
  type EgresoAEvaluar,
} from "../reparto-compartido";

const regla = (concepto: string, categoria = "SERVICIOS", at = 67, fo = 33): ReglaReparto => ({
  id: concepto, categoria, concepto, modo: "percentage",
  atelierPct: at, fonaviPct: fo, centroPct: 0,
  atelierFijo: null, fonaviFijo: null, centroFijo: null,
});

/** Las reglas reales de Atelier (ago-2026). */
const REGLAS: ReglaReparto[] = [
  regla("Agua 1er piso"),
  regla("Gas", "SERVICIOS", 70, 30),
  regla("Internet", "SERVICIOS", 40, 60),
  regla("Luz 2do piso", "SERVICIOS", 75, 25),
  regla("Luz Monofásico"),
  regla("Luz Trifásico", "SERVICIOS", 100, 0),
  regla("Teléfono", "SERVICIOS", 50, 50),
  regla("Alquiler", "ALQUILER"),
];

const egreso = (concepto: string, categoria = "SERVICIOS", monto = 100): EgresoAEvaluar => ({
  excelRow: 1, fecha: "2026-08-20", monto, categoria, concepto,
});

describe("lo que SÍ se reparte solo", () => {
  it("empareja el agua del primer piso", () => {
    const r = evaluarReparto(egreso("AGUA 1ER PISO (SEDACAJ)"), REGLAS);
    expect(r.confianza).toBe("clara");
    expect(r.regla?.concepto).toBe("Agua 1er piso");
  });

  it("empareja la luz del segundo piso", () => {
    const r = evaluarReparto(egreso("LUZ 2DO PISO (HIDRANDINA)"), REGLAS);
    expect(r.confianza).toBe("clara");
    expect(r.regla?.concepto).toBe("Luz 2do piso");
  });

  it("empareja el gas aunque Kelly agregue el proveedor", () => {
    expect(evaluarReparto(egreso("GAS (QUIAVI)"), REGLAS).regla?.concepto).toBe("Gas");
    expect(evaluarReparto(egreso("GAS PRIMER PISO (QUAVI)"), REGLAS).regla?.concepto).toBe("Gas");
  });

  it("ignora tildes y palabras de relleno", () => {
    expect(evaluarReparto(egreso("PAGO DE TELEFONO DEL MES"), REGLAS).regla?.concepto).toBe("Teléfono");
  });

  it("el alquiler, que es el caso de todos los meses", () => {
    const r = evaluarReparto(egreso("ALQUILER AGOSTO 2026 (HUGO DÍAS)", "ALQUILER", 2700), REGLAS);
    expect(r.confianza).toBe("clara");
    expect(r.regla?.concepto).toBe("Alquiler");
  });
});

describe("lo que NO se reparte solo — va a preguntarle a Jahnn", () => {
  it("no confunde el 1er piso con el 2do", () => {
    // La diferencia entre pisos es la diferencia entre sedes. Nunca se
    // perdona un error en "1ER" contra "2DO".
    const r = evaluarReparto(egreso("LUZ 1ER PISO (HIDRANDINA)"), REGLAS);
    expect(r.regla).toBeNull();
    expect(r.confianza).toBe("dudosa");
  });

  it("no confunde el agua del 2do piso con la del 1ero", () => {
    const r = evaluarReparto(egreso("AGUA 2DO PISO (SEDACAJ)"), REGLAS);
    expect(r.regla).toBeNull();
  });

  it("no adivina el trifásico mal escrito", () => {
    // "TRUFASICO (HIDRANDINA)" son S/966: demasiado para tirar una moneda.
    const r = evaluarReparto(egreso("TRUFASICO (HIDRANDINA)", "SERVICIOS", 966.2), REGLAS);
    expect(r.regla).toBeNull();
    expect(r.candidatas.map((c) => c.concepto)).toContain("Luz Trifásico");
  });

  it("se rinde cuando la categoría no tiene ninguna regla", () => {
    const r = evaluarReparto(egreso("COMPRA DE HARINA", "INSUMOS"), REGLAS);
    expect(r.confianza).toBe("ninguna");
    expect(r.candidatas).toHaveLength(0);
  });

  it("se rinde cuando dos reglas emparejan a la vez", () => {
    const ambiguas = [regla("Luz"), regla("Luz 2do piso", "SERVICIOS", 75, 25)];
    const r = evaluarReparto(egreso("LUZ 2DO PISO"), ambiguas);
    expect(r.confianza).toBe("dudosa");
    expect(r.candidatas).toHaveLength(2);
  });
});

describe("evaluarRepartos sobre el Excel completo", () => {
  it("solo mira las categorías que tienen reglas", () => {
    const todos = [
      egreso("AGUA 1ER PISO (SEDACAJ)"),
      egreso("6KG FRESA (EDGAR VARGAS)", "INSUMOS"),
      egreso("BOLSAS", "PACKAGING"),
    ];
    const r = evaluarRepartos(todos, REGLAS);
    expect(r).toHaveLength(1);
    expect(r[0].concepto).toContain("AGUA");
  });

  it("los 7 servicios reales de agosto: 4 claros y 3 a preguntar", () => {
    const agosto = [
      egreso("GAS (QUIAVI)", "SERVICIOS", 4.25),
      egreso("GAS PRIMER PISO (QUAVI)", "SERVICIOS", 341.8),
      egreso("LUZ 1ER PISO (HIDRANDINA)", "SERVICIOS", 7.8),
      egreso("LUZ 2DO PISO (HIDRANDINA)", "SERVICIOS", 66.7),
      egreso("TRUFASICO (HIDRANDINA)", "SERVICIOS", 966.2),
      egreso("AGUA 2DO PISO (SEDACAJ)", "SERVICIOS", 127.9),
      egreso("AGUA 1ER PISO (SEDACAJ)", "SERVICIOS", 190.6),
    ];
    const r = evaluarRepartos(agosto, REGLAS);
    expect(r.filter((x) => x.confianza === "clara")).toHaveLength(4);
    expect(r.filter((x) => x.regla === null)).toHaveLength(3);
  });
});
