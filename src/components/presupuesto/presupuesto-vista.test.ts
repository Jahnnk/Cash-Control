import { describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/presupuesto", () => ({ getPresupuesto: vi.fn(), guardarPresupuesto: vi.fn(), aprobarPresupuesto: vi.fn() }));

import { Contenido } from "./presupuesto-vista";
import { EditorPresupuesto } from "./editor-presupuesto";
import { ToastProvider } from "@/components/toast-provider";
import type { DatosPresupuesto, SedePresupuesto } from "@/app/actions/presupuesto";

const sede = (o: Partial<SedePresupuesto> = {}): SedePresupuesto => ({
  businessId: 2, sede: "Fonavi",
  cabecera: { ventaEsperada: 40000, aprobadoEl: null, aprobadoPor: null, actualizadoEl: "2026-09-28 10:00:00", actualizadoPor: "jahnn", cajaEnviadoEl: null, cajaError: null },
  lineas: [{ categoria: "PLANILLA", modo: "soles", valor: 10000 }, { categoria: "INSUMOS", modo: "pct", valor: 20 }],
  real: { PLANILLA: 12000, INSUMOS: 7000, LIMPIEZA: 200 }, ventaReal: 38000, corte: "2026-09-30",
  historial: [{ mes: "2026-08", ventas: 40000, real: { PLANILLA: 10000, INSUMOS: 8000 } }],
  mesAnterior: { ventaEsperada: null, lineas: [] },
  caja: { meses: ["2026-08", "2026-09"], porCategoria: { INSUMOS: { "2026-08": 2100, "2026-09": 1900 } } }, ...o,
});
const datos = (sedes: SedePresupuesto[]): DatosPresupuesto => ({ mes: "2026-09", hoy: "2026-10-06", enCurso: false, avanceMes: 100, sedes, controlCaja: { configurado: true, error: null }, config: { utilidadPct: 25, ebitdaPct: 100 / 3, sociosDeUtilidad: false }, sueldoSocios: {} });
const render = (d: DatosPresupuesto, sedeFija = false) => renderToStaticMarkup(createElement(ToastProvider, null,
  createElement(Contenido, { datos: d, sedeFija, onIrAMes: () => {}, onAbrirEditor: () => {}, editor: createElement(EditorPresupuesto, { datos: d, onGuardado: () => {} }) })));

describe("Presupuesto (pantalla)", () => {
  test("muestra la jerarquía, las cuatro columnas, los desvíos y el editor", () => {
    const html = render(datos([sede(), sede({ businessId: 3, sede: "Centro", lineas: [], cabecera: null })]));
    for (const t of ["Yayi&#x27;s (las tres sedes)", "Presupuestado", "Real", "Variación", "Ejecución", "Se gastó", "Fonavi", "Centro"]) expect(html).toContain(t);
    expect(html).toContain("sin presupuesto en Centro");
    expect(html).toContain("Dónde se está yendo la plata fuera del plan");
    expect(html).toContain("Venta esperada del mes");
  });
  test("en una sede no muestra la fila de la empresa", () => {
    const html = render(datos([sede()]), true);
    expect(html).not.toContain("las tres sedes");
    expect(html).toContain("Fonavi");
  });
  test("mes en curso: dice cuánto QUEDA, no «de menos»", () => {
    const html = render({ ...datos([sede({ real: { PLANILLA: 3000 } })]), mes: "2026-10", enCurso: true, avanceMes: 26 }, true);
    expect(html).toContain("Usado del plan");
    expect(html).toContain("para el resto del mes");
    expect(html).toContain("Queda");
    expect(html).not.toContain("de menos");
  });
  test("la proyección 33-33-33 del plan: el EBITDA del plan contra la regla y lo que se aparta para utilidades", () => {
    const html = render(datos([sede()]), true);
    // Fonavi: venta esperada 40,000; insumos 20% = 8,000; planilla 10,000 → EBITDA 22,000 (55%); utilidad 25% = 10,000.
    for (const t of ["Proyección 33-33-33 del plan", "EBITDA del plan", "S/22,000", "55%", "aparta S/10,000 para utilidades"]) expect(html).toContain(t);
  });
  test("en el editor, la proyección se ve con la regla (S/13,333 por tercio) y Profit First", () => {
    const html = render(datos([sede()]), true);
    for (const t of ["Proyección 33-33-33 de Fonavi", "La regla", "S/13,333", "Profit First:", "S/10,000"]) expect(html).toContain(t);
  });
  test("sin venta esperada ni categorías no inventa nada: invita a escribirlas", () => {
    const html = render(datos([sede({ cabecera: null, lineas: [] })]), true);
    expect(html).toContain("Con la venta esperada y algunas categorías verás aquí");
  });
});
