/**
 * "¿Qué debo hacer hoy?" — las reglas que deciden si vale interrumpir
 * al CEO. La disciplina importa: un panel que inventa tareas para no
 * verse vacío entrena a ignorarlo.
 */
import { describe, it, expect } from "vitest";
import { buildTodayActions, type ActionsInput } from "../today-actions";

const sede = (over: Partial<ActionsInput["sedes"][0]> = {}): ActionsInput["sedes"][0] => ({
  nombre: "Fonavi", code: "fonavi", deltaPct: -2, diasComparados: 25,
  coberturaBaja: false, equilibrioPct: 120, equilibrioEnRiesgo: false, ...over,
});

describe("buildTodayActions", () => {
  it("todo en orden → ninguna acción (no inventa trabajo)", () => {
    expect(buildTodayActions({ cargas: [{ nombre: "Fonavi", nivel: "verde", diasDesdeCarga: 2 }], sedes: [sede()] }))
      .toEqual([]);
  });

  it("carga faltante es lo más urgente: sin datos todo se decide a ciegas", () => {
    const a = buildTodayActions({
      cargas: [{ nombre: "Atelier", nivel: "rojo", diasDesdeCarga: 20 }],
      sedes: [sede({ deltaPct: -30, coberturaBaja: false })],
    });
    expect(a[0].severity).toBe("critico");
    expect(a[0].title).toContain("carga de Atelier");
    expect(a[0].detail).toContain("20 días");
  });

  it("una caída fuerte con comparativo confiable sí interrumpe", () => {
    const a = buildTodayActions({ cargas: [], sedes: [sede({ nombre: "Atelier", code: "atelier", deltaPct: -28.5 })] });
    expect(a[0].title).toContain("ventas de Atelier");
    expect(a[0].detail).toContain("-28.5%");
    expect(a[0].href).toBe("/atelier/dashboard");
  });

  it("la MISMA caída con cobertura baja NO se presenta como alarma", () => {
    const a = buildTodayActions({
      cargas: [],
      sedes: [sede({ nombre: "Centro", code: "centro", deltaPct: -28.5, diasComparados: 7, coberturaBaja: true })],
    });
    expect(a.find((x) => x.id.startsWith("caida-"))).toBeUndefined();
    expect(a[0].severity).toBe("info");
    expect(a[0].title).toContain("Completa el mes pasado");
  });

  it("sede bajo el equilibrio se avisa con el % que lleva", () => {
    const a = buildTodayActions({
      cargas: [],
      sedes: [sede({ equilibrioPct: 72, equilibrioEnRiesgo: true })],
    });
    expect(a[0].severity).toBe("atencion");
    expect(a[0].detail).toContain("72%");
  });

  it("nunca más de 3, y siempre lo crítico primero", () => {
    const a = buildTodayActions({
      cargas: [
        { nombre: "Atelier", nivel: "rojo", diasDesdeCarga: 20 },
        { nombre: "Centro", nivel: "rojo", diasDesdeCarga: 15 },
      ],
      sedes: [
        sede({ nombre: "Fonavi", code: "fonavi", deltaPct: -20 }),
        sede({ nombre: "Centro", code: "centro", equilibrioPct: 60, equilibrioEnRiesgo: true }),
      ],
    });
    expect(a).toHaveLength(3);
    expect(a.every((x) => x.severity === "critico")).toBe(true);
  });

  it("equilibrio ya cubierto no genera ruido", () => {
    const a = buildTodayActions({ cargas: [], sedes: [sede({ equilibrioPct: 105, equilibrioEnRiesgo: true })] });
    expect(a).toEqual([]);
  });
});
