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
  it("a primera vista: cuatro barras (Ventas, Dinero que entró, Dinero que salió, Ganancia) y «De cada S/ 100 que vendes»", () => {
    for (const t of ["Ventas", "Dinero que entró", "Dinero que salió", "Ganancia", "EBITDA", "Costos: S/ 17,148", "Gastos: S/ 13,538", "S/ 30,686", "Por ventas", "Otras entradas", "S/ 37,294", "S/ 6,608", "Ver el detalle", "Mínimo cubierto", "121%", "Mejor rendimiento", "Atención", "¿Qué significa cada palabra?"]) expect(html).toContain(t);
  });
  it("el EBITDA se ve con su zona (Fonavi 17.7% = En camino; Atelier negativo = Frágil) dentro de «De cada S/ 100 que vendes»", () => {
    expect(html).toContain("En camino");
    expect(html).toContain("Frágil");
    expect(html).toContain("De cada S/ 100 que vendes");
    for (const t of ["Costos variables", "Costos fijos", "Utilidad apartada", "Impuestos, inversión y deudas"]) expect(html).toContain(t);
  });
  it("mes abierto: la barra de Ganancia no muestra el % inflado de la fecha; lo estimado está en «De cada S/ 100»", () => {
    const abierto = renderToStaticMarkup(createElement(TarjetasSede, {
      cifras: { mes: "2026-10", sedes: [{ ...sede(2, "Fonavi", 16000, 5200, 800), mes: "2026-10", corte: "2026-10-13" }] } as never, periodo: "octubre 2026", cajaHref: "/x",
      cada: { grupo: { businessId: null, sede: "Grupo", modo: "sin-datos", porque: "x", provisional: false, ventas: null, corte: null, lineas: [], termometro: null, caja: null, fuenteFijos: null, fijosEsperados: null },
        sedes: { 2: { businessId: 2, sede: "Fonavi", modo: "estimado", porque: null, provisional: false, ventas: 35662, corte: "2026-10-13", termometro: "en_camino", caja: 4794, fuenteFijos: "presupuesto", fijosEsperados: 14550,
          lineas: [{ clave: "ebitda", etiqueta: "EBITDA", ayuda: "", cien: 12.9, meta: 33.3, sentido: "piso", tono: "ojo", monto: 4600, nota: "estimado al cierre" }] } } },
    }));
    expect(abierto).toContain("a la fecha · faltan pagos de fin de mes");
    expect(abierto).toContain("Estimado al cierre");
    expect(abierto).not.toContain("de las ventas");
  });
  it("el Grupo tiene su propio «De cada S/ 100» arriba de las sedes", () => {
    expect(html).toContain("aria-label=\"De cada S/ 100 que vende Grupo\"");
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
  it("«Ventas» llega hasta el último día cargado: suma lo que el Excel aún no cubre, en una parte más clara, y dice la fecha", () => {
    const x = renderToStaticMarkup(createElement(TarjetasSede, {
      cifras: { mes: "2026-10", sedes: [{ ...sede(3, "Centro", 19560, 5300, 4500), corte: "2026-10-14", ventasPosteriores: 5686.43 }] } as never, periodo: "octubre 2026", cajaHref: "/x",
      extras: { 3: { href: "#", flag: null, cubiertosPct: 73, pie: null, ventasHasta: "2026-10-18" } },
    }));
    expect(x).toContain("S/ 25,246");        // 19,560 + 5,686 = ventas hasta el 18/10
    expect(x).toContain("Ventas más recientes");
    expect(x).toContain("al 18/10");
    expect(x).toContain("Dinero, costos y ganancia hasta el 14/10");
  });
  it("la pérdida se ve en rojo con su signo", () => {
    expect(html).toContain("−S/ 4,857");
  });
});
