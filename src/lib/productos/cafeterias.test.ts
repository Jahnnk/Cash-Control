import { describe, it, expect } from "vitest";
import { juntarFilas, juntarRango, juntarSinVenta, esCafeteria, CAFETERIAS } from "./cafeterias";
import { candidatosDeCategoria } from "./por-categoria";
import type { ProductoSinVenta, SinVentaSede } from "@/app/actions/reportes-direccion";
import type { Candidato } from "./candidatos";

describe("juntar las ventas de las dos cafeterías", () => {
  it("el mismo producto suma unidades e ingresos; los que están en una sola quedan igual", () => {
    const r = juntarFilas([
      [{ nombre: "CAFE CORTADO", unidades: 10, ingresos: 110 }, { nombre: "PAN", unidades: 5, ingresos: 50 }],
      [{ nombre: "CAFE CORTADO", unidades: 20, ingresos: 220 }, { nombre: "SOLO CENTRO", unidades: 4, ingresos: 40 }],
    ]);
    expect(r).toHaveLength(3);
    expect(r.find((x) => x.nombre === "CAFE CORTADO")).toEqual({ nombre: "CAFE CORTADO", unidades: 30, ingresos: 330 });
    expect(r.reduce((t, x) => t + x.ingresos, 0)).toBe(420);
    expect(r.reduce((t, x) => t + x.unidades, 0)).toBe(39);
  });

  it("no distingue tildes, mayúsculas ni espacios de más; se queda con el nombre de donde más se vendió", () => {
    const r = juntarFilas([
      [{ nombre: "Café  Cortado", unidades: 1, ingresos: 10 }],
      [{ nombre: "CAFE CORTADO", unidades: 2, ingresos: 30 }],
    ]);
    expect(r).toEqual([{ nombre: "CAFE CORTADO", unidades: 3, ingresos: 40 }]);
  });

  it("una cafetería sin ventas no estorba", () => {
    expect(juntarFilas([[], [{ nombre: "X", unidades: 1, ingresos: 5 }]])).toEqual([{ nombre: "X", unidades: 1, ingresos: 5 }]);
    expect(juntarFilas([[], []])).toEqual([]);
  });

  it("el rango va del primer al último día cargado; sin datos, nada", () => {
    expect(juntarRango([{ desde: "2026-09-01", hasta: "2026-09-30" }, { desde: "2026-09-01", hasta: "2026-10-03" }])).toEqual({ desde: "2026-09-01", hasta: "2026-10-03" });
    expect(juntarRango([{ desde: null, hasta: null }, { desde: "2026-09-02", hasta: "2026-09-20" }])).toEqual({ desde: "2026-09-02", hasta: "2026-09-20" });
    expect(juntarRango([{ desde: null, hasta: null }])).toBeNull();
  });

  it("«Fonavi + Centro» cuenta como cafetería; Atelier no", () => {
    expect([CAFETERIAS, 2, 3].every(esCafeteria)).toBe(true);
    expect(esCafeteria(1)).toBe(false);
  });
});

describe("productos que no se venden en las dos cafeterías", () => {
  const p = (producto: string, grupo: ProductoSinVenta["grupo"], vendido: number): ProductoSinVenta => ({
    producto, tipoByte: null, stock: null, vendido, ultimaVenta: null, nuncaVendido: grupo === "nunca", precio: 10, grupo,
  });
  const sede = (businessId: number, nombre: string, carta: ProductoSinVenta[]): SinVentaSede => ({
    businessId, sede: nombre, desde: "2026-09-01", hasta: "2026-09-30", subidoEl: "2026-10-03", carta, noCarta: 0,
  });

  const fonavi = sede(2, "Fonavi", [p("BOLSA DE INFUSION: ANDEAN", "nunca", 0), p("FOCACCIA", "poco", 2), p("SOLO EN FONAVI", "dormido", 0)]);
  const centro = sede(3, "Centro", [p("Bolsa de infusión: Andean", "poco", 1), p("FOCACCIA", "dormido", 0), p("SOLO EN CENTRO", "nunca", 0)]);

  it("separa lo flojo en las dos (lo más claro para sacar) de lo flojo en una sola", () => {
    const j = juntarSinVenta(fonavi, centro);
    expect(j.ambas.map((x) => x.producto).sort()).toEqual(["BOLSA DE INFUSION: ANDEAN", "FOCACCIA"].sort());
    expect(j.soloFonavi.map((x) => x.producto)).toEqual(["SOLO EN FONAVI"]);
    expect(j.soloCentro.map((x) => x.producto)).toEqual(["SOLO EN CENTRO"]);
  });

  it("une el mismo producto aunque cambie la tilde o las mayúsculas, y suma lo vendido", () => {
    const bolsa = juntarSinVenta(fonavi, centro).ambas.find((x) => /ANDEAN/i.test(x.producto))!;
    expect(bolsa.vendido).toBe(1);
    expect(bolsa.fonavi?.grupo).toBe("nunca");
    expect(bolsa.centro?.grupo).toBe("poco");
  });

  it("los que menos vendieron van primero", () => {
    const j = juntarSinVenta(fonavi, centro);
    expect(j.ambas[0].vendido).toBeLessThanOrEqual(j.ambas[1].vendido);
  });

  it("si una cafetería no tiene lista, lo de la otra queda como «solo en…»", () => {
    const j = juntarSinVenta(fonavi, null);
    expect(j.ambas).toEqual([]);
    expect(j.soloFonavi).toHaveLength(3);
    expect(juntarSinVenta(null, null).ambas).toEqual([]);
  });
});

describe("candidatos por categoría con las dos cafeterías", () => {
  const c = (clave: string, familia: string, businessIds: number[]) => ({
    clave, nombre: clave, familia, veredicto: "sacar", puntos: 70,
    sedes: businessIds.map((businessId) => ({ businessId })),
  }) as unknown as Candidato;
  const cs = [c("a", "Panadería", [2]), c("b", "Panadería", [3]), c("c", "Panadería", [2, 3]), c("d", "Empanadas", [2])];
  it("con CAFETERIAS entran los de cualquiera de las dos; con una sede, solo los suyos", () => {
    expect(candidatosDeCategoria(cs, "Panadería", CAFETERIAS).map((x) => x.clave).sort()).toEqual(["a", "b", "c"]);
    expect(candidatosDeCategoria(cs, "Panadería", 3).map((x) => x.clave).sort()).toEqual(["b", "c"]);
  });
});
