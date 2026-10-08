/** Lo que cuesta mantener un producto en la carta (pedido de Jahnn, 8-oct-2026). */
import { describe, expect, it } from "vitest";
import { esfuerzoDe } from "../candidatos";
import { insumosDeCarta } from "@/lib/costos-preparaciones-excel";
import type { CostoCarta } from "../costos-carta";

const bloque = (hoja: string, nombre: string, ingredientes: [string, string][]) => ({
  hoja, fila: 1, nombre, archivado: false, kg: null, rendimiento: 1, merma: 0, costoUnidad: 1, rindeKg: false,
  ingredientes: ingredientes.map(([sku, n]) => ({ sku, nombre: n, unidad: "g", cantidad: 1 })),
});
const carta = (nombre: string, origen: string): CostoCarta => ({ ref: nombre, nombre, nombreCarta: null, categoria: null, costo: 1, precio: 10, origen });

describe("insumos exclusivos", () => {
  it("un insumo es exclusivo si solo una línea de producto lo usa; los empaques no cuentan", () => {
    const c = [carta("Matcha Ceremonial", "Cafetería"), carta("Matcha Latte", "Cafetería"), carta("Mocca de Lavanda", "Cafetería")];
    insumosDeCarta(c, [], [
      bloque("CAF · Bebidas", "Matcha Ceremonial", [["MT001", "Matcha ceremonial"], ["PK056", "Vaso"]]),
      bloque("CAF · Bebidas", "Matcha Latte", [["MT001", "Matcha ceremonial"], ["LC021", "Leche"]]),
      bloque("CAF · Bebidas", "Mocca de Lavanda", [["LV001", "Jarabe de lavanda"], ["LC021", "Leche"], ["PK056", "Vaso"]]),
    ]);
    expect(c[0].insumos?.find((i) => i.sku === "MT001")?.exclusivo).toBe(false); // lo comparte con el latte
    expect(c[0].insumos?.some((i) => i.sku === "PK056")).toBe(false);
    expect(c[2].insumos?.filter((i) => i.exclusivo).map((i) => i.nombre)).toEqual(["Jarabe de lavanda"]);
  });
  it("las presentaciones de un mismo producto cuentan como una línea; la reventa no tiene receta", () => {
    const c = [carta("Cake de Chocolate - Porción", "Atelier"), carta("Bolsa de Infusión: Masala Chai", "Externo")];
    insumosDeCarta(c, [
      bloque("ATE · Pastelería", "Cake de Chocolate - Porción", [["CH001", "Cobertura"]]),
      bloque("ATE · Pastelería", "Cake de Chocolate - Torta Entera", [["CH001", "Cobertura"]]),
    ], []);
    expect(c[0].insumos?.[0].exclusivo).toBe(true);
    expect(c[1].insumos).toEqual([]);
  });
});

describe("esfuerzo de mantenerlo", () => {
  it("tienda con insumos propios > Atelier > reventa", () => {
    const tienda = esfuerzoDe({ origen: "Cafetería", insumos: [{ sku: "X", nombre: "Matcha", exclusivo: true }] });
    const atelier = esfuerzoDe({ origen: "Atelier", insumos: [] });
    const reventa = esfuerzoDe({ origen: "Externo", insumos: [] });
    expect(tienda).toMatchObject({ origen: "tienda", exclusivos: ["Matcha"] });
    expect(tienda.esfuerzo).toBeGreaterThan(atelier.esfuerzo);
    expect(atelier.esfuerzo).toBeGreaterThan(reventa.esfuerzo);
    expect(esfuerzoDe(null)).toEqual({ origen: null, exclusivos: [], esfuerzo: 1 });
  });
});
