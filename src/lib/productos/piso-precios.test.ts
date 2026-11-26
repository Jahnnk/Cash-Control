/**
 * El piso de precios (pedido de Jahnn, 15-oct-2026). Desde el 25-nov-2026 usa la meta única de la ruta de precios:
 * costo de insumos ≤ 30% del precio (cafetería) o ≤ 22% (lo que hace Atelier). Se clava el estado, el precio
 * sugerido (el de la ruta) y lo que dejaría subirlo.
 */
import { describe, it, expect } from "vitest";
import { pisoDePrecios, estadoFrenteMeta } from "./piso-precios";
import type { ProductoRentable, RentabilidadSede } from "./rentabilidad";

/** `costo` = costo de insumos (el que cuenta para el piso); `internoAtelier` = el precio interno que ve la cafetería en lo que hace Atelier. */
const prod = (nombre: string, precio: number | null, costo: number | null, unidades: number, internoAtelier: number | null = null): ProductoRentable => ({
  nombre, familia: "Sánguches", unidades, ingresos: (precio ?? 0) * unidades, precio,
  costo: internoAtelier ?? costo, costoInsumos: costo, deAtelier: internoAtelier !== null, origen: null,
  margenUnidad: null, margenPct: null, deja: null, marca: null,
});
const sede = (productos: ProductoRentable[]): RentabilidadSede => ({
  businessId: 2, sede: "Fonavi", mes: "2026-09", desde: "2026-09-01", hasta: "2026-09-30", dias: 30, productos,
  ventasCarta: 0, coberturaPct: 100, margenPromedioPct: null, dejaTotal: 0, top10Pct: null, sinCosto: [], conteo: { campeon: 0, "mucho-deja-poco": 0, joya: 0 },
});

describe("el piso de precios", () => {
  it("la meta de la ruta decide el estado: cafetería 30% (sano hasta 25%), Atelier 22% (sano hasta 17%)", () => {
    expect([20, 25, 25.1, 30, 30.1].map((c) => estadoFrenteMeta(c, false))).toEqual(["holgado", "holgado", "sano", "sano", "bajo"]);
    expect([17, 17.1, 22, 22.1].map((c) => estadoFrenteMeta(c, true))).toEqual(["holgado", "sano", "sano", "bajo"]);
  });

  it("el piso es costo ÷ 0.30 y el sugerido es el de la ruta (de S/ 0.50 en S/ 0.50)", () => {
    const r = pisoDePrecios(sede([prod("Sánguche de Pavo", 12, 5.12, 100)]));
    expect(r.filas[0]).toMatchObject({ piso: 17.07, precioSugerido: 17.5, subida: 5.5, extraMes: 550, estado: "bajo", costoPct: 42.7, metaPct: 30, margenPct: 57.3 });
  });

  it("un producto que ya cumple no pide nada", () => {
    const r = pisoDePrecios(sede([prod("Café Americano", 9, 2, 200)]));
    expect(r.filas[0]).toMatchObject({ estado: "holgado", subida: 0, extraMes: 0, costoPct: 22.2 });
    expect(r.bajo).toBe(0);
    expect(r.extraTotal).toBe(0);
  });

  it("los que están bajo el piso van primero, el que más dejaría arriba", () => {
    const r = pisoDePrecios(sede([prod("Café", 9, 2, 500), prod("Chico", 10, 4, 10), prod("Grande", 10, 4, 300), prod("Pan", 6, 2.5, 100)]));
    expect(r.filas.map((f) => f.nombre)).toEqual(["Grande", "Pan", "Chico", "Café"]);
  });

  it("resumen: cuántos están bajo el piso, qué % de lo vendido, el margen de la carta y lo que dejaría subir", () => {
    const r = pisoDePrecios(sede([prod("Café", 9, 2, 100), prod("Sánguche", 12, 5.12, 100)]));
    expect(r).toMatchObject({ conCosto: 2, bajo: 1, ventasBajoPct: 57, extraTotal: 550 });
    // (900−200 + 1200−512) ÷ 2100
    expect(r.margenCartaPct).toBe(66.1);
    // Los dos son de cafetería: la meta pide 70% de margen.
    expect(r.margenMetaPct).toBe(70);
  });

  it("con el mes a medias, «al mes» se escala a un mes completo (10 días de 30 → ×3)", () => {
    const base = sede([prod("Sánguche de Pavo", 12, 5.12, 100)]);
    const aMedias = { ...base, desde: "2026-09-01", hasta: "2026-09-10", dias: 10 };
    expect(pisoDePrecios(aMedias).filas[0].extraMes).toBe(1650);
    expect(pisoDePrecios(base).filas[0].extraMes).toBe(550);
  });

  it("sin precio o sin costo de insumos no hay piso: el producto no entra (y los de precio sin costo se cuentan)", () => {
    const r = pisoDePrecios(sede([prod("Sin costo", 10, null, 50), prod("Sin precio", null, 3, 50), prod("Ok", 9, 2, 10)]));
    expect(r.filas.map((f) => f.nombre)).toEqual(["Ok"]);
    expect(r.conCosto).toBe(1);
    expect(r.sinInsumos).toBe(1);
  });

  it("en lo que hace Atelier se mide sobre sus INSUMOS con la meta de 22% (no sobre el precio interno)", () => {
    // Empanada mixta: precio S/8, precio interno de Atelier S/4.50, insumos S/1.72 → 21.5%: en la meta.
    const r = pisoDePrecios(sede([prod("Empanada Mixta", 8, 1.72, 100, 4.5)]));
    expect(r.filas[0]).toMatchObject({ costo: 1.72, metaPct: 22, margenPct: 78.5, estado: "sano", subida: 0 });
    // A S/7 pasaría la meta (24.6%) y se sugiere el precio de la ruta: interno 4.30 ÷ 0.55 → S/ 8.
    const b = pisoDePrecios(sede([prod("Empanada Mixta", 7, 1.72, 100, 4.5)]));
    expect(b.filas[0]).toMatchObject({ estado: "bajo", precioSugerido: 8, subida: 1 });
  });
});
