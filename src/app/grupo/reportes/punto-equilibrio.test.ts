import { describe, it, expect, vi } from "vitest";
vi.mock("@neondatabase/serverless", () => ({ neon: () => () => Promise.resolve([]) }));
vi.mock("@/lib/session-access", () => ({ getSessionRole: vi.fn(async () => null), requireFullSession: vi.fn(async () => false) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VistaPuntoEquilibrio } from "./punto-equilibrio";
import type { EquilibrioSede } from "@/app/actions/breakeven";

const sede = (businessId: number, nombre: string, fijos: number, varRatio: number, ventas: number, ticket: number | null): EquilibrioSede => ({
  businessId, sede: nombre, mes: "2026-09", enCurso: false, ventasALaFecha: ventas, ventasBase: "mes", ventasHasta: "2026-09-30",
  ticketDe: ticket ? "2026-09" : null, unidad: businessId === 1 ? "pedidos" : "ventas",
  base: { fijos, varRatio, ventas, ticket, diasDelMes: 30, financiamiento: 1000 },
  referencia: { pe: 27000, meses: ["2026-04", "2026-05"] },
  historial: [{ month: "2026-09", ventas, variables: ventas * varRatio, fijos, puntoEquilibrio: fijos / (1 - varRatio), utilidadOperativa: ventas * (1 - varRatio) - fijos, sobreEquilibrio: true, enCurso: false, puntoEquilibrioConDeudas: null, financiamiento: 1000, excel: 25408, sinTipo: 0, porReferencia: false, mesesReferencia: null }],
  avisos: [],
});
const datos = { 2: sede(2, "Fonavi", 13820, 0.462, 37294, 30.47), 3: sede(3, "Centro", 18334, 0.394, 41336, 42.75), 1: sede(1, "Atelier", 18678, 0.519, 36285, 193.01) };
const ver = (sedeInicial: number) => renderToStaticMarkup(createElement(VistaPuntoEquilibrio, { datos, periodo: "setiembre 2026", abiertaAlInicio: true, sedeInicial }));

describe("sección Punto de equilibrio", () => {
  it("cerrada, el resumen dice qué tan lejos está cada sede de su piso", () => {
    const html = renderToStaticMarkup(createElement(VistaPuntoEquilibrio, { datos, periodo: "setiembre 2026" }));
    expect(html).toMatch(/Fonavi: ✓ [\d.,]+% sobre su piso/);
    expect(html).toMatch(/Atelier: ✕ [\d.,]+% debajo de su piso/);
    expect(html).not.toContain("Cómo se calcula");
  });

  it("abierta: la frase, las cuatro cifras, la gráfica, la tabla del libro, el historial y el simulador", () => {
    const html = ver(2);
    expect(html).toContain("necesita vender");
    for (const t of ["Piso del mes", "Ventas necesarias", "Margen de seguridad", "Incluyendo deudas", "Punto de equilibrio:", "Ganancia", "Pérdida", "Cómo se calcula", "Precio promedio por venta", "Margen de contribución por venta", "Punto de equilibrio en número de ventas", "Mes a mes", "¿Y si…?", "Contratar a alguien", "Un mes difícil"]) {
      expect(html).toContain(t);
    }
  });

  it("Atelier: pedidos en vez de ventas, y debajo del piso dice cuánto perdió", () => {
    const html = ver(1);
    expect(html).toContain("Pedidos necesarios");
    expect(html).toContain("por debajo");
    expect(html).toContain("perdió unos");
  });

  it("sin datos de una sede lo dice en vez de inventar", () => {
    const html = renderToStaticMarkup(createElement(VistaPuntoEquilibrio, { datos: { ...datos, 3: { ...datos[3], base: null, avisos: ["Ese mes no tiene ventas o gastos fijos cargados."] } }, periodo: "setiembre 2026", abiertaAlInicio: true, sedeInicial: 3 }));
    expect(html).toContain("Ese mes no tiene ventas o gastos fijos cargados.");
    expect(html).not.toContain("Punto de equilibrio:");
  });
});
