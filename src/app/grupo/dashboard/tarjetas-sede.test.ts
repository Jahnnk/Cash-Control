import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TarjetasSede } from "./tarjetas-sede";
import { cifrasDeSede } from "@/lib/seis-cifras";

const sede = (businessId: number, nombre: string, ventas: number, costos: number, gastos: number) => cifrasDeSede({
  businessId, sede: nombre, mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
  filas: [{ categoria: "INSUMOS", propio: costos, monto: costos }, { categoria: "PLANILLA", propio: gastos, monto: gastos }],
  ventas, caja: { entro: ventas, salio: costos + gastos }, cobrado: ventas - 100, ingresadoVentas: ventas - 100,
  ingresosFuera: { devolucionesSedes: 100, prestamos: 0, rescates: 0, otros: 0, devolucionesGastos: 0 },
});

describe("tarjetas de sede del Resumen (rediseño)", () => {
  const html = renderToStaticMarkup(createElement(TarjetasSede, {
    cifras: { mes: "2026-09", sedes: [sede(2, "Fonavi", 37294, 17148, 13538), sede(1, "Atelier", 36285, 18013, 23129)] } as never, periodo: "setiembre 2026",
    cajaHref: "/grupo/reportes?mes=2026-09",
    extras: { 2: { href: "/fonavi/dashboard", flag: "mejor", cubiertosPct: 121, pie: null }, 1: { href: "/atelier/dashboard", flag: "atencion", cubiertosPct: 87, pie: null } },
  }));
  it("las cuatro barras, las tres cifras y la caja del mes", () => {
    for (const t of ["Ventas", "Costos", "Gastos", "Ganancia real", "Margen", "Costos cubiertos", "Caja del mes", "Ingresado por ventas", "Otras entradas", "Total que entró", "S/ 37,294", "S/ 6,608", "121%", "Mejor rendimiento", "Atención"]) expect(html).toContain(t);
  });
  it("la pérdida se ve en rojo con su signo", () => {
    expect(html).toContain("−S/ 4,857");
  });
});
