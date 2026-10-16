/**
 * Proyección del presupuesto con la regla 33-33-33 (pedido de Jahnn, 15-oct-2026).
 * El ejemplo del coach: venta esperada S/57,000 → S/19,000 / S/19,000 / S/19,000; el 25% a utilidades.
 */
import { describe, it, expect } from "vitest";
import { proyectarPlan, proyectarGrupo } from "../proyeccion-presupuesto";
import { CONFIG_PROFIT_FIRST } from "../regla-33";
import type { Linea } from "../presupuesto";

const soles = (categoria: string, valor: number): Linea => ({ categoria, modo: "soles", valor });
const pctv = (categoria: string, valor: number): Linea => ({ categoria, modo: "pct", valor });

describe("el ejemplo del coach: S/57,000 de venta esperada", () => {
  // Un plan que cumple la regla exacta: insumos 33.33% (19,000), fijos 19,000 (planilla 14,000 = 24.6%, alquiler 5,000).
  const plan = [pctv("INSUMOS", 100 / 3), soles("PLANILLA", 14000), soles("ALQUILER", 5000)];

  it("la regla reparte S/19,000 / S/19,000 / S/19,000", () => {
    const p = proyectarPlan({ venta: 57000, lineas: plan })!;
    expect(p.costos).toMatchObject({ monto: 19000, meta: 19000, difMeta: 0 });
    expect(p.fijos).toMatchObject({ monto: 19000, meta: 19000, difMeta: 0 });
    expect(p.ebitda).toMatchObject({ monto: 19000, meta: 19000 });
    expect(p.termometro).toBe("eficiente");
  });

  it("Profit First: S/14,250 (25%) se apartan primero y queda ~8% para impuestos y reinversión", () => {
    const p = proyectarPlan({ venta: 57000, lineas: plan })!;
    expect(p.profitFirst).toMatchObject({ utilidadPct: 25, utilidad: 14250, resto: 4750, limiteOperacion: 42750, operacionPlan: 38000 });
    expect(p.profitFirst.restoPct).toBeCloseTo(8.33, 1);
    expect(p.profitFirst.cabe).toBe(true);
  });

  it("el piso diario con estos números es el del ejemplo: S/1,266.67", () => {
    expect(proyectarPlan({ venta: 57000, lineas: plan })!.piso).toMatchObject({ mes: 38000, dia: 1266.67 });
  });

  it("la planilla se mide contra su rango sano", () => {
    expect(proyectarPlan({ venta: 57000, lineas: plan })!.planilla).toMatchObject({ monto: 14000, pct: 24.6, estado: "sana" });
  });
});

describe("un plan que no cumple la regla", () => {
  // Insumos 40% (22,800), fijos 24,000 → EBITDA 10,200 (17.9%).
  const plan = [pctv("INSUMOS", 40), soles("PLANILLA", 17000), soles("ALQUILER", 7000), soles("IMPUESTOS", 500), soles("PRÉSTAMOS Y TARJETAS", 2000)];

  it("dice cuánto se pasa cada bloque y cuánto hay que bajar", () => {
    const p = proyectarPlan({ venta: 57000, lineas: plan })!;
    expect(p.costos.difMeta).toBe(3800);
    expect(p.fijos.difMeta).toBe(5000);
    expect(p.ajuste).toEqual({ costos: 3800, fijos: 5000 });
    expect(p.ebitda).toMatchObject({ monto: 10200, difMeta: 8800 });
    expect(p.termometro).toBe("en_camino");
  });

  it("la operación no cabe en el 75%: dice cuánto se pasa", () => {
    const p = proyectarPlan({ venta: 57000, lineas: plan })!;
    expect(p.profitFirst).toMatchObject({ operacionPlan: 46800, limiteOperacion: 42750, cabe: false, exceso: 4050 });
  });

  it("impuestos y cuotas de deuda quedan fuera de la regla (se muestran aparte)", () => {
    const p = proyectarPlan({ venta: 57000, lineas: plan })!;
    expect(p.impuestos).toBe(500);
    expect(p.fueraDeLaRegla).toBe(2000);
    // El EBITDA es antes de impuestos y deudas.
    expect(p.ebitda.monto).toBe(57000 - 22800 - 24000);
  });

  it("la planilla sobre su tope se marca alta", () => {
    expect(proyectarPlan({ venta: 57000, lineas: plan })!.planilla).toMatchObject({ pct: 29.8, estado: "alta" });
  });
});

describe("los ajustes del CEO se respetan", () => {
  const plan = [pctv("INSUMOS", 30), soles("PLANILLA", 12000), soles("ALQUILER", 5000)];

  it("con el EBITDA objetivo en 40%, costos y fijos se reparten el 60% (30% cada uno)", () => {
    const p = proyectarPlan({ venta: 50000, lineas: plan, config: { ...CONFIG_PROFIT_FIRST, ebitdaPct: 40 } })!;
    expect(p.costos.metaPct).toBe(30);
    expect(p.ebitda.metaPct).toBe(40);
  });

  it("con otra utilidad cambia lo que se aparta primero", () => {
    const p = proyectarPlan({ venta: 50000, lineas: plan, config: { ...CONFIG_PROFIT_FIRST, utilidadPct: 20 } })!;
    expect(p.profitFirst).toMatchObject({ utilidad: 10000, limiteOperacion: 40000 });
  });

  it("si el sueldo de los socios se paga de la utilidad, sale de los fijos del plan", () => {
    const en = proyectarPlan({ venta: 50000, lineas: plan, sueldoSocios: 1000 })!;
    const fuera = proyectarPlan({ venta: 50000, lineas: plan, sueldoSocios: 1000, config: { ...CONFIG_PROFIT_FIRST, sociosDeUtilidad: true } })!;
    expect(en.fijos.monto).toBe(17000);
    expect(fuera.fijos.monto).toBe(16000);
    expect(fuera.planilla.monto).toBe(11000);
  });
});

describe("sin base no se inventa", () => {
  it("sin venta esperada o sin líneas no hay proyección", () => {
    expect(proyectarPlan({ venta: null, lineas: [soles("PLANILLA", 1000)] })).toBeNull();
    expect(proyectarPlan({ venta: 50000, lineas: [] })).toBeNull();
    expect(proyectarPlan({ venta: 0, lineas: [soles("PLANILLA", 1000)] })).toBeNull();
  });
});

describe("el Grupo suma los planes y cuenta una sola vez lo que Atelier le vende a las cafeterías", () => {
  it("la venta y el costo de lo interno se descuentan", () => {
    const atelier = { businessId: 1, venta: 40000, lineas: [pctv("INSUMOS", 40), soles("PLANILLA", 12000)] };
    const fonavi = { businessId: 2, venta: 30000, lineas: [soles("PRODUCTOS ATELIER", 8000), pctv("INSUMOS", 10), soles("PLANILLA", 7000)] };
    const g = proyectarGrupo([atelier, fonavi])!;
    // Venta: 70,000 − 8,000 interno = 62,000. Costos: 16,000 (Atelier) + 8,000 + 3,000 (Fonavi) − 8,000 interno = 19,000.
    expect(g.venta).toBe(62000);
    expect(g.costos.monto).toBe(19000);
    expect(g.fijos.monto).toBe(19000);
  });

  it("sin ninguna sede con plan no hay proyección del grupo", () => {
    expect(proyectarGrupo([{ businessId: 2, venta: null, lineas: [] }])).toBeNull();
  });
});
