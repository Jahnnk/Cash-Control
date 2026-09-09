/**
 * El reporte de dos páginas, con los datos reales del grupo.
 *
 * Kelly pidió menos texto; Jahnn pidió el mes junto a su promedio de 3
 * meses. Estos tests fijan lo segundo, que es lo delicado: un promedio
 * mal armado esconde justo lo que debería mostrar.
 */
import { describe, it, expect } from "vitest";
import { construirResumenSimple } from "../resumen-simple";
import type { UnitFacts, CoberturaMes, MonthlyBasics } from "../types";

const mb = (month: string, sales: number, opExpenses: number): MonthlyBasics =>
  ({ month, sales, opExpenses, grossExpenses: opExpenses, ebitda: sales - opExpenses, liquidityEnd: null });

const unidad = (id: number, name: string, current: MonthlyBasics, history: MonthlyBasics[]): UnitFacts =>
  ({
    unit: { id, code: name.toLowerCase(), name },
    capabilities: {} as UnitFacts["capabilities"],
    month: current.month, daysInMonth: 31, current, history,
    categories: [], budget: [],
    liquidity: { bankEnd: 0, cashEnd: 0, startOfMonth: null, avgDailyExpense: 0 },
    receivables: null, partnerLoanPending: null,
    reconciliation: { lastCheckDate: null, lastCheckDiff: null, hasDiscrepancy: false },
  } as unknown as UnitFacts);

const cob = (confiable: boolean, titular = "Datos completos."): CoberturaMes =>
  ({ month: "2026-08", cerrado: true, sedes: [], estado: confiable ? "completo" : "parcial", confiable, titular });

// Agosto 2026 real, con julio y junio de historia.
const GRUPO = [
  unidad(1, "Atelier", mb("2026-08", 41056.86, 42094.29), [mb("2026-06", 39000, 38852), mb("2026-07", 36321, 33428)]),
  unidad(2, "Fonavi", mb("2026-08", 38979.45, 43048.71), [mb("2026-06", 36432, 43127), mb("2026-07", 34796, 28095)]),
  unidad(3, "Centro", mb("2026-08", 46786.14, 42641.37), [mb("2026-06", 34241, 34567), mb("2026-07", 40631, 32740)]),
];

const resumen = (units = GRUPO, cobertura = cob(true)) =>
  construirResumenSimple({ month: "2026-08", monthLabel: "Agosto de 2026", units, cobertura });

describe("las cifras del mes", () => {
  it("suma las tres sedes", () => {
    const r = resumen();
    expect(r.total.ventas).toBeCloseTo(126822.45, 2);
    expect(r.total.resultado).toBeCloseTo(-961.92, 2);
  });

  it("cada sede lleva su margen del mes", () => {
    const centro = resumen().sedes.find((s) => s.unitName === "Centro")!;
    expect(centro.resultado).toBeCloseTo(4144.77, 2);
    expect(centro.margenPct).toBeCloseTo(8.9, 1);
  });
});

describe("el promedio de 3 meses: para que un mes de abastecimiento no asuste", () => {
  it("agosto sale negativo pero el promedio móvil es positivo", () => {
    // Es el caso real: agosto compró de más. El mes se muestra tal cual,
    // pero al lado va el promedio, que es donde eso se compensa.
    const r = resumen();
    expect(r.total.resultado).toBeLessThan(0);
    expect(r.total.margen3mPct).toBeGreaterThan(0);
  });

  it("el titular NO dice que el negocio va mal si el promedio es positivo", () => {
    expect(resumen().titular).toContain("revisar si fue abastecimiento");
  });

  it("si el promedio TAMBIÉN es negativo, lo dice sin suavizarlo", () => {
    const malos = GRUPO.map((u) => unidad(u.unit.id, u.unit.name, u.current,
      u.history.map((h) => mb(h.month, h.sales, h.sales * 1.2))));
    expect(resumen(malos).titular).toContain("no es un mes suelto");
  });

  it("el grupo suma ventanas, no promedia promedios", () => {
    // Promediar los promedios haría que Atelier pesara igual que Centro
    // aunque venda distinto. Se comprueba con una sede diminuta.
    const conChica = [...GRUPO, unidad(9, "Kiosco", mb("2026-08", 100, 10), [mb("2026-07", 100, 10)])];
    const r = resumen(conChica);
    // El margen del grupo apenas se mueve: la sede chica pesa lo que vende.
    expect(Math.abs(r.total.margen3mPct! - resumen().total.margen3mPct!)).toBeLessThan(0.5);
  });

  it("un mes SIN ventas no entra al promedio y no lo arrastra", () => {
    // El mes vacío es falta de carga, no un mes malo. Si entrara,
    // el promedio diría que el negocio empeoró.
    const conVacio = [unidad(3, "Centro", mb("2026-08", 46786.14, 42641.37),
      [mb("2026-06", 0, 0), mb("2026-07", 40631, 32740)])];
    const r = resumen(conVacio);
    const esperado = ((46786.14 - 42641.37) + (40631 - 32740)) / 2;
    expect(r.sedes[0].resultado3m).toBeCloseTo(esperado, 0);
  });
});

describe("qué mejoró y qué empeoró: números, no adjetivos", () => {
  it("máximo 3 de cada lado, ordenados por soles", () => {
    const r = resumen();
    expect(r.mejoro.length).toBeLessThanOrEqual(3);
    expect(r.empeoro.length).toBeLessThanOrEqual(3);
    const pesos = r.empeoro.map((m) => m.peso);
    expect([...pesos].sort((a, b) => b - a)).toEqual(pesos);
  });

  it("un gasto que SUBE es un empeoramiento, uno que baja es una mejora", () => {
    const r = resumen();
    const fonaviGasto = [...r.mejoro, ...r.empeoro].find((m) => m.texto.includes("Fonavi") && m.texto.includes("gasto"));
    // Fonavi pasó de S/28,095 a S/43,049: subió, va del lado malo.
    expect(r.empeoro.some((m) => m.texto.includes("Fonavi") && m.texto.includes("gasto"))).toBe(true);
    expect(fonaviGasto!.texto).toContain("subió");
  });

  it("no reporta cambios menores a S/1,000: ruido, no señal", () => {
    const casiIgual = [unidad(3, "Centro", mb("2026-08", 40000, 30000), [mb("2026-07", 39500, 30200)])];
    const r = resumen(casiIgual);
    expect(r.mejoro).toEqual([]);
    expect(r.empeoro).toEqual([]);
  });
});

describe("los datos incompletos mandan sobre todo lo demás", () => {
  it("con cobertura no confiable, el titular NO afirma nada del negocio", () => {
    const aviso = "Faltan datos de Agosto: Atelier (faltan 6 días de venta).";
    const r = resumen(GRUPO, cob(false, aviso));
    expect(r.titular).toBe(aviso);
    expect(r.titular).not.toContain("cerró con");
  });
});
