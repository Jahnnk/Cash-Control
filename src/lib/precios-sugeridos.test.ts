import { describe, expect, it } from "vitest";
import { foodCost, margen, precioPorMargen, redondearArriba, skuInsumoNuevo, sugeridoCafeteria, sugeridosAtelier, esInsumoDelSistema } from "./precios-sugeridos";
import { insumosDelSistema } from "./catalogo-costos-sql";
import { costoDeReceta } from "./recetas";
import type { PrecioVigente } from "./productos/precios-vigentes";
import type { CostoPreparacion } from "./costos-preparaciones";

describe("precios sugeridos (fase A)", () => {
  it("redondea hacia arriba sin errores de coma flotante", () => {
    expect(redondearArriba(4.5, 0.1)).toBe(4.5);
    expect(redondearArriba(4.51, 0.1)).toBe(4.6);
    expect(redondearArriba(12.01, 0.5)).toBe(12.5);
    expect(redondearArriba(0, 0.5)).toBe(0);
  });

  it("Atelier: interno al 60 %, B2B al 75 %, carta sobre el interno al 55 %", () => {
    // costo 2.00 → interno 5.00, B2B 8.00, carta 5.00 / 0.55 = 9.09 → 9.50
    expect(sugeridosAtelier(2, null)).toEqual({ interno: 5, b2b: 8, carta: 9.5 });
    // si Jahnn pone interno 6.00, la carta sugerida sale de ahí: 10.91 → 11.00
    expect(sugeridosAtelier(2, 6).carta).toBe(11);
    expect(precioPorMargen(1.23, 0.6)).toBe(3.1); // 3.075 → 3.10
  });

  it("cafetería: carta con food cost de 30 %", () => {
    expect(sugeridoCafeteria(3.6)).toBe(12); // 3.6 / 0.3 = 12.00 exacto
    expect(sugeridoCafeteria(3.7)).toBe(12.5); // 12.33 → 12.50
  });

  it("margen y food cost", () => {
    expect(margen(10, 4)).toBeCloseTo(0.6, 6);
    expect(foodCost(3, 10)).toBeCloseTo(0.3, 6);
    expect(margen(null, 4)).toBeNull();
    expect(foodCost(3, 0)).toBeNull();
  });

  it("SKU de insumo nuevo, separado por lado", () => {
    expect(skuInsumoNuevo("Atelier", ["AC005", "SIS-A002", "SIS-C007"])).toBe("SIS-A003");
    expect(skuInsumoNuevo("Cafetería", [])).toBe("SIS-C001");
    expect(esInsumoDelSistema("SIS-A010")).toBe(true);
    expect(esInsumoDelSistema("AC005")).toBe(false);
  });
});

describe("insumos creados en el sistema en la lista de Atelier", () => {
  const v = (origen: "Atelier" | "Cafetería", sku: string, nombre: string, unidad: string, precio: number): PrecioVigente => ({
    origen, sku, nombre, unidad, precio, base: null, fechaBase: null, fecha: "2026-11-24", delSistema: true, cambioPct: 0,
  });
  const excel: CostoPreparacion[] = [{ ref: "AC005", tipo: "insumo", nombre: "Mantequilla", categoria: null, unidad: "kg", costo: 28 }];

  it("entran solo los SIS-A de Atelier, como insumos con su precio", () => {
    const r = insumosDelSistema([
      v("Atelier", "SIS-A001", "Jengibre en polvo", "kg", 12),
      v("Cafetería", "SIS-C001", "Pavo", "kg", 40),
      v("Atelier", "AC005", "Mantequilla", "kg", 30),
    ], excel);
    expect(r).toEqual([{ ref: "SIS-A001", tipo: "insumo", nombre: "Jengibre en polvo", categoria: "Insumos nuevos", unidad: "kg", costo: 12 }]);
  });

  it("una casita de jengibre se costea con el insumo nuevo", () => {
    const lista = [...excel, ...insumosDelSistema([v("Atelier", "SIS-A001", "Jengibre en polvo", "kg", 12)], excel)];
    const buscar = (ref: string) => lista.find((i) => i.ref === ref) ?? null;
    // 500 g mantequilla (14.00) + 50 g jengibre (0.60) = 14.60 ÷ (10 casitas × 0.9) = 1.6222
    const c = costoDeReceta("producto", {
      rendimiento: 10, merma: 0.1,
      ingredientes: [{ ref: "AC005", nombre: "Mantequilla", unidad: "g", cantidad: 500 }, { ref: "SIS-A001", nombre: "Jengibre", unidad: "g", cantidad: 50 }],
    }, buscar);
    expect(c.faltantes).toEqual([]);
    expect(c.costo).toBeCloseTo(14.6 / 9, 4);
  });
});
