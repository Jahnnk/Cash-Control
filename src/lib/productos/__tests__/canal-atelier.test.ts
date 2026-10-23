import { describe, it, expect } from "vitest";
import { ATELIER, ATELIER_B2B, ATELIER_CAFETERIAS, esCanalAtelier, filtrarPorCanal, repartoPorCanal, sedeReal } from "../canal-atelier";

const filas = [
  { nombre: "Y-BROWNIE TRIPLE CHOCOLATE", unidades: 54, ingresos: 291.6 },
  { nombre: "P-BROWNIE TRIPLE CHOCOLATE", unidades: 181, ingresos: 1332.16 },
  { nombre: "[ELIMINADO 2026-09-03 12:04:24] Y-CHEESCAKE DE FRESA", unidades: 2, ingresos: 30 },
  { nombre: "PAN DE HAMBURGUESA 5UND", unidades: 51, ingresos: 408 },
  { nombre: "PAVO POR KILO", unidades: 6, ingresos: 414 },
];

describe("Atelier por canal", () => {
  it("cada vista se queda solo con su canal; «Todo» con todo", () => {
    expect(filtrarPorCanal(filas, ATELIER_CAFETERIAS).map((f) => f.nombre)).toEqual(["Y-BROWNIE TRIPLE CHOCOLATE", "[ELIMINADO 2026-09-03 12:04:24] Y-CHEESCAKE DE FRESA"]);
    expect(filtrarPorCanal(filas, ATELIER_B2B).map((f) => f.nombre)).toEqual(["P-BROWNIE TRIPLE CHOCOLATE"]);
    expect(filtrarPorCanal(filas, ATELIER)).toHaveLength(5);
  });
  it("el reparto suma cafeterías, B2B y sub-recetas (PAVO POR KILO no es P-: no tiene guion)", () => {
    expect(repartoPorCanal(filas)).toEqual({ cafeterias: 321.6, b2b: 1332.16, subRecetas: 822, total: 2475.76 });
  });
  it("las vistas por canal son Atelier", () => {
    expect(esCanalAtelier(ATELIER_CAFETERIAS)).toBe(true);
    expect(esCanalAtelier(ATELIER)).toBe(false);
    expect(sedeReal(ATELIER_B2B)).toBe(ATELIER);
    expect(sedeReal(2)).toBe(2);
  });
});
