/**
 * El panorama de productos, contra el informe real de Fonavi (1–19 set 2026)
 * que armó Jahnn a partir del reporte "Platos con mayor rotación" de Byte.
 */
import { describe, it, expect } from "vitest";
import { armarPanorama, familiaDeProducto, esLineaEliminada, nombreLimpio, diasEntre } from "../panorama";

describe("a qué familia pertenece cada producto", () => {
  it.each([
    ["EMPANADA MIXTA", "Empanadas"],
    ["Y-ENPANADA DE LOMITO", "Empanadas"],
    ["PAN INTEGRAL MULTIGRANO TIPO MOLDE 750 G", "Panes y masa madre"],
    ["BUDIN DE MASA MADRE PORCION", "Postres y pastelería"],
    ["CARROT CAKE PORCIÓN", "Postres y pastelería"],
    ["CROISSANT CLASICO", "Postres y pastelería"],
    ["COOKIE XL CON MANTEQUILLA GHEE", "Postres y pastelería"],
    ["POLLO CON PIÑA GRILL", "Sánguches, platos y desayunos"],
    ["CAPRESE RÚSTICO", "Sánguches, platos y desayunos"],
    ["CAPPUCCINO", "Café e infusiones"],
    ["BOSQUE ENCANTADO", "Café e infusiones"],
    ["CHOCOLATE CALIENTE", "Café e infusiones"],
    ["MILKSHAKE VAINILLA", "Jugos, batidos y bebidas frías"],
    ["CHILCANO FRUTADO", "Jugos, batidos y bebidas frías"],
    ["DELIVERY PUNTO DE VENTA", "Otros (extras y retail)"],
    ["PAVO POR KILO", "Otros (extras y retail)"],
  ])("%s → %s", (nombre, familia) => {
    expect(familiaDeProducto(nombre)).toBe(familia);
  });
});

describe("las líneas anuladas de Byte", () => {
  it("se reconocen y se pueden leer sin la marca", () => {
    const n = "[ELIMINADO 2026-09-11 19:07:53] REPOSICION CAKE CHOCOLATE";
    expect(esLineaEliminada(n)).toBe(true);
    expect(nombreLimpio(n)).toBe("REPOSICION CAKE CHOCOLATE");
    expect(esLineaEliminada("CAKE DE CHOCOLATE PORCIÓN")).toBe(false);
  });
});

describe("el panorama del mes (Fonavi, 1–19 set 2026)", () => {
  const filas = [
    { nombre: "EMPANADA MIXTA", unidades: 165, ingresos: 1320 },
    { nombre: "PAN INTEGRAL MULTIGRANO TIPO MOLDE 750 G", unidades: 61, ingresos: 1037 },
    { nombre: "POLLO CON PIÑA GRILL", unidades: 62, ingresos: 992 },
    { nombre: "CARROT CAKE PORCIÓN", unidades: 65, ingresos: 780 },
    { nombre: "CAKE DE CHOCOLATE PORCIÓN", unidades: 56, ingresos: 728 },
    { nombre: "CAPPUCCINO", unidades: 44, ingresos: 528 },
    { nombre: "COCTEL DE LA CASA", unidades: 2, ingresos: 40 },
    { nombre: "[ELIMINADO 2026-09-11 19:07:53] REPOSICION CAKE CHOCOLATE", unidades: 4, ingresos: 189.6 },
    { nombre: "[ELIMINADO 2026-09-11 16:56:55] CAPUCCINO", unidades: 9, ingresos: 108 },
  ];
  const p = armarPanorama(filas, "2026-09-01", "2026-09-19", 3);

  it("cuenta 19 días y deja fuera las líneas anuladas", () => {
    expect(p.dias).toBe(19);
    expect(p.ventas).toBe(5425);
    expect(p.unidades).toBe(455);
    expect(p.productos).toBe(7);
    expect(p.eliminadas).toMatchObject({ lineas: 2, unidades: 13, ingresos: 297.6 });
  });

  it("ordena las familias por ingresos y saca su porcentaje", () => {
    expect(p.familias[0]).toEqual({ familia: "Postres y pastelería", ventas: 1508, unidades: 121, pct: 27.8 });
    expect(p.familias.map((f) => f.familia)).toContain("Empanadas");
    expect(p.familias.reduce((t, f) => t + f.ventas, 0)).toBe(p.ventas);
  });

  it("el top sale por ingresos, con precio y unidades por día", () => {
    expect(p.top.map((t) => t.nombre)).toEqual(["EMPANADA MIXTA", "PAN INTEGRAL MULTIGRANO TIPO MOLDE 750 G", "POLLO CON PIÑA GRILL"]);
    expect(p.top[0]).toMatchObject({ precio: 8, unidadesPorDia: 8.7, pct: 24.3 });
    expect(p.concentracionTop10).toBe(61.7);
  });

  it("el ranking de postres trae solo postres, por ingresos", () => {
    expect(p.postres.map((x) => x.nombre)).toEqual(["CARROT CAKE PORCIÓN", "CAKE DE CHOCOLATE PORCIÓN"]);
    expect(p.postres[0].unidadesPorDia).toBe(3.4);
  });

  it("cuenta la cola larga (3 unidades o menos)", () => {
    expect(p.colaLarga).toBe(1);
  });

  it("la venta por día usa los días del período", () => {
    expect(p.ventaPorDia).toBe(285.53);
    expect(diasEntre("2026-09-01", "2026-09-19")).toBe(19);
    expect(diasEntre("2026-09-19", "2026-09-01")).toBe(0);
  });
});
