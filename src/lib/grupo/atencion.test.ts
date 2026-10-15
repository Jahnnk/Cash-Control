import { describe, expect, it } from "vitest";
import { construirAtencion, type EntradaAtencion } from "./atencion";

const base: EntradaAtencion = {
  hoy: "2026-10-08",
  sedes: [
    { nombre: "Centro", code: "centro", deltaPct: 6.4, diasComparados: 7, coberturaBaja: false, diasSinRegistrar: 0, equilibrioEnRiesgo: false, equilibrioPct: 33, diasConDatos: 7 },
    { nombre: "Fonavi", code: "fonavi", deltaPct: -5.1, diasComparados: 6, coberturaBaja: false, diasSinRegistrar: 1, equilibrioEnRiesgo: false, equilibrioPct: 25, diasConDatos: 7 },
    { nombre: "Atelier", code: "atelier", deltaPct: -23.4, diasComparados: 2, coberturaBaja: false, diasSinRegistrar: 4, equilibrioEnRiesgo: false, equilibrioPct: 7, diasConDatos: 3 },
  ],
  cuadres: [{ sede: "Fonavi", mes: "2026-10", alertas: 1 }, { sede: "Centro", mes: "2026-09", alertas: 1 }, { sede: "Atelier", mes: "2026-09", alertas: 2 }],
  excelPendiente: null,
  highlightsSinAsignar: ["Fonavi", "Centro", "Atelier"],
  presupuesto: { mesActualSinAprobar: 0, siguienteSinAprobar: 3, totalSedes: 3, diasRestantes: 16, mesSiguiente: "2026-11" },
  cobrosAtelier: { diasDesdeCarga: 59, porCobrar: 6203 },
};

describe("necesita tu atención", () => {
  it("agrupa las diferencias con el Excel en un solo aviso", () => {
    const a = construirAtencion(base);
    const cuadre = a.filter((x) => x.id === "cuadre");
    expect(cuadre).toHaveLength(1);
    expect(cuadre[0].titulo).toBe("3 cargas del Excel con diferencias");
    expect(cuadre[0].detalle).toContain("Fonavi octubre, Centro setiembre, Atelier setiembre");
  });
  it("no avisa caídas con menos de una semana comparada ni faltas de un solo día", () => {
    const a = construirAtencion(base);
    expect(a.some((x) => x.id === "caida-atelier")).toBe(false);
    expect(a.find((x) => x.id === "registro")!.titulo).toBe("Atelier: faltan registrar 4 días de ventas");
  });
  it("ordena lo urgente primero y deja todo en orden cuando no hay nada", () => {
    const a = construirAtencion({ ...base, sedes: base.sedes.map((s) => (s.code === "fonavi" ? { ...s, equilibrioEnRiesgo: true } : s)) });
    expect(a[0].id).toBe("equilibrio-fonavi");
    expect(a.map((x) => x.id)).toEqual(["equilibrio-fonavi", "highlight", "registro", "cobros-atelier", "cuadre"]);
    expect(construirAtencion({ ...base, cuadres: [], highlightsSinAsignar: [], presupuesto: null, cobrosAtelier: { diasDesdeCarga: 2, porCobrar: 0 }, sedes: [] })).toEqual([]);
  });
  it("no alarma el equilibrio con menos de una semana de ventas cargada", () => {
    const a = construirAtencion({ ...base, sedes: base.sedes.map((s) => ({ ...s, equilibrioEnRiesgo: true })) });
    expect(a.some((x) => x.id === "equilibrio-atelier")).toBe(false);
    expect(a.some((x) => x.id === "equilibrio-fonavi")).toBe(true);
  });
  it("caída real de ventas con una semana comparada", () => {
    const a = construirAtencion({ ...base, sedes: [{ ...base.sedes[2], diasComparados: 8, diasSinRegistrar: 0 }] });
    expect(a[0]).toMatchObject({ id: "caida-atelier", nivel: "alto", titulo: "Atelier vende 23% menos que el mes pasado" });
  });

  it("avisa solo lo que el sistema comprueba: Highlight sin asignar y presupuesto sin aprobar", () => {
    const sinNada = { ...base, cuadres: [], cobrosAtelier: null, sedes: [] };
    const hl = construirAtencion({ ...sinNada, highlightsSinAsignar: ["Fonavi"], presupuesto: null }).find((x) => x.id === "highlight");
    expect(hl?.detalle).toBe("Falta en Fonavi.");
    expect(construirAtencion({ ...sinNada, highlightsSinAsignar: ["Fonavi", "Centro", "Atelier"], presupuesto: null })[0].detalle).toMatch(/Ninguna sede/);
    // Sin pendientes no inventa tareas.
    expect(construirAtencion({ ...sinNada, highlightsSinAsignar: [], presupuesto: null })).toEqual([]);
  });

  it("el presupuesto del mes siguiente solo se pide en los últimos 5 días; el del mes en curso, siempre", () => {
    const sinNada = { ...base, cuadres: [], cobrosAtelier: null, sedes: [], highlightsSinAsignar: [] };
    const pr = { mesActualSinAprobar: 0, siguienteSinAprobar: 3, totalSedes: 3, mesSiguiente: "2026-11" };
    expect(construirAtencion({ ...sinNada, presupuesto: { ...pr, diasRestantes: 16 } })).toEqual([]);
    const cerca = construirAtencion({ ...sinNada, presupuesto: { ...pr, diasRestantes: 4 } });
    expect(cerca.map((x) => x.id)).toEqual(["presupuesto-siguiente"]);
    expect(cerca[0].titulo).toBe("Aprueba el presupuesto de noviembre");
    const actual = construirAtencion({ ...sinNada, presupuesto: { ...pr, mesActualSinAprobar: 2, siguienteSinAprobar: 0, diasRestantes: 16 } });
    expect(actual[0]).toMatchObject({ id: "presupuesto-mes", detalle: expect.stringContaining("2 de 3 sedes") });
  });
});
