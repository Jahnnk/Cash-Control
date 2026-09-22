/**
 * El panorama de productos, contra el informe real de Fonavi (1–19 set 2026)
 * que armó Jahnn a partir del reporte "Platos con mayor rotación" de Byte.
 */
import { describe, it, expect } from "vitest";
import { armarPanorama, familiaDeProducto, esLineaEliminada, nombreLimpio, diasEntre } from "../panorama";
import { armarTrimestral, recomendacionDe } from "../trimestral";

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

  it("suma la línea eliminada a su producto y separa el ajuste (método de Jahnn)", () => {
    expect(p.dias).toBe(19);
    // El cappuccino eliminado (9 u, S/108) se suma al cappuccino activo;
    // la "reposición cake chocolate" es un ajuste y sale de la carta.
    expect(p.carta.find((x) => x.nombre === "CAPPUCCINO")).toMatchObject({ unidades: 53, ingresos: 636 });
    expect(p.ventas).toBe(5533);
    expect(p.productos).toBe(7);
    expect(p.fueraDeCarta).toMatchObject({ ventas: 189.6, unidades: 4 });
    expect(p.ventasTotales).toBe(5722.6);
    expect(p.eliminadas).toMatchObject({ lineas: 2, unidasAlProducto: 1, propias: 0, ajustes: 1 });
  });

  it("ordena las familias por ingresos y saca su porcentaje", () => {
    expect(p.familias[0]).toEqual({ familia: "Postres y pastelería", ventas: 1508, unidades: 121, pct: 27.3 });
    expect(p.familias.map((f) => f.familia)).toContain("Empanadas");
    expect(p.familias.reduce((t, f) => t + f.ventas, 0)).toBe(p.ventas);
  });

  it("el top sale por ingresos, con precio y unidades por día", () => {
    expect(p.top.map((t) => t.nombre)).toEqual(["EMPANADA MIXTA", "PAN INTEGRAL MULTIGRANO TIPO MOLDE 750 G", "POLLO CON PIÑA GRILL"]);
    expect(p.top[0]).toMatchObject({ precio: 8, unidadesPorDia: 8.7, pct: 23.9 });
    expect(p.concentracionTop10).toBe(60.5);
  });

  it("el ranking de postres trae solo postres, por ingresos", () => {
    expect(p.postres.map((x) => x.nombre)).toEqual(["CARROT CAKE PORCIÓN", "CAKE DE CHOCOLATE PORCIÓN"]);
    expect(p.postres[0].unidadesPorDia).toBe(3.4);
  });

  it("cuenta la cola larga (3 unidades o menos)", () => {
    expect(p.colaLarga).toBe(1);
  });

  it("lo que no es carta suma al total pero no compite en el ranking", () => {
    const conDelivery = armarPanorama([...filas, { nombre: "DELIVERY 2", unidades: 5, ingresos: 30 }], "2026-09-01", "2026-09-19", 3);
    expect(conDelivery.top.map((t) => t.nombre)).not.toContain("DELIVERY 2");
    expect(conDelivery.fueraDeCarta.ventas).toBe(219.6);
    expect(conDelivery.ventas).toBe(5533);
  });

  it("una línea eliminada sin producto activo queda como producto propio", () => {
    const r = armarPanorama([
      { nombre: "[ELIMINADO 2026-06-15 18:20:54] CAKE DE PRIMAVERA", unidades: 20, ingresos: 240 },
      { nombre: "CARROT CAKE PORCIÓN", unidades: 10, ingresos: 120 },
    ], "2026-06-01", "2026-06-30");
    expect(r.carta.map((x) => x.nombre)).toContain("CAKE DE PRIMAVERA");
    expect(r.eliminadas).toMatchObject({ propias: 1, unidasAlProducto: 0 });
  });

  it("la venta por día usa los días del período", () => {
    expect(p.ventaPorDia).toBe(291.21);
    expect(diasEntre("2026-09-01", "2026-09-19")).toBe(19);
    expect(diasEntre("2026-09-19", "2026-09-01")).toBe(0);
  });
});

