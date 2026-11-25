import { describe, expect, it } from "vitest";
import { equivalencia, factorPresentacion, parejasEntreListas, plural, precioBaseDesdePresentacion, precioPorPresentacion, textoPresentacion, unidadesPresentacion } from "./insumos-ficha";
import { categoriaDelSku, criticosPorGasto, diasEntre, esCritico, historialPorDia, mesesCerrados, tonoEdad, ultimoCambio, SIN_CATEGORIA } from "./insumos-ficha";

describe("insumos-ficha", () => {
  it("categoría por prefijo del SKU", () => {
    expect(categoriaDelSku("lc012")).toBe("Lácteos y Cremas");
    expect(categoriaDelSku("HR001")).toBe("Harinas y Cereales");
    expect(categoriaDelSku("SIS-A001")).toBe(SIN_CATEGORIA);
    expect(categoriaDelSku("ZZ9")).toBe(SIN_CATEGORIA);
  });

  it("críticos = los que hacen el 80% del gasto (el que cruza entra)", () => {
    const g = new Map([["a", 50], ["b", 25], ["c", 15], ["d", 10], ["e", 0]]);
    expect([...criticosPorGasto(g)].sort()).toEqual(["a", "b", "c"]);
    expect(criticosPorGasto(new Map()).size).toBe(0);
  });

  it("la estrella a mano manda sobre la sugerencia", () => {
    expect(esCritico(null, true)).toBe(true);
    expect(esCritico(false, true)).toBe(false);
    expect(esCritico(true, false)).toBe(true);
  });

  it("edad del precio", () => {
    expect(diasEntre("2026-11-07", "2026-11-24")).toBe(17);
    expect(tonoEdad(17)).toBe("reciente");
    expect(tonoEdad(45)).toBe("medio");
    expect(tonoEdad(61)).toBe("viejo");
  });

  it("historial: un precio por día, el del sistema manda; último cambio", () => {
    const h = historialPorDia([
      { fecha: "2026-11-07", precio: 28, sistema: false },
      { fecha: "2026-09-01", precio: 25, sistema: false },
      { fecha: "2026-11-07", precio: 30, sistema: true },
      { fecha: "2026-11-20", precio: 30, sistema: true },
    ]);
    expect(h).toEqual([{ fecha: "2026-09-01", precio: 25 }, { fecha: "2026-11-07", precio: 30 }, { fecha: "2026-11-20", precio: 30 }]);
    expect(ultimoCambio(h)).toEqual({ anterior: 25, pct: 20, fecha: "2026-11-07" });
    expect(ultimoCambio([{ fecha: "2026-11-07", precio: 3 }])).toBeNull();
  });

  it("meses cerrados", () => {
    expect(mesesCerrados("2026-11-24")).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(mesesCerrados("2026-02-03", 2)).toEqual(["2025-12", "2026-01"]);
  });
});

describe("presentación de compra", () => {
  const lata = { nombre: "lata", cantidad: 393, unidad: "g" as const };
  it("convierte la lata de 393 g", () => {
    expect(factorPresentacion("kg", lata)).toBe(0.393);
    expect(precioPorPresentacion(13.7405, 0.393)).toBe(5.4);
    expect(precioBaseDesdePresentacion(5.4, 0.393)).toBe(13.7405);
    expect(equivalencia(12, lata, "kg")).toBe("12 latas = 4.716 kg");
    expect(equivalencia(1, lata, "kg")).toBe("1 lata = 393 g");
    expect(textoPresentacion(lata)).toBe("lata de 393 g");
  });
  it("no mezcla unidades que no calzan", () => {
    expect(unidadesPresentacion("und")).toEqual(["und"]);
    expect(factorPresentacion("kg", { cantidad: 500, unidad: "ml" })).toBeNull();
    expect(factorPresentacion("und", { cantidad: 100, unidad: "und" })).toBe(100);
    expect(factorPresentacion("kg", { cantidad: 0, unidad: "g" })).toBeNull();
  });
  it("plural", () => {
    expect(plural("bolsa", 2)).toBe("bolsas");
    expect(plural("unidad", 3)).toBe("unidades");
    expect(plural("lata", 1)).toBe("lata");
  });
});

describe("el mismo insumo en las dos listas", () => {
  it("empareja por nombre, no por código, y no adivina si el nombre se repite", () => {
    const p = parejasEntreListas([
      { origen: "Atelier", sku: "LC011", nombre: "Leche condensada Gloria" },
      { origen: "Cafetería", sku: "LC011", nombre: "Leche Condensada  Gloria" },
      { origen: "Atelier", sku: "FR001", nombre: "Fresa" },
      { origen: "Cafetería", sku: "FR001", nombre: "Palta" },
      { origen: "Atelier", sku: "X1", nombre: "Azúcar" },
      { origen: "Atelier", sku: "X2", nombre: "Azucar" },
      { origen: "Cafetería", sku: "Y1", nombre: "Azúcar" },
    ]);
    expect(p.get("Atelier|LC011")).toBe("Cafetería|LC011");
    expect(p.get("Cafetería|LC011")).toBe("Atelier|LC011");
    expect(p.has("Atelier|FR001")).toBe(false);
    expect(p.has("Cafetería|Y1")).toBe(false);
  });
});
