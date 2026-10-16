import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/actions/estado-resultados", () => ({ getEstadoResultados: vi.fn(), getMovimientosCategoria: vi.fn() }));
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TablaEstadoResultados, EstadoResultados } from "./estado-resultados";
import { cifrasDeSede } from "@/lib/seis-cifras";

const sede = (businessId: number, nombre: string, mes: string, ventas: number) => cifrasDeSede({
  businessId, sede: nombre, mes, finDeMes: `${mes}-30`, corte: `${mes}-30`,
  filas: [{ categoria: "INSUMOS", propio: ventas * 0.4, monto: ventas * 0.4 }, { categoria: "PLANILLA", propio: ventas * 0.3, monto: ventas * 0.3 }, { categoria: "AHORRO", propio: 1000, monto: 1000 }],
  ventas, caja: { entro: ventas, salio: ventas * 0.7 + 1000 }, cobrado: ventas, ingresadoVentas: ventas,
  ingresosFuera: { devolucionesSedes: 0, prestamos: 0, rescates: 0, otros: 0, devolucionesGastos: 0 },
});
const meses = ["2026-08", "2026-09"].map((mes) => ({ mes, sedes: [sede(2, "Fonavi", mes, 37000), sede(3, "Centro", mes, 41000)] }));

describe("estado de resultados (pantalla)", () => {
  it("dibuja ventas → margen → EBITDA → ganancia, el sello de cada mes y lo que salió sin ser gasto", () => {
    const html = renderToStaticMarkup(createElement(TablaEstadoResultados, { datos: { hoy: "2026-10-16", meses }, vista: "grupo" }));
    for (const t of ["Ventas", "Margen bruto", "EBITDA", "Ganancia real", "✓ Conciliado", "Ahorro (fondos mutuos)", "S/ 78,000", "S/ 23,400", "30%"]) expect(html).toContain(t);
  });
  it("cerrada, el resumen dice el EBITDA del grupo del mes", () => {
    const html = renderToStaticMarkup(createElement(EstadoResultados, { cifras: { mes: "2026-09", sedes: meses[1].sedes } as never, mes: "2026-09", periodo: "setiembre 2026" }));
    expect(html).toContain("Estado de resultados · 6 meses");
    expect(html).toMatch(/Grupo, setiembre 2026: EBITDA <b[^>]*>S\/ 23,400/);
  });
});
