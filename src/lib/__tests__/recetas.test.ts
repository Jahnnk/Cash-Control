import { describe, expect, it } from "vitest";
import { catalogoEfectivo, costoDeReceta, costoIngrediente, erroresDeReceta, type RecetaSistema } from "@/lib/recetas";
import type { CostoPreparacion } from "@/lib/costos-preparaciones";

const ins = (ref: string, nombre: string, unidad: "kg" | "l" | "und", costo: number): CostoPreparacion =>
  ({ ref, tipo: "insumo", nombre, categoria: null, unidad, costo });

// Precios del Excel de septiembre (ATE · Insumos).
const EXCEL: CostoPreparacion[] = [
  ins("HR009", "Harina Pastelera Nicolini", "kg", 2.778),
  ins("AC005", "Mantequilla sin sal", "kg", 28),
  ins("AZ004", "Azúcar Impalpable", "kg", 5.6),
  ins("HV002", "Huevos de corral x peso", "kg", 12.7272),
  ins("ES015", "Extracto de vainilla", "l", 18),
  ins("ES025", "Sal de maras", "kg", 6),
  ins("OT012", "Polvo de hornear", "kg", 12.76),
  { ref: "SUB:masa madre", tipo: "preparacion", nombre: "Masa Madre", categoria: null, unidad: "kg", costo: 2.025 },
  ins("PK004", "Bisagra 5x5", "und", 0.65),
  { ref: "AT-034", tipo: "producto", nombre: "Pie de Manzana", categoria: null, unidad: "und", costo: 1.632 },
];

const MASA_PIE: RecetaSistema = {
  id: 1, nombre: "Masa de Pie de Manzana", tipo: "preparacion", reemplaza: null, categoria: null,
  detalle: {
    rendimiento: null, merma: 0,
    ingredientes: [
      { ref: "HR009", nombre: "Harina", unidad: "g", cantidad: 900 },
      { ref: "AC005", nombre: "Mantequilla", unidad: "g", cantidad: 400 },
      { ref: "AZ004", nombre: "Azúcar impalpable", unidad: "g", cantidad: 300 },
      { ref: "HV002", nombre: "Huevos", unidad: "g", cantidad: 100 },
      { ref: "ES015", nombre: "Vainilla", unidad: "ml", cantidad: 4 },
      { ref: "ES025", nombre: "Sal", unidad: "g", cantidad: 6 },
      { ref: "OT012", nombre: "Polvo de hornear", unidad: "g", cantidad: 8 },
      { ref: "SUB:masa madre", nombre: "Masa madre", unidad: "g", cantidad: 100 },
    ],
  },
};

const buscarEn = (l: CostoPreparacion[]) => (ref: string) => l.find((i) => i.ref === ref) ?? null;

describe("costo de una receta", () => {
  it("masa de pie de manzana: S/17.07 por 1,818 g → S/9.39 el kg", () => {
    const c = costoDeReceta("preparacion", MASA_PIE.detalle, buscarEn(EXCEL));
    expect(c.total).toBeCloseTo(17.0655, 3);
    expect(c.kilos).toBeCloseTo(1.818, 3);
    expect(c.costo).toBeCloseTo(9.387, 3);
    expect(c.faltantes).toEqual([]);
  });

  it("la merma de preparación sube el costo por kg; los kg finales mandan si se conocen", () => {
    expect(costoDeReceta("preparacion", { ...MASA_PIE.detalle, merma: 0.1 }, buscarEn(EXCEL)).costo).toBeCloseTo(9.387 / 0.9, 3);
    expect(costoDeReceta("preparacion", { ...MASA_PIE.detalle, rendimiento: 1 }, buscarEn(EXCEL)).costo).toBeCloseTo(17.0655, 3);
  });

  it("producto: costo por unidad = total ÷ rendimiento", () => {
    const c = costoDeReceta("producto", { rendimiento: 8, merma: 0, ingredientes: [
      { ref: "AC005", nombre: "Mantequilla", unidad: "kg", cantidad: 1 },
      { ref: "PK004", nombre: "Bisagra", unidad: "und", cantidad: 8 },
    ] }, buscarEn(EXCEL));
    expect(c.costo).toBeCloseTo((28 + 8 * 0.65) / 8, 6);
    expect(c.kilos).toBe(1); // las unidades no pesan
  });

  it("marca los ingredientes sin precio en vez de inventarlos", () => {
    const c = costoDeReceta("preparacion", { rendimiento: null, merma: 0, ingredientes: [
      { ref: null, nombre: "Pan Ciabatta", unidad: "g", cantidad: 100 },
      { ref: "PK004", nombre: "Bisagra en gramos", unidad: "g", cantidad: 5 },
    ] }, buscarEn(EXCEL));
    expect(c.faltantes).toEqual(["Pan Ciabatta", "Bisagra en gramos"]);
  });

  it("entre peso y volumen asume densidad 1, como el Excel", () => {
    expect(costoIngrediente({ unidad: "l", costo: 18 }, 4, "g")).toBeCloseTo(0.072);
    expect(costoIngrediente({ unidad: "kg", costo: 10 }, 230, "ml")).toBeCloseTo(2.3);
    expect(costoIngrediente({ unidad: "und", costo: 1 }, 1, "kg")).toBeNull();
  });
});

