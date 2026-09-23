import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { costoPorUnidadRegistrada, unidadSugerida } from "@/lib/costos-preparaciones";
import { leerPricingAtelier } from "@/lib/costos-preparaciones-excel";

function libro(hojas: Record<string, unknown[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

const CAB_PRICING = ["ID", "Grupo", "Categoría", "Producto maestro", "Origen", "Unidad", "Costo insumos Atelier", "Precio", "Vigente"];

const EXCEL = libro({
  PRICING: [
    ["PRICING MAESTRO YAYI'S"],
    CAB_PRICING,
    ["AT-049", "ATELIER - PASTELERÍA", "PASTELERÍA", "Cookie XL", "Atelier", "unidad", 1.3103, 3, "Sí"],
    ["AT-140", "ATELIER - NUEVOS", "NUEVOS", "Crema Pastelera (kg)", "Atelier", "kg", 9.214, 12, "Sí"],
    ["AT-138", "ATELIER - NUEVOS", "NUEVOS", "Buttercream [ARCHIVADO]", "Atelier", "kg", 10.68, 9, "No"],
    ["AT-150", "ATELIER - PASTELERÍA", "PASTELERÍA", "Torta sin costo", "Atelier", "unidad", null, 30, "Sí"],
    ["CF-001", "CAFETERÍA", "BEBIDAS", "Latte", "Cafetería", "unidad", null, null, "Sí"],
  ],
  "ATE · Sub-Recetas": [
    [null, "▼ Frosting de Chocolate", null, null, null, null, null, null, null, null, null, null, null, null, "OK"],
    [null, "Rendimiento por Receta sin merma", 1],
    [null, "📊 Costo por 1 KG", null, null, null, null, null, null, 18.378],
    [null, "▼ Crema Pastelera", null, null, null, null, null, null, null, null, null, null, null, null, "OK"],
    [null, "📊 Costo por 1 KG", null, null, null, null, null, null, 9.214],
    [null, "▼ Merengue  [ARCHIVADO 09-sep-2026 — mal costeado]", null, null, null, null, null, null, null, null, null, null, null, null, "ARCHIVADO"],
    [null, "📊 Costo por 1 KG", null, null, null, null, null, null, 7.65],
    [null, "▼ Cake de Chocolate - Torta Entera"],
    [null, "Sub Total", null, null, 1238],
  ],
  "ATE · Insumos": [
    ["SKU", "Nombre del Insumo / Packaging", "Precio de Compra (S/ x Kg)", "Cantidad de Compra", "Unidad de Compra", "Costo por Peso (g,ml)"],
    ["🫒 Aceites y Grasas"],
    ["AC005", "Mantequilla sin sal", 28, 1000, "g", 0.028],
    ["AC002", "Aceite de Oliva", 36.2, 1000, "ml", 0.0362],
    ["AZ003", "Azucar En Bolsa (Caja)", null, null, null, null],
    ["📦 Packaging"],
    ["PK005", "Bisagra CT4 opaco", 38, 100, "ciento", 0.38],
    ["🧑‍🍳 Sub-Recetas"],
    ["SR009", "Frosting de Chocolate", 18.378, 1000, "g", 0.018378],
  ],
});

describe("leerPricingAtelier", () => {
  const { items, avisos } = leerPricingAtelier(EXCEL);
  const por = (ref: string) => items.find((i) => i.ref === ref);

  it("toma los productos vigentes de Atelier con su costo en insumos", () => {
    expect(por("AT-049")).toMatchObject({ tipo: "producto", nombre: "Cookie XL", unidad: "und", costo: 1.3103 });
    expect(por("AT-138")).toBeUndefined(); // Vigente = No
    expect(por("CF-001")).toBeUndefined(); // cafetería
    expect(avisos.some((a) => a.includes("Torta sin costo"))).toBe(true);
  });

  it("lee el costo por kg de cada sub-receta y salta las archivadas", () => {
    expect(items.find((i) => i.nombre === "Frosting de Chocolate" && i.tipo === "preparacion")).toMatchObject({ unidad: "kg", costo: 18.378 });
    expect(items.some((i) => i.nombre.startsWith("Merengue"))).toBe(false);
    expect(avisos.some((a) => a.includes("Cake de Chocolate - Torta Entera"))).toBe(true);
  });

  it("no duplica una preparación que PRICING ya trae por kg", () => {
    expect(items.filter((i) => i.nombre.startsWith("Crema Pastelera"))).toHaveLength(1);
    expect(por("AT-140")).toBeDefined();
  });

  it("convierte los insumos a costo por kg, litro o unidad", () => {
    expect(por("AC005")).toMatchObject({ tipo: "insumo", unidad: "kg", costo: 28, categoria: "Aceites y Grasas" });
    expect(por("AC002")!.costo).toBeCloseTo(36.2);
    expect(por("AC002")!.unidad).toBe("l");
    expect(por("PK005")).toMatchObject({ unidad: "und", costo: 0.38, categoria: "Packaging" });
    expect(por("AZ003")).toBeUndefined(); // sin precio
    expect(por("SR009")).toBeUndefined(); // ya está como sub-receta
  });
});

describe("costo de la merma", () => {
  it("70 cookies XL", () => {
    expect(70 * costoPorUnidadRegistrada({ unidad: "und", costo: 1.3103452571 }, "und")!).toBeCloseTo(91.72, 2);
  });
  it("500 g de frosting de chocolate", () => {
    expect(500 * costoPorUnidadRegistrada({ unidad: "kg", costo: 18.378 }, "g")!).toBeCloseTo(9.189, 3);
    expect(costoPorUnidadRegistrada({ unidad: "kg", costo: 18.378 }, "kg")).toBe(18.378);
  });
  it("rechaza unidades que no calzan", () => {
    expect(costoPorUnidadRegistrada({ unidad: "und", costo: 1 }, "g")).toBeNull();
    expect(costoPorUnidadRegistrada({ unidad: "kg", costo: 1 }, "ml")).toBeNull();
  });
  it("las preparaciones se sugieren en gramos", () => {
    expect(unidadSugerida({ unidad: "kg" })).toBe("g");
    expect(unidadSugerida({ unidad: "l" })).toBe("ml");
    expect(unidadSugerida({ unidad: "und" })).toBe("und");
  });
});