describe("informe trimestral (método del Excel de Jahnn)", () => {
  const mes = (month: string, desde: string, hasta: string, filas: { nombre: string; unidades: number; ingresos: number }[]) => ({ month, desde, hasta, filas });
  const t = armarTrimestral([
    mes("2026-06", "2026-06-01", "2026-06-30", [
      { nombre: "EMPANADA MIXTA", unidades: 278, ingresos: 2224 },
      { nombre: "CARROT CAKE PORCIÓN", unidades: 135, ingresos: 1620 },
      { nombre: "JUGO DE FRESA", unidades: 20, ingresos: 200 },
      { nombre: "DELIVERY 2", unidades: 14, ingresos: 84 },
    ]),
    mes("2026-07", "2026-07-01", "2026-07-31", [
      { nombre: "EMPANADA MIXTA", unidades: 245, ingresos: 1960 },
      { nombre: "CARROT CAKE PORCIÓN", unidades: 140, ingresos: 1680 },
      { nombre: "JUGO DE FRESA", unidades: 40, ingresos: 400 },
      { nombre: "COOKIE NUEVA", unidades: 10, ingresos: 90 },
    ]),
    mes("2026-08", "2026-08-01", "2026-08-29", [
      { nombre: "EMPANADA MIXTA", unidades: 227, ingresos: 1816 },
      { nombre: "CARROT CAKE PORCIÓN", unidades: 127, ingresos: 1524 },
      { nombre: "COOKIE NUEVA", unidades: 30, ingresos: 270 },
    ]),
  ]);

  it("arma el comparativo mensual y marca el mes incompleto", () => {
    expect(t.meses.map((m) => m.ventas)).toEqual([4044, 4130, 3610]);
    expect(t.meses[2].incompleto).toBe(true);
    expect(t.meses[0].incompleto).toBe(false);
    expect(t.meses.every((m) => !m.sospechoso)).toBe(true);
    expect(t.ventas).toBe(11784);
  });

  it("clasifica tendencia del último mes contra el primero", () => {
    const por = (n: string) => t.productosTodos.find((p) => p.nombre === n)!;
    expect(por("EMPANADA MIXTA").tendencia).toBe("Cayendo");
    expect(por("CARROT CAKE PORCIÓN").tendencia).toBe("Estable");
    expect(por("JUGO DE FRESA").tendencia).toBe("Dejó de venderse");
    expect(por("COOKIE NUEVA").tendencia).toBe("Nuevo");
    expect(por("COOKIE NUEVA").mesesActivo).toBe(2);
  });

  it("asigna clase ABC por acumulado (A hasta 80%, B hasta 95%)", () => {
    expect(t.productosTodos.map((p) => `${p.nombre}:${p.clase}`)).toEqual([
      "EMPANADA MIXTA:A", "CARROT CAKE PORCIÓN:B", "JUGO DE FRESA:C", "COOKIE NUEVA:C",
    ]);
  });

  it("la recomendación cruza clase y tendencia", () => {
    expect(recomendacionDe("A", "Cayendo", 3, 3)).toContain("Revisar YA");
    expect(recomendacionDe("C", "Dejó de venderse", 2, 3)).toContain("quiebre");
    expect(recomendacionDe("C", "Estable", 3, 3)).toContain("Vende poco");
    expect(recomendacionDe("A", "Creciendo", 3, 3)).toContain("Impulsar");
  });

  it("marca el mes que vendió muchísimo menos (carga parcial, caso julio de Fonavi)", () => {
    const conJulioRoto = armarTrimestral([
      mes("2026-06", "2026-06-01", "2026-06-30", [{ nombre: "EMPANADA MIXTA", unidades: 278, ingresos: 2224 }]),
      mes("2026-07", "2026-07-01", "2026-07-31", [{ nombre: "EMPANADA MIXTA", unidades: 50, ingresos: 400 }]),
      mes("2026-08", "2026-08-01", "2026-08-31", [{ nombre: "EMPANADA MIXTA", unidades: 227, ingresos: 1816 }]),
    ]);
    expect(conJulioRoto.meses.map((m) => m.sospechoso)).toEqual([false, true, false]);
    expect(conJulioRoto.meses[1].incompleto).toBe(false);
  });

  it("lo que no es carta va aparte, no al ranking", () => {
    expect(t.productosTodos.map((p) => p.nombre)).not.toContain("DELIVERY 2");
    expect(t.fueraDeCarta.ventas).toBe(84);
  });

  it("el top del trimestre trae el desglose por mes", () => {
    expect(t.top[0].porMes.map((m) => m.ingresos)).toEqual([2224, 1960, 1816]);
    expect(t.topPorMes[0].productos[0].nombre).toBe("EMPANADA MIXTA");
  });
});
