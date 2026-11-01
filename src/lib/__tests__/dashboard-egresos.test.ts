/**
 * Sección 3 del Dashboard (1-nov-2026): la pestaña «Resumen fijo vs variable» de Jahnn. Las cifras reproducen su
 * pestaña de Centro en setiembre (sin datos personales; el repo es público).
 */
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../../app/actions/egresos-por-tipo", () => ({ getEgresosPorTipo: vi.fn() }));
import { EgresosCuerpo } from "../../app/grupo/dashboard/egresos-seccion";
import { vistaEgresos } from "../dashboard-egresos";
import type { EgresosPorTipo, TipoEgreso } from "../egresos-por-tipo";

const t = (tipo: TipoEgreso, monto: number, total: number) => ({ tipo, monto, pct: Math.round((monto / total) * 1000) / 10 });
const c = (categoria: string, tipo: TipoEgreso, monto: number, total: number) => ({ categoria, tipo, monto, pct: Math.round((monto / total) * 1000) / 10 });

function centro(): EgresosPorTipo {
  const T = 44906.85;
  return {
    businessId: 3, sede: "Centro", mes: "2026-09", totalEgresos: T, ingresos: 43984.61,
    tipos: [t("Fijo", 18289.96, T), t("Variable", 16305.14, T), t("Financiamiento", 0, T), t("Inversión", 231, T), t("No es gasto", 10017.56, T), t("Por conciliar", 63.19, T)],
    fijoMasVariable: 34595.1, fijoPctIngresos: 41.6, variablePctIngresos: 37.1,
    categorias: [
      c("PLANILLA", "Fijo", 12276.55, T), c("ALQUILER", "Fijo", 3106.8, T), c("SERVICIOS", "Fijo", 1234.91, T), c("CAJA CHICA", "Fijo", 508.2, T),
      c("MANTENIMIENTO", "Fijo", 485, T), c("OFICINA Y SISTEMAS", "Fijo", 295.46, T), c("CONTABILIDAD Y ASESORÍAS", "Fijo", 150, T), c("LIMPIEZA", "Fijo", 144.8, T), c("PERSONAL", "Fijo", 88.24, T),
      c("PRODUCTOS ATELIER", "Variable", 9318.18, T), c("INSUMOS", "Variable", 6238.76, T), c("PACKAGING", "Variable", 419, T), c("DELIVERY Y FLETES", "Variable", 272.5, T), c("SS BANCARIOS", "Variable", 56.7, T),
      c("EQUIPOS", "Inversión", 231, T),
      c("AHORRO", "No es gasto", 7200, T), c("UTILIDADES A SOCIOS", "No es gasto", 2400, T), c("DEVOLUCIONES", "No es gasto", 417.56, T),
      c("POR CONCILIAR (TIPO CRUZADO)", "Por conciliar", 63.19, T),
    ],
    puente: { fijo: { desde: 0, lineas: [], hasta: 0, seisCifras: 0, sinExplicar: 0 }, variable: { desde: 0, lineas: [], hasta: 0, seisCifras: 0, sinExplicar: 0 } },
    control: 0,
  };
}

