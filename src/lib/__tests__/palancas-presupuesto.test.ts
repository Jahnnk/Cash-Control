import { describe, expect, it } from "vitest";
import { grupoDe, planDesdePalancas, rutaDe90Dias } from "../palancas-presupuesto";
import type { Linea } from "../presupuesto";

const sugerido: Linea[] = [
  { categoria: "INSUMOS", modo: "pct", valor: 30 }, { categoria: "PRODUCTOS ATELIER", modo: "pct", valor: 15 }, { categoria: "PACKAGING", modo: "pct", valor: 5 },
  { categoria: "IMPUESTOS", modo: "pct", valor: 1.5 },
  { categoria: "PLANILLA", modo: "soles", valor: 10000 }, { categoria: "ALQUILER", modo: "soles", valor: 2000 }, { categoria: "SERVICIOS", modo: "soles", valor: 1000 },
  { categoria: "PRÉSTAMOS Y TARJETAS", modo: "soles", valor: 1160 }, { categoria: "AHORRO", modo: "soles", valor: 500 },
];
const palancas = { ventas: 40000, variablePct: 40, planilla: 9000, otrosFijos: 2400, utilidadPct: 25 };
const sinPlan = { ventaEsperada: null, lineas: [] };
const valor = (ls: Linea[], c: string) => ls.find((l) => l.categoria === c)?.valor;

describe("de las palancas al presupuesto", () => {
  it("cada categoría cae en el grupo de su palanca; impuestos, deudas y ahorro no se mueven", () => {
    expect(sugerido.map(grupoDe)).toEqual(["variable", "variable", "variable", "sinMover", "planilla", "otrosFijos", "otrosFijos", "sinMover", "sinMover"]);
  });
  it("escala cada grupo hasta sumar lo que marca su palanca, con la mezcla del historial", () => {
    const r = planDesdePalancas(palancas, sugerido, sinPlan);
    expect(r.ventaEsperada).toBe(40000);
    // 50% del historial → 40%: cada categoría baja en la misma proporción.
    expect([valor(r.lineas, "INSUMOS"), valor(r.lineas, "PRODUCTOS ATELIER"), valor(r.lineas, "PACKAGING")]).toEqual([24, 12, 4]);
    expect(valor(r.lineas, "PLANILLA")).toBe(9000);
    // 3,000 del historial → 2,400.
    expect([valor(r.lineas, "ALQUILER"), valor(r.lineas, "SERVICIOS")]).toEqual([1600, 800]);
    // Lo que no es costo de operar queda igual.
    expect([valor(r.lineas, "IMPUESTOS"), valor(r.lineas, "PRÉSTAMOS Y TARJETAS"), valor(r.lineas, "AHORRO")]).toEqual([1.5, 1160, 500]);
    expect(r.sinRepartir).toBe(0);
  });
  it("el redondeo no descuadra: los grupos suman exactamente la palanca", () => {
    const r = planDesdePalancas({ ...palancas, variablePct: 37.7, otrosFijos: 3383 }, sugerido, sinPlan);
    const suma = (cats: string[]) => Math.round(cats.reduce((t, c) => t + (valor(r.lineas, c) ?? 0), 0) * 10) / 10;
    expect(suma(["INSUMOS", "PRODUCTOS ATELIER", "PACKAGING"])).toBe(37.7);
    expect(suma(["ALQUILER", "SERVICIOS"])).toBe(3380); // a S/10
  });
  it("conserva lo que ya decía el plan del mes para lo que no se mueve, y el tope del administrador sin pasar del nuevo monto", () => {
    const actual = { ventaEsperada: 38000, lineas: [
      { categoria: "INSUMOS", modo: "pct" as const, valor: 32, topeCaja: 12000 }, { categoria: "SERVICIOS", modo: "soles" as const, valor: 1200, topeCaja: 300 },
      { categoria: "PRÉSTAMOS Y TARJETAS", modo: "soles" as const, valor: 1815 },
    ] };
    const r = planDesdePalancas(palancas, sugerido, actual);
    expect(r.lineas.find((l) => l.categoria === "INSUMOS")).toMatchObject({ valor: 24, topeCaja: 9600 }); // 24% de 40,000: el tope baja con el monto
    expect(r.lineas.find((l) => l.categoria === "SERVICIOS")).toMatchObject({ valor: 800, topeCaja: 300 });
    expect(valor(r.lineas, "PRÉSTAMOS Y TARJETAS")).toBe(1815); // manda el plan del mes, no el historial
    expect(valor(r.lineas, "AHORRO")).toBeUndefined();
    const insumos = r.cambios.find((c) => c.categoria === "INSUMOS")!;
    expect(insumos).toMatchObject({ grupo: "variable", antes: 12160, ahora: 9600 });
    expect(r.cambios.find((c) => c.categoria === "PLANILLA")).toMatchObject({ antes: null, ahora: 9000 });
  });
  it("sin historial de variables todo va a INSUMOS; sin historial de fijos avisa lo que no pudo repartir", () => {
    const r = planDesdePalancas(palancas, [{ categoria: "PLANILLA", modo: "soles", valor: 10000 }], sinPlan);
    expect(valor(r.lineas, "INSUMOS")).toBe(40);
    expect(r.sinRepartir).toBe(2400);
  });
  it("ruta de 90 días: tres escalones parejos hasta la meta", () => {
    expect(rutaDe90Dias(10.1, 25)).toEqual([15, 20, 25]);
    expect(rutaDe90Dias(16, 25)).toEqual([19, 22, 25]);
    expect(rutaDe90Dias(26, 25)).toEqual([]);
  });
});