describe("la lista con las recetas del sistema", () => {
  it("suma las recetas nuevas y oculta las del Excel que reemplazan", () => {
    const nuevoPie: RecetaSistema = { id: 2, nombre: "Pie de Manzana", tipo: "producto", reemplaza: "AT-034", categoria: null,
      detalle: { rendimiento: 20, merma: 0, ingredientes: [{ ref: "REC:1", nombre: "Masa de pie", unidad: "g", cantidad: 1818 }] } };
    const l = catalogoEfectivo(EXCEL, [MASA_PIE, nuevoPie]);
    expect(l.find((i) => i.ref === "AT-034")).toBeUndefined();
    const pie = l.find((i) => i.ref === "REC:2")!;
    expect(pie).toMatchObject({ origen: "sistema", reemplaza: "AT-034", unidad: "und" });
    expect(pie.costo).toBeCloseTo(17.0655 / 20, 4);
    expect(l.find((i) => i.ref === "REC:1")).toMatchObject({ tipo: "preparacion", unidad: "kg" });
  });

  it("quien usaba el ítem reemplazado pasa a usar la versión del sistema", () => {
    const masaPropia: RecetaSistema = { ...MASA_PIE, id: 3, nombre: "Masa madre (nueva)", reemplaza: "SUB:masa madre",
      detalle: { rendimiento: 1, merma: 0, ingredientes: [{ ref: "HR009", nombre: "Harina", unidad: "kg", cantidad: 1 }] } };
    const usa: RecetaSistema = { ...MASA_PIE, id: 4, nombre: "Usa masa madre",
      detalle: { rendimiento: null, merma: 0, ingredientes: [{ ref: "SUB:masa madre", nombre: "Masa madre", unidad: "kg", cantidad: 1 }] } };
    const l = catalogoEfectivo(EXCEL, [masaPropia, usa]);
    expect(l.find((i) => i.ref === "REC:4")!.costo).toBeCloseTo(2.778);
  });

  it("un ciclo deja la receta fuera en vez de colgarse", () => {
    const a: RecetaSistema = { ...MASA_PIE, id: 5, nombre: "A", detalle: { rendimiento: null, merma: 0, ingredientes: [{ ref: "REC:6", nombre: "B", unidad: "g", cantidad: 1 }] } };
    const b: RecetaSistema = { ...MASA_PIE, id: 6, nombre: "B", detalle: { rendimiento: null, merma: 0, ingredientes: [{ ref: "REC:5", nombre: "A", unidad: "g", cantidad: 1 }] } };
    const l = catalogoEfectivo(EXCEL, [a, b]);
    expect(l.some((i) => i.ref === "REC:5" || i.ref === "REC:6")).toBe(false);
  });
});

describe("validación", () => {
  it("pide nombre, ingredientes de la lista y rendimiento en productos", () => {
    const e = erroresDeReceta({ nombre: " ", tipo: "producto", detalle: { rendimiento: null, merma: 0, ingredientes: [{ ref: null, nombre: "x", unidad: "g", cantidad: 0 }] } });
    expect(e).toEqual(expect.arrayContaining([
      "Ponle nombre a la receta.", '"x": elígelo de la lista.', '"x": la cantidad tiene que ser mayor a 0.', "Pon cuántas unidades rinde la receta.",
    ]));
    expect(erroresDeReceta(MASA_PIE)).toEqual([]);
  });
});
