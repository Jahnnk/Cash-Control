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
  revisionSemanal: { pendiente: true, desde: "2026-09-28", hasta: "2026-10-04" },
  cobrosAtelier: { diasDesdeCarga: 59, porCobrar: 6203 },
};

describe("necesita tu atención", () => {
  it("agrupa las diferencias con el Excel en un solo aviso", () => {
    const a = construirAtencion(base);
    const cuadre = a.filter((x) => x.id === "cuadre");
    expect(cuadre).toHaveLength(1);
    expect(cuadre[0].titulo).toBe("4 diferencias entre el sistema y el Excel");
    expect(cuadre[0].detalle).toContain("Fonavi, Centro, Atelier");
  });
  it("no avisa caídas con menos de una semana comparada ni faltas de un solo día", () => {
    const a = construirAtencion(base);
    expect(a.some((x) => x.id === "caida-atelier")).toBe(false);
    expect(a.find((x) => x.id === "registro")!.titulo).toBe("Atelier: faltan registrar 4 días de ventas");
  });
  it("ordena lo urgente primero y deja todo en orden cuando no hay nada", () => {
    const a = construirAtencion({ ...base, sedes: base.sedes.map((s) => (s.code === "fonavi" ? { ...s, equilibrioEnRiesgo: true } : s)) });
    expect(a[0].id).toBe("equilibrio-fonavi");
    expect(a.map((x) => x.id)).toEqual(["equilibrio-fonavi", "revision-semanal", "registro", "cobros-atelier", "cuadre"]);
    expect(construirAtencion({ ...base, cuadres: [], revisionSemanal: null, cobrosAtelier: { diasDesdeCarga: 2, porCobrar: 0 }, sedes: [] })).toEqual([]);
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
});
