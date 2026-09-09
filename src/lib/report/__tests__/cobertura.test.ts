/**
 * La comprobación que faltaba: ¿el mes está completo?
 *
 * Los casos son los REALES que produjeron reportes falsos. Sin esto,
 * un mes a medio cargar muestra una pérdida inventada porque las ventas
 * entran día por día y los gastos entran de golpe.
 */
import { describe, it, expect } from "vitest";
import { evaluarCobertura, UMBRAL_COMPLETO } from "../cobertura";

const sede = (unitId: number, unitName: string, diasConVenta: number, ultimoGasto: string | null) =>
  ({ unitId, unitName, diasConVenta, ultimoGasto });

describe("agosto 2026, mirado el 9 de setiembre", () => {
  const agosto = (dias = { at: 25, fo: 31, ce: 31 }) =>
    evaluarCobertura({
      month: "2026-08", todayISO: "2026-09-09",
      sedes: [
        sede(1, "Atelier", dias.at, "2026-08-31"),
        sede(2, "Fonavi", dias.fo, "2026-08-31"),
        sede(3, "Centro", dias.ce, "2026-08-31"),
      ],
    });

  it("detecta que a Atelier le faltan 6 días de venta", () => {
    const r = agosto();
    const at = r.sedes.find((s) => s.unitName === "Atelier")!;
    expect(at.diasConVenta).toBe(25);
    expect(at.diasEsperados).toBe(31);
    expect(at.faltante).toContain("faltan 6 día(s) de venta");
  });

  it("el peor caso manda: el grupo NO es confiable por una sola sede", () => {
    // Fonavi y Centro están al 100%. Da igual: el reporte del grupo
    // suma las tres, así que vale lo que vale la peor.
    const r = agosto();
    expect(r.estado).toBe("casi_completo");
    expect(r.confiable).toBe(false);
  });

  it("el titular explica el SESGO, no solo que falta algo", () => {
    // "Faltan datos" no le dice a nadie qué hacer. "El resultado sale
    // peor de lo real" sí.
    expect(agosto().titular).toContain("peor de lo real");
  });

  it("con las tres sedes completas, dice que es definitivo", () => {
    const r = agosto({ at: 31, fo: 31, ce: 31 });
    expect(r.estado).toBe("completo");
    expect(r.confiable).toBe(true);
    expect(r.titular).toContain("definitivas");
  });

  it("no exige el 100%: un par de domingos cerrados no rompe el mes", () => {
    // 30 de 31 = 96.8%, por encima del umbral.
    const r = agosto({ at: 30, fo: 30, ce: 30 });
    expect(r.estado).toBe("completo");
    expect(r.confiable).toBe(true);
    expect(30 / 31 * 100).toBeGreaterThan(UMBRAL_COMPLETO);
  });
});

describe("abril 2026 de Fonavi: el reporte que decía −S/22,778", () => {
  it("10 días de 30 sale PARCIAL, no un mal mes", () => {
    const r = evaluarCobertura({
      month: "2026-04", todayISO: "2026-09-09",
      sedes: [sede(2, "Fonavi", 10, "2026-04-30")],
    });
    expect(r.estado).toBe("parcial");
    expect(r.confiable).toBe(false);
    expect(r.sedes[0].pctVentas).toBeCloseTo(33.3, 1);
  });
});

describe("el error opuesto: gastos cortados", () => {
  it("si el Excel de gastos no se subió, lo dice", () => {
    // Más peligroso que el otro: el resultado sale DEMASIADO BUENO y
    // nadie desconfía de una buena noticia.
    const r = evaluarCobertura({
      month: "2026-08", todayISO: "2026-09-09",
      sedes: [sede(3, "Centro", 31, "2026-08-12")],
    });
    expect(r.sedes[0].faltante).toContain("los gastos se cortan el 12");
    expect(r.confiable).toBe(false);
  });

  it("un corte de pocos días es el cierre normal, no un aviso", () => {
    const r = evaluarCobertura({
      month: "2026-08", todayISO: "2026-09-09",
      sedes: [sede(3, "Centro", 31, "2026-08-28")],
    });
    expect(r.sedes[0].faltante).toBeNull();
    expect(r.confiable).toBe(true);
  });

  it("sin ningún gasto cargado, lo dice aparte", () => {
    const r = evaluarCobertura({
      month: "2026-08", todayISO: "2026-09-09",
      sedes: [sede(3, "Centro", 31, null)],
    });
    expect(r.sedes[0].faltante).toContain("no hay gastos cargados");
  });
});

describe("el mes en curso no es un mes incompleto", () => {
  it("setiembre visto el día 9 mide contra 8 días, no contra 30", () => {
    const r = evaluarCobertura({
      month: "2026-09", todayISO: "2026-09-09",
      sedes: [
        sede(1, "Atelier", 5, "2026-09-03"),
        sede(2, "Fonavi", 7, "2026-09-02"),
        sede(3, "Centro", 7, "2026-09-03"),
      ],
    });
    expect(r.sedes[0].diasEsperados).toBe(8);
    expect(r.estado).toBe("en_curso");
    expect(r.confiable).toBe(false);
    expect(r.titular).toContain("todavía está en curso");
    expect(r.titular).not.toContain("peor de lo real");
  });

  it("en curso no reclama días que aún no pasaron", () => {
    const r = evaluarCobertura({
      month: "2026-09", todayISO: "2026-09-09",
      sedes: [sede(3, "Centro", 8, "2026-09-08")],
    });
    expect(r.sedes[0].faltante).toBeNull();
  });
});

describe("sin datos no se inventa un reporte", () => {
  it("cero días de venta = vacío", () => {
    const r = evaluarCobertura({
      month: "2026-01", todayISO: "2026-09-09",
      sedes: [sede(3, "Centro", 0, null)],
    });
    expect(r.estado).toBe("vacio");
    expect(r.confiable).toBe(false);
    expect(r.titular).toContain("No hay datos suficientes");
  });
});
