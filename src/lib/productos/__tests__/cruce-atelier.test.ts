import { describe, expect, it } from "vitest";
import { clave, cruzar, emparejarMerma, esParaCafeterias } from "../cruce-atelier";

const v = (nombre: string, unidades: number, ingresos = unidades * 4) => ({ nombre, unidades, ingresos });

describe("clave y prefijo", () => {
  it("quita el prefijo Y-, las tildes y las palabras vacías", () => {
    expect(clave("Y-COOKIE DE ALMENDRA CON MANJAR")).toBe(clave("Cookie almendra con manjar"));
    expect(clave("[ELIMINADO 2026-10-01] Y - BROWNIE VEGANO")).toBe("BROWNIE VEGANO");
  });
  it("solo las líneas Y- son ventas a las cafeterías", () => {
    expect(esParaCafeterias("Y-BROWNIE VEGANO")).toBe(true);
    expect(esParaCafeterias("P-BROWNIE TRIPLE CHOCOLATE")).toBe(false);
    expect(esParaCafeterias("YOGURT")).toBe(false);
  });
});

describe("emparejarMerma", () => {
  const claves = ["BROWNIE VEGANO", "BROWNIE TRIPLE CHOCOLATE", "EMPANADA VEGETARIANA", "BUDIN MASA MADRE 500G"];
  it("empareja por palabras aunque estén cortadas o incompletas", () => {
    expect(emparejarMerma("empanada vegetaria", claves)).toBe("EMPANADA VEGETARIANA");
    expect(emparejarMerma("Brownie Triple Chocolate", claves)).toBe("BROWNIE TRIPLE CHOCOLATE");
    expect(emparejarMerma("Budin", claves)).toBe("BUDIN MASA MADRE 500G");
  });
  it("si hay duda o no existe, no adivina", () => {
    expect(emparejarMerma("brownie", claves)).toBeNull();
    expect(emparejarMerma("torta tropical", claves)).toBeNull();
  });
});

describe("cruzar", () => {
  it("el caso de Jahnn: 73 salieron, 44 + 22 vendidos, faltan 7", () => {
    const c = cruzar({ atelier: [v("Y-BROWNIE VEGANO", 73, 306.6), v("P-BROWNIE VEGANO", 500)], fonavi: [v("BROWNIE VEGANO", 44)], centro: [v("BROWNIE VEGANO", 22)], mermas: [] });
    expect(c.filas).toHaveLength(1);
    expect(c.filas[0]).toMatchObject({ nombre: "BROWNIE VEGANO", salio: 73, vendido: { fonavi: 44, centro: 22 }, sinExplicar: 7, estado: "falta", precioInterno: 4.2, valor: 29.4 });
    expect(c.totales).toMatchObject({ salio: 73, vendido: 66, mermas: 0, falta: 7, productosConFalta: 1 });
  });
  it("las mermas de las cafeterías explican la diferencia", () => {
    const c = cruzar({
      atelier: [v("Y-BROWNIE VEGANO", 73)], fonavi: [v("BROWNIE VEGANO", 44)], centro: [v("BROWNIE VEGANO", 22)],
      mermas: [{ sedeId: 2, producto: "brownie vegano", cantidad: 4, unidad: "und" }, { sedeId: 3, producto: "Brownie Vegano", cantidad: 2, unidad: "1" }, { sedeId: 1, producto: "brownie vegano", cantidad: 9, unidad: "und" }],
    });
    expect(c.filas[0]).toMatchObject({ mermas: { fonavi: 4, centro: 2 }, mermasComo: ["brownie vegano", "Brownie Vegano"], sinExplicar: 1, estado: "cuadra", valor: 0 });
  });
  it("marca cuando la cafetería vende más de lo que salió", () => {
    const c = cruzar({ atelier: [v("Y-BLONDIE DE LIMON", 65)], fonavi: [v("BLONDIE DE LIMON", 46)], centro: [v("BLONDIE DE LIMON", 27)], mermas: [] });
    expect(c.filas[0]).toMatchObject({ sinExplicar: -8, estado: "sobra", valor: 0 });
  });
  it("no cruza enteros ni lo que la cafetería no vende con ese nombre", () => {
    const c = cruzar({ atelier: [v("Y-CARROT CAKE ENTERA", 31), v("Y-PAN IMG TIPO MOLDE 750G", 258)], fonavi: [v("CARROT CAKE ENTERO", 3), v("CARROT CAKE PORCIÓN", 200)], centro: [], mermas: [] });
    expect(c.filas).toEqual([]);
    expect(c.sinCruce).toEqual([{ nombre: "PAN IMG TIPO MOLDE 750G", salio: 258, motivo: "sin-pareja" }, { nombre: "CARROT CAKE ENTERA", salio: 31, motivo: "entero" }]);
  });
  it("lo que la cafetería casi no vende con ese nombre no se cruza", () => {
    const c = cruzar({ atelier: [v("Y-FOCACCIA CLASICA 1/4", 109)], fonavi: [v("FOCACCIA CLASICA 1/4", 8)], centro: [v("FOCACCIA CLASICA 1/4", 6)], mermas: [] });
    expect(c.filas).toEqual([]);
    expect(c.sinCruce).toEqual([{ nombre: "FOCACCIA CLASICA 1/4", salio: 109, motivo: "poca-venta" }]);
  });
  it("las mermas en peso o sin producto del cruce quedan aparte", () => {
    const c = cruzar({
      atelier: [v("Y-BROWNIE VEGANO", 10)], fonavi: [v("BROWNIE VEGANO", 10)], centro: [],
      mermas: [{ sedeId: 2, producto: "mermelada de fresa", cantidad: 100, unidad: "g" }, { sedeId: 2, producto: "torta tropical", cantidad: 4, unidad: "und" }],
    });
    expect(c.mermasSinEmparejar).toEqual([{ sedeId: 2, producto: "torta tropical", cantidad: 4 }]);
  });
});
