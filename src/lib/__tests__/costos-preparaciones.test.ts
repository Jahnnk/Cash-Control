import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { claveNombre, costoPorUnidadRegistrada, unidadSugerida } from "@/lib/costos-preparaciones";
import { leerPricingAtelier } from "@/lib/costos-preparaciones-excel";
import { costoDeReceta } from "@/lib/recetas";

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
    [null, "% Merma de Preparación", 0.03],
    ["SKU", "Ingrediente", "Und", "Precio por Kg/Lt (S/)", "Q x Receta", "Costo Total de Receta (S/)", "Precio Unt. g/ml"],
    ["AC005", "Mantequilla sin sal", "g", 28, 400, 11.2, 0.028],
    ["OT012", "Polvo de hornear", "g", 12.76, 8, 0.1, 0.01276],
    [null, "Sub Total", null, null, 408],
    [null, "📊 Costo por 1 KG", null, null, null, null, null, null, 18.378],
    [null, "▼ Crema Pastelera", null, null, null, null, null, null, null, null, null, null, null, null, "OK"],
    [null, "📊 Costo por 1 KG", null, null, null, null, null, null, 9.214],
    [null, "▼ Merengue  [ARCHIVADO 09-sep-2026 — mal costeado]", null, null, null, null, null, null, null, null, null, null, null, null, "ARCHIVADO"],
    [null, "📊 Costo por 1 KG", null, null, null, null, null, null, 7.65],
    [null, "▼ Cake de Chocolate - Torta Entera"],
    [null, "Sub Total", null, null, 1238],
  ],
  "ATE · Pastelería": [
    [null, "▼ Tarta Nueva"],
    [null, "Rendimiento por Receta:", 10],
    ["SKU", "Ingrediente", "Und", "Precio por Kg/Lt (S/)", "Q x Receta", "Costo Total de Receta (S/)", "Precio Unt. g/ml", "Q x Und.Prod. (g/ml)", "% Merma", "Costo con Merma", "Costo Merma S/", "Costo Unitario (S/)"],
    ["AC005", "Mantequilla sin sal", "g", 28, 500, 14, 0.028, 50, 0, 1.4, 0, 1.4],
    [null, "Sub Total", null, null, 500, 14, null, 50, null, 1.4, 0, 1.4],
    [null, "TOTAL COSTO FINAL X PRODUCTO", null, null, null, null, null, null, null, 1.4, 0, 1.4],
    [null, "▼ Torta Vieja  [ARCHIVADO 07-sep-2026]"],
    [null, "Rendimiento por Receta:", 1],
    ["SKU", "Ingrediente", "Und", "Precio por Kg/Lt (S/)", "Q x Receta", "Costo Total de Receta (S/)", "Precio Unt. g/ml", "Q x Und.Prod. (g/ml)", "% Merma", "Costo con Merma", "Costo Merma S/", "Costo Unitario (S/)"],
    ["AC005", "Mantequilla sin sal", "g", 28, 100, 2.8, 0.028, 100, 0, 2.8, 0, 2.8],
    [null, "TOTAL COSTO FINAL X PRODUCTO", null, null, null, null, null, null, null, 2.8, 0, 2.8],
  ],
  "ATE · Insumos": [
    ["SKU", "Nombre del Insumo / Packaging", "Precio de Compra (S/ x Kg)", "Cantidad de Compra", "Unidad de Compra", "Costo por Peso (g,ml)"],
    ["🫒 Aceites y Grasas"],
    ["AC005", "Mantequilla sin sal", 28, 1000, "g", 0.028],
    ["AC002", "Aceite de Oliva", 36.2, 1000, "ml", 0.0362],
    ["AZ003", "Azucar En Bolsa (Caja)", null, null, null, null],
    ["OT012", "Agua en Bidón", 9, 20000, "ml", 0.00045],
    ["OT012", "Polvo de hornear", 63.8, 5000, "g", 0.01276],
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

describe("recetas del Excel", () => {
  const { items, avisos } = leerPricingAtelier(EXCEL);

  it("guarda los ingredientes de cada sub-receta para poder abrirla", () => {
    const f = items.find((i) => i.nombre === "Frosting de Chocolate" && i.tipo === "preparacion")!;
    expect(f.detalle?.ingredientes.map((g) => [g.ref, g.cantidad, g.unidad])).toEqual([["AC005", 400, "g"], ["OT012·2", 8, "g"]]);
    // Abierta en el sistema tiene que dar el mismo costo que el Excel: si la
    // mezcla no calza con "Costo por 1 KG", se guardan los kg que salen.
    const porRef = (ref: string) => items.find((i) => i.ref === ref) ?? null;
    expect(costoDeReceta("preparacion", f.detalle!, porRef).costo).toBeCloseTo(18.378, 3);
  });

  it("un producto con receta pero sin fila en PRICING entra igual, por unidad", () => {
    const r = leerPricingAtelier(EXCEL);
    const t = r.items.find((i) => i.nombre === "Tarta Nueva");
    expect(t).toMatchObject({ ref: "PROD:tarta nueva", tipo: "producto", unidad: "und", costo: 1.4, categoria: "Pastelería" });
    expect(t?.detalle?.rendimiento).toBe(10);
    expect(r.sinPricing).toEqual(["Tarta Nueva"]);
    expect(r.items.some((i) => i.nombre.startsWith("Torta Vieja"))).toBe(false); // archivada
  });

  it("un SKU repetido no esconde el segundo insumo y se avisa", () => {
    expect(items.find((i) => i.ref === "OT012")?.nombre).toBe("Agua en Bidón");
    expect(items.find((i) => i.ref === "OT012·2")?.nombre).toBe("Polvo de hornear");
    expect(avisos.some((a) => a.includes("OT012"))).toBe(true);
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

describe("claveNombre", () => {
  it("compara sin tildes, mayúsculas ni el kg del final", () => {
    expect(claveNombre("Crema Pastelera (kg)")).toBe(claveNombre("crema  pastelera"));
    expect(claveNombre("Granola Yayi's Kg")).toBe(claveNombre("Granola Yayi's"));
    expect(claveNombre("Masa de Pie de Manzana")).toBe(claveNombre("MASA DE PIE DE MANZANA"));
    expect(claveNombre("Pulpa de Maracuyá")).toBe(claveNombre("Pulpa de maracuya"));
  });
});