describe("vistaEgresos — Centro, setiembre", () => {
  const v = vistaEgresos([centro()], 3)!;
  it("el total y las dos tarjetas de arriba", () => {
    expect(v.total).toBe(44906.85);
    expect(v.operativos).toEqual({ monto: 34595.1, pct: 77 });
    expect(v.noGasto).toEqual({ monto: 10017.56, pct: 22.3 });
  });
  it("las cuatro familias, con % de las salidas", () => {
    expect(v.familias.map((f) => [f.etiqueta, f.monto, f.pct])).toEqual([
      ["Costos fijos", 18289.96, 40.7], ["Costos variables", 16305.14, 36.3], ["Inversiones", 231, 0.5], ["Financiamiento", 0, 0],
    ]);
  });
  it("el detalle va de mayor a menor y con nombres legibles", () => {
    expect(v.familias[0].categorias.slice(0, 3).map((x) => x.nombre)).toEqual(["Planilla", "Alquiler", "Servicios"]);
    expect(v.familias[0].categorias[0].pctFamilia).toBe(67.1);
    expect(v.familias[1].categorias[0].nombre).toBe("Productos Atelier");
  });
  it("la barra omite lo que está en cero y hay desglose de los seis tipos", () => {
    expect(v.barra.map((b) => b.clave)).toEqual(["fijos", "variables", "inversiones", "noGasto", "pendiente"]);
    expect(v.detalles.map((d) => d.etiqueta)).toEqual(["Costos fijos", "Costos variables", "Inversiones", "Financiamiento", "No es gasto", "Por conciliar"]);
    expect(v.detalles[4].categorias.map((x) => x.nombre)).toEqual(["Ahorro", "Utilidades a socios", "Devoluciones"]);
    expect(v.hayPendiente).toBe(true);
    expect(v.control).toBe(0);
  });
  it("«Por conciliar» dice qué movimiento es, de qué día y en qué fila del Excel", () => {
    const e = { ...centro(), pendientes: [{ fecha: "2026-09-12", concepto: "DEPÓSITO POR VENTAS EN EFECTIVO", monto: 63.19, fila: 114 }] };
    const p = vistaEgresos([e], 3)!.detalles[5];
    expect(p.categorias).toEqual([{ nombre: "Depósito por ventas en efectivo · 12/09 · fila 114", monto: 63.19, pctFamilia: 100 }]);
  });
});

describe("vistaEgresos — grupo", () => {
  it("suma las sedes y junta las categorías iguales", () => {
    const a = centro();
    const b = { ...centro(), businessId: 2, sede: "Fonavi" };
    const v = vistaEgresos([a, b], null)!;
    expect(v.nombre).toBe("Grupo Yayi's");
    expect(v.total).toBe(89813.7);
    expect(v.familias[0].categorias[0]).toMatchObject({ nombre: "Planilla", monto: 24553.1 });
    expect(v.operativos.pct).toBe(77);
  });
  it("sede sin datos → null", () => {
    expect(vistaEgresos([centro()], 1)).toBeNull();
  });
});

describe("la pantalla de la sección 3", () => {
  const render = (sede: number | null, enCurso: boolean, datos: EgresosPorTipo[] | null | undefined) =>
    renderToStaticMarkup(createElement(EgresosCuerpo, { sedes: datos, sede, enCurso, cajaHref: "/grupo/reportes" }));
  const html = (sede: number | null, enCurso = false) => render(sede, enCurso, [centro()]);
  it("el diseño de Jahnn: total, dos tarjetas, barra, 4 familias, detalle y conciliación", () => {
    const h = html(3);
    for (const t of ["Total de salidas de dinero", "S/ 44,906.85", "Costos operativos", "S/ 34,595.10", "77.0% del total", "Movimientos no considerados gasto", "22.3% del total",
      "Distribución de las salidas de dinero", "Costos fijos", "S/ 18,289.96", "40.7% de salidas", "Financiamiento",
      "Categorías", "Participación", "Planilla", "S/ 12,276.55", "Detalle por tipo de egreso", "Costos variables", "S/ 16,305.14", "No es gasto", "S/ 10,017.56", "Por conciliar", "S/ 63.19", "Revisar", "36.3% de salidas"]) expect(h).toContain(t);
  });
  it("mes abierto avisa que faltan pagos; mes cerrado no", () => {
    expect(html(3, true)).toContain("faltan pagos de fin de mes");
    expect(html(3, false)).not.toContain("faltan pagos de fin de mes");
  });
  it("cargando, sin datos y sin egresos", () => {
    expect(render(3, false, undefined)).toContain("Cargando los egresos");
    expect(render(3, false, null)).toContain("falta el Excel de Finanzas");
    expect(html(1)).toContain("falta el Excel de Finanzas");
  });
});
