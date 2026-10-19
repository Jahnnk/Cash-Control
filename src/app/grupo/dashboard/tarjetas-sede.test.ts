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
  it("a primera vista: cuatro barras (Ventas, Dinero que entró, Dinero que salió, Ganancia) y el termómetro del EBITDA", () => {
    for (const t of ["Ventas", "Dinero que entró", "Dinero que salió", "Ganancia", "EBITDA", "Costos: S/ 17,148", "Gastos: S/ 13,538", "S/ 30,686", "Por ventas", "Otras entradas", "S/ 37,294", "S/ 6,608", "Ver el detalle", "Mínimo cubierto", "121%", "Mejor rendimiento", "Atención", "¿Qué significa cada palabra?"]) expect(html).toContain(t);
  });
  it("el EBITDA se ve como termómetro con su zona (Fonavi 17.7% = En camino; Atelier negativo = Frágil)", () => {
    expect(html).toContain("En camino");
    expect(html).toContain("Frágil");
    expect(html).toContain("Por cada S/ 100 vendidos");
  });
  it("ya no usa las palabras que se juntaban (Margen, Costos cubiertos, Caja del mes, Ganancia real, Plata)", () => {
    for (const t of ["Margen", "Costos cubiertos", "Caja del mes", "Ganancia real", "Plata que entró", "Ingresado por ventas"]) expect(html).not.toContain(t);
  });
  it("cada tarjeta dice hasta qué día cuenta: mes completo, o hasta el último día con Excel", () => {
    expect(html).toContain("mes completo");
    const aMedias = renderToStaticMarkup(createElement(TarjetasSede, {
      cifras: { mes: "2026-09", sedes: [{ ...sede(2, "Fonavi", 16491, 5200, 4100), corte: "2026-09-13" }] } as never, periodo: "setiembre 2026", cajaHref: "/x",
    }));
    expect(aMedias).toContain("hasta el 13/09 · último día con Excel");
  });
  it("la pérdida se ve en rojo con su signo", () => {
    expect(html).toContain("−S/ 4,857");
  });
});
