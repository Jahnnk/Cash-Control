/**
 * El triángulo del valor (16-oct-2026): generar → entregar → capturar. Se clava que el paso actual
 * es el PRIMERO que no está en verde, que lo no medible no se acusa y que la eficiencia no se mezcla
 * con las señales de «generar valor».
 */
import { describe, it, expect } from "vitest";
import { trianguloDelValor } from "../triangulo-valor";
import { motoresDeSede, type Senal } from "../motores-ebitda";
import { regla33, profitFirst } from "../regla-33";
import { cifrasDeSede, cifrasDelGrupo } from "../seis-cifras";
import type { PisoSede } from "../productos/piso-precios";

const f = (categoria: string, monto: number) => ({ categoria, propio: monto, monto });
const cifras = (insumos: number, planilla: number, alquiler: number, ahorro = 0) => {
  const s = cifrasDeSede({
    businessId: 2, sede: "Fonavi", mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
    filas: [f("INSUMOS", insumos), f("PLANILLA", planilla), f("ALQUILER", alquiler), ...(ahorro ? [f("AHORRO", ahorro)] : [])],
    ventas: 30000, caja: { entro: 30000, salio: 0 }, cobrado: 30000,
  });
  return { sedes: [s], grupo: cifrasDelGrupo([s]) };
};
const sen = (clave: string, estado: Senal["estado"], paso?: Senal["paso"]): Senal => ({ clave, etiqueta: clave, estado, detalle: "x", paso });
const piso = (bajoPct: number, margen: number): PisoSede => ({ businessId: 2, sede: "Fonavi", mes: "2026-09", hasta: "2026-09-30", filas: [], conCosto: 100, sinInsumos: 0, bajo: 10, ventasBajoPct: bajoPct, margenCartaPct: margen, extraTotal: 0 });
function armar(c: ReturnType<typeof cifras>, senales: Senal[], p: PisoSede | null) {
  const regla = regla33(c)[0];
  const motores = motoresDeSede({ regla, ventas: { monto: 30000, esperada: 30000, mesAnterior: null }, senales });
  return trianguloDelValor({ motores, regla, profit: profitFirst(c)[0], piso: p });
}
// Un negocio sano: costos 30%, fijos 30%, EBITDA 40%, reserva completa (7,500 = 25%).
const SANO = cifras(9000, 6000, 3000, 7500);

describe("la secuencia: generar → entregar → capturar", () => {
  it("todo en verde: ya se puede pensar en crecer", () => {
    const t = armar(SANO, [sen("nps", "verde", "generar"), sen("mermas", "verde")], piso(5, 72));
    expect(t.pasos.map((p) => p.estado)).toEqual(["verde", "verde", "verde"]);
    expect(t.actual).toBeNull();
    expect(t.mensaje).toContain("ya se puede pensar en crecer");
  });

  it("el paso actual es el primero que no está en verde, aunque los siguientes también fallen", () => {
    const t = armar(cifras(14000, 9000, 2000), [sen("nps", "ambar", "generar"), sen("mermas", "rojo")], piso(5, 72));
    expect(t.pasos.map((p) => p.estado)).toEqual(["ambar", "rojo", "rojo"]);
    expect(t.actual).toBe("generar");
    expect(t.mensaje).toContain("No empujes ventas");
  });

  it("si generar y entregar están bien, el cuello de botella es capturar (las finanzas)", () => {
    const t = armar(cifras(14000, 9000, 2000), [sen("nps", "verde", "generar"), sen("mermas", "verde")], piso(5, 72));
    expect(t.actual).toBe("capturar");
    expect(t.mensaje).toContain("precios piso, costos fijos y la reserva");
  });

  it("si generar está bien y entregar falla, se ordena la operación antes de vender más", () => {
    const t = armar(SANO, [sen("nps", "verde", "generar"), sen("tiempos", "rojo")], piso(5, 72));
    expect(t.actual).toBe("entregar");
    expect(t.mensaje).toContain("ordena los procesos");
  });
});

describe("qué cuenta en cada paso", () => {
  it("NPS y ticket son «generar valor» y NO se mezclan con la eficiencia del sistema", () => {
    const t = armar(SANO, [sen("nps", "rojo", "generar"), sen("mermas", "verde")], null);
    expect(t.pasos[0].senales.map((s) => s.clave)).toEqual(["nps"]);
    expect(t.pasos[1].senales.map((s) => s.clave)).toEqual(["mermas"]);
    expect(t.pasos[1].estado).toBe("verde");   // el NPS rojo no lo arrastra
  });

  it("los precios sostenidos (lo vendido sobre el piso de precios) cuentan como valor generado", () => {
    const t = armar(SANO, [], piso(40, 72));
    const s = t.pasos[0].senales.find((x) => x.clave === "precios")!;
    expect(s.estado).toBe("rojo");   // solo 60% de lo vendido está sobre el piso: compite por precio bajo
    expect(s.detalle).toContain("60%");
  });

  it("capturar suma margen de la carta, EBITDA, costos fijos y planilla, y la reserva de Profit First", () => {
    const t = armar(SANO, [], piso(5, 72));
    expect(t.pasos[2].senales.map((s) => s.clave)).toEqual(["margen", "ebitda", "fijos", "profit"]);
  });

  it("la reserva sin apartar pone en rojo a capturar aunque todo lo demás esté sano", () => {
    const t = armar(cifras(9000, 6000, 3000, 0), [sen("nps", "verde", "generar"), sen("mermas", "verde")], piso(5, 72));
    expect(t.pasos[2].estado).toBe("rojo");
    expect(t.actual).toBe("capturar");
  });
});

describe("lo que no se puede medir no se acusa", () => {
  it("sin señales de generar valor, el paso queda en gris y no frena a los demás", () => {
    const t = armar(SANO, [sen("mermas", "verde")], null);
    expect(t.pasos[0].estado).toBe("gris");
    expect(t.actual).toBeNull();
    expect(t.mensaje).toContain("sin dato en generar valor");
  });

  it("sin ningún dato dice que todavía no se puede ubicar el paso", () => {
    const t = trianguloDelValor({ motores: null, regla: null, profit: null, piso: null });
    expect(t.pasos.every((p) => p.estado === "gris")).toBe(true);
    expect(t.mensaje).toBe("Todavía no hay datos para ubicar el paso en el que estás.");
  });
});
