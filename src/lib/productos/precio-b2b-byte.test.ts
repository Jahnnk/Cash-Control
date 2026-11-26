/**
 * El precio B2B real desde Byte (fase 4, 26-nov-2026): los «P-» de Atelier se enlazan con su receta por nombre, sin
 * dudas, y el precio es venta ÷ unidades del último mes con venta.
 */
import { describe, it, expect } from "vitest";
import { enlazarB2B, palabras, preciosB2BDeByte, type RecetaB2B } from "./precio-b2b-byte";

const recetas: RecetaB2B[] = [
  { ref: "A1", nombre: "Pan Ciabatta (bolsa de 4 und)" },
  { ref: "A2", nombre: "Cookie XL" },
  { ref: "A3", nombre: "Cookie de Avena" },
  { ref: "A4", nombre: "Cookie con Chispas" },
  { ref: "A5", nombre: "Pan IMG Tipo Molde 750 g" },
  { ref: "A6", nombre: "Pan IMG Tipo Molde 1 KG" },
  { ref: "A7", nombre: "Pan con Pan tipo Molde 1 kg" },
  { ref: "A8", nombre: "Pan con Pan tipo molde 750" },
  { ref: "A9", nombre: "Carrot Cake - Porción" },
  { ref: "A10", nombre: "Carrot Cake - Torta Entera" },
  { ref: "A11", nombre: "Pan de Hamburguesa 80g - 5UND" },
  { ref: "A12", nombre: "Mini Pan de Hamburguesa Pack x15" },
  { ref: "A13", nombre: "Empanada de Lomito" },
  { ref: "A14", nombre: "Blondie de Limón" },
  { ref: "A15", nombre: "Focaccia Clásica 1/4" },
  { ref: "A16", nombre: "Focaccia Mediterránea 1/4" },
];

describe("palabras", () => {
  it("sin prefijo, tildes ni palabras vacías; los pesos en gramos", () => {
    expect([...palabras("P-PAN IMG TIPO MOLDE 750G")]).toEqual(["pan", "img", "tipo", "molde", "750"]);
    expect([...palabras("Pan IMG Tipo Molde 1 KG")]).toEqual(["pan", "img", "tipo", "molde", "1000"]);
    expect([...palabras("[ELIMINADO] P- BLONDIE DE LIMÓN")]).toEqual(["blondie", "limon"]);
  });
});

describe("enlazar el nombre de Byte con la receta", () => {
  it("mismas palabras, nombre corto de Byte y receta que cabe entera", () => {
    const m = enlazarB2B([
      "P-CIABATTA", "P-COOKIE XL", "P-COOKIE DE AVENA", "P-COOKIE DE AVENA CON CHISPAS DE CHOCOLATE",
      "P-PAN IMG TIPO MOLDE 750G", "P-PAN IMG TIPO MOLDE 1 KG", "P-PAN CON PAN TIPO MOLDE 1KG", "P-PAN CON PAN TIPO MOLDE 750G",
      "P-CARROT CAKE ENTERA", "P- PAN DE HAMBURGUESA 80G", "P-EMPANADA DE LOMITO", "P-BLONDIE DE LIMÓN", "P-FOCACCIA CLÁSICA",
    ], recetas);
    expect(Object.fromEntries(m)).toEqual({
      "P-CIABATTA": "A1", "P-COOKIE XL": "A2", "P-COOKIE DE AVENA": "A3",
      // La de avena ya la tomó «P-COOKIE DE AVENA»: queda «Cookie con Chispas».
      "P-COOKIE DE AVENA CON CHISPAS DE CHOCOLATE": "A4",
      "P-PAN IMG TIPO MOLDE 750G": "A5", "P-PAN IMG TIPO MOLDE 1 KG": "A6", "P-PAN CON PAN TIPO MOLDE 1KG": "A7", "P-PAN CON PAN TIPO MOLDE 750G": "A8",
      "P-CARROT CAKE ENTERA": "A10", "P- PAN DE HAMBURGUESA 80G": "A11", "P-EMPANADA DE LOMITO": "A13", "P-BLONDIE DE LIMÓN": "A14", "P-FOCACCIA CLÁSICA": "A15",
    });
  });

  it("si caben dos recetas, no se enlaza", () => {
    expect(enlazarB2B(["P-FOCACCIA"], recetas).size).toBe(0);
    expect(enlazarB2B(["P-CARROT CAKE"], recetas).size).toBe(0);
  });
});

describe("el precio B2B de Byte", () => {
  it("venta ÷ unidades del último mes; avisa si antes era otro; ignora lo que no es P-", () => {
    const r = preciosB2BDeByte([
      { mes: "2026-10", nombre: "P-EMPANADA DE LOMITO", unidades: 100, venta: 650 },
      { mes: "2026-11", nombre: "P-EMPANADA DE LOMITO", unidades: 50, venta: 340 },
      { mes: "2026-11", nombre: "Y-EMPANADA DE LOMITO", unidades: 80, venta: 420 },
      { mes: "2026-11", nombre: "P-COOKIE XL", unidades: 0, venta: 0 },
    ], recetas);
    expect(r.get("A13")).toEqual({ precio: 6.8, mes: "2026-11", nombreByte: "P-EMPANADA DE LOMITO", unidades: 150, anterior: 6.5 });
    expect(r.has("A2")).toBe(false);
    expect(r.size).toBe(1);
  });

  it("el mismo nombre con «[ELIMINADO]» suma en su mes", () => {
    const r = preciosB2BDeByte([
      { mes: "2026-11", nombre: "P-COOKIE XL", unidades: 10, venta: 49.1 },
      { mes: "2026-11", nombre: "[ELIMINADO] P-COOKIE XL", unidades: 10, venta: 49.1 },
    ], recetas);
    expect(r.get("A2")).toMatchObject({ precio: 4.91, unidades: 20, anterior: null });
  });
});
