/**
 * Tests del colector de hechos.
 *
 * Lo que se clava: la FUSIÓN entre sedes (lo nuevo) y la exclusión de
 * los productos que Byte marcó como eliminados — los dos casos que
 * hacían que la matriz de la reunión mintiera.
 */
import { describe, it, expect } from "vitest";
import { armarFacts, keyDeCarta, estaEliminadoEnByte, type FilaVenta } from "../facts-sql";

const venta = (o: Partial<FilaVenta>): FilaVenta => ({
  product_id: null, product_name_raw: "X", units: 10, revenue: 100,
  catalog_name: null, category: null, unit_cogs: 4, list_price: 10,
  target_margin_pct: 0.6, cost_month: "2026-07", ...o,
});

const armar = (ventas: FilaVenta[], fusionar = true) =>
  armarFacts({
    scope: { businessId: 0, businessName: "Cadena" },
    month: "2026-08", ventas, historia: [], historyMonths: ["2026-08"],
    fusionarSedes: fusionar,
  });

describe("fusión del mismo plato entre sedes", () => {
  // El catálogo trae 130 productos de Fonavi con sufijo que son el mismo
  // plato que en Centro. Sin fusionar, cada uno lleva la mitad de las
  // unidades y ninguno llega al umbral de popularidad.
  it("une 'Cappuccino' con 'Cappuccino (Fonavi)' sumando unidades y venta", () => {
    const f = armar([
      venta({ product_id: "a", catalog_name: "Cappuccino", product_name_raw: "CAPPUCCINO", units: 80, revenue: 960 }),
      venta({ product_id: "b", catalog_name: "Cappuccino (Fonavi)", product_name_raw: "CAPPUCCINO", units: 98, revenue: 1176 }),
    ])!;
    expect(f.products).toHaveLength(1);
    expect(f.products[0].name).toBe("Cappuccino");   // el sufijo no se muestra
    expect(f.products[0].units).toBe(178);
    expect(f.products[0].revenue).toBe(2136);
  });

  it("SIN fusionar los deja separados: una sola sede no tiene qué unir", () => {
    const f = armar([
      venta({ product_id: "a", catalog_name: "Cappuccino", units: 80, revenue: 960 }),
      venta({ product_id: "b", catalog_name: "Cappuccino (Fonavi)", units: 98, revenue: 1176 }),
    ], false)!;
    expect(f.products).toHaveLength(2);
  });

  it("no fusiona platos distintos que solo se parecen", () => {
    const f = armar([
      venta({ catalog_name: "Empanada Mixta", product_name_raw: "EMPANADA MIXTA" }),
      venta({ catalog_name: "Empanada de Lomito", product_name_raw: "EMPANADA DE LOMITO" }),
    ])!;
    expect(f.products).toHaveLength(2);
  });

  it("pondera el costo por unidades cuando las sedes lo tienen distinto", () => {
    // 100 und a S/3 + 300 und a S/5 → (300 + 1500) / 400 = S/4.50
    const f = armar([
      venta({ catalog_name: "Pan", product_name_raw: "PAN", units: 100, revenue: 800, unit_cogs: 3 }),
      venta({ catalog_name: "Pan (Fonavi)", product_name_raw: "PAN", units: 300, revenue: 2400, unit_cogs: 5 }),
    ])!;
    expect(f.products[0].unitCogs).toBeCloseTo(4.5, 4);
  });

  it("el precio promedio se recalcula sobre el total, no se promedia", () => {
    const f = armar([
      venta({ catalog_name: "Café", product_name_raw: "CAFE", units: 10, revenue: 100 }),   // S/10
      venta({ catalog_name: "Café (Fonavi)", product_name_raw: "CAFE", units: 90, revenue: 1350 }), // S/15
    ])!;
    expect(f.products[0].avgPrice).toBe(14.5);   // 1450/100, no (10+15)/2
  });
});

describe("productos eliminados en Byte", () => {
  it("reconoce la marca que pone Byte al renombrarlos", () => {
    expect(estaEliminadoEnByte("[ELIMINADO 2026-05-05 12:02:16] JUGO DE FRESA")).toBe(true);
    expect(estaEliminadoEnByte("Jugo de Fresa")).toBe(false);
  });

  it("los saca del análisis: si no están en la carta, no se discuten", () => {
    const f = armar([
      venta({ product_name_raw: "[ELIMINADO 2026-05-05 12:02:16] JUGO", revenue: 5000 }),
      venta({ catalog_name: "Cappuccino", product_name_raw: "CAPPUCCINO" }),
    ])!;
    expect(f.products.map((p) => p.name)).toEqual(["Cappuccino"]);
  });

  it("si TODO estaba eliminado, no inventa un portafolio vacío", () => {
    expect(armar([venta({ product_name_raw: "[ELIMINADO 2026-01-01 00:00:00] X" })])).toBeNull();
  });
});

describe("keyDeCarta", () => {
  it("iguala el mismo plato escrito de las dos formas", () => {
    expect(keyDeCarta("Cappuccino (Fonavi)", "x")).toBe(keyDeCarta("Cappuccino", "y"));
  });

  it("cae al nombre crudo cuando no hay catálogo", () => {
    expect(keyDeCarta(null, "EMPANADA MIXTA")).toBe(keyDeCarta(null, "Empanada Mixta"));
  });
});
