import { describe, expect, it } from "vitest";
import { admiteCandado, candadosDe, pisoOtrosFijos } from "../candados";
import { planDesdePalancas } from "../palancas-presupuesto";
import { paraLlegar } from "../palancas";
import type { Linea } from "../presupuesto";

describe("candados del presupuesto (Jahnn, 16-nov-2026: el alquiler va por contrato y los sueldos no se rebajan)", () => {
  it("alquiler y planilla llevan candado por defecto; lo guardado los corrige", () => {
    expect(candadosDe([])).toEqual(["ALQUILER", "PLANILLA"]);
    expect(candadosDe([{ categoria: "PLANILLA", bloqueado: false }, { categoria: "SERVICIOS", bloqueado: true }])).toEqual(["ALQUILER", "SERVICIOS"]);
  });

  it("solo la planilla y los otros fijos admiten candado (no el costo variable ni los impuestos)", () => {
    expect(admiteCandado("ALQUILER")).toBe(true);
    expect(admiteCandado("PLANILLA")).toBe(true);
    expect(admiteCandado("INSUMOS")).toBe(false);
    expect(admiteCandado("IMPUESTOS")).toBe(false);
    expect(candadosDe([{ categoria: "INSUMOS", bloqueado: true }])).toEqual(["ALQUILER", "PLANILLA"]);
  });

  it("el piso de la perilla 4 = lo que suman los otros fijos con candado (sin la planilla)", () => {
    expect(pisoOtrosFijos(["ALQUILER", "PLANILLA", "SERVICIOS"], { ALQUILER: 2500, PLANILLA: 10000, SERVICIOS: 420.4 })).toBe(2920);
  });

  it("el alquiler con candado queda en su monto real y el recorte se reparte entre los demás", () => {
    const sugerido: Linea[] = [
      { categoria: "ALQUILER", modo: "soles", valor: 2500 },
      { categoria: "SERVICIOS", modo: "soles", valor: 600 },
      { categoria: "MANTENIMIENTO", modo: "soles", valor: 400 },
    ];
    const p = { ventas: 40000, variablePct: 40, planilla: 10000, otrosFijos: 3000, utilidadPct: 25 };
    const r = planDesdePalancas(p, sugerido, { ventaEsperada: null, lineas: [] }, { ALQUILER: 2500 });
    const monto = (c: string) => r.lineas.find((l) => l.categoria === c)?.valor;
    expect(monto("ALQUILER")).toBe(2500);
    expect(monto("SERVICIOS")! + monto("MANTENIMIENTO")!).toBe(500);
    // Sin candado, el alquiler bajaría con todo lo demás.
    const sin = planDesdePalancas(p, sugerido, { ventaEsperada: null, lineas: [] });
    expect(sin.lineas.find((l) => l.categoria === "ALQUILER")!.valor).toBeLessThan(2500);
  });

  it("«Solo recortando fijos» dice que no alcanza si la meta pide bajar de lo que tiene candado", () => {
    const p = { ventas: 37504, variablePct: 52.6, planilla: 10612, otrosFijos: 3383, utilidadPct: 25 };
    expect(paraLlegar(p, 25)[2].valor).not.toBeNull();
    expect(paraLlegar(p, 25, 10612 + 2500)[2].valor).toBeNull();
  });
});
