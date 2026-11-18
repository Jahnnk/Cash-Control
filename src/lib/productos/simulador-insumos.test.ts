/**
 * Simulador de alza de insumos e historial de precios (mejoras B y C del Excel de pricing, 18-nov-2026).
 */
import { describe, it, expect } from "vitest";
import { desglosar, type BloqueReceta, type LineaReceta } from "./desglose-insumos";
import { alzaPorSku, historialDePrecios, type FotoPrecio } from "./insumos-precios";
import { claveInsumo, pesoDeInsumos, precioParaMantener, simular, type ProductoSim } from "./simulador-insumos";

const linea = (sku: string, nombre: string, aporte: number | null, total: number | null = null): LineaReceta => ({ sku, nombre, aporte, total });

describe("desglose por insumo", () => {
  it("abre las sub-recetas en la proporción de su receta", () => {
    // Mayonesa de la casa: aceite S/ 3 y huevo S/ 1 en la receta entera → 75% / 25%.
    const mayonesa: BloqueReceta = { nombre: "Mayonesa Yayi's", lineas: [linea("AC003", "Aceite Vegetal", 0.3, 3), linea("HV003", "Huevo", 0.1, 1)] };
    const triple: BloqueReceta = { nombre: "Triple Yayi's", lineas: [linea("CA012", "Pollo", 0.92), linea("SR040", "Mayonesa Yayi's", 0.4), linea("PN015", "Pan de molde", 1.07)] };
    const d = desglosar(triple, (l) => (l.sku === "SR040" ? mayonesa : undefined));
    expect(d).toEqual([
      { sku: "PN015", nombre: "Pan de molde", costo: 1.07 },
      { sku: "CA012", nombre: "Pollo", costo: 0.92 },
      { sku: "AC003", nombre: "Aceite Vegetal", costo: 0.3 },
      { sku: "HV003", nombre: "Huevo", costo: 0.1 },
    ]);
  });
  it("un insumo que aparece directo y dentro de una sub-receta se suma; sin costo, no entra", () => {
    const masa: BloqueReceta = { nombre: "Masa", lineas: [linea("AC005", "Mantequilla", null, 4), linea("HR009", "Harina", null, 4)] };
    const p: BloqueReceta = { nombre: "Empanada", lineas: [linea("AC005", "Mantequilla", 0.2), linea("SR001", "Masa", 0.6), linea("", "Queso Edam", null)] };
    expect(desglosar(p, (l) => (l.sku === "SR001" ? masa : undefined))).toEqual([
      { sku: "AC005", nombre: "Mantequilla", costo: 0.5 },
      { sku: "HR009", nombre: "Harina", costo: 0.3 },
    ]);
  });
});

describe("historial de precios", () => {
  const foto = (fecha: string, sku: string, precio: number, origen: FotoPrecio["origen"] = "Atelier"): FotoPrecio => ({ fecha, origen, sku, nombre: sku, unidad: "kg", precio });
  it("compara la primera foto con la última de cada insumo", () => {
    const h = historialDePrecios([foto("2026-11-07", "AC005", 28), foto("2026-12-05", "AC005", 33.6), foto("2026-11-07", "HR009", 2.778), foto("2026-12-05", "HR009", 2.778)]);
    expect(h.fechas).toEqual(["2026-11-07", "2026-12-05"]);
    expect(h.cambios).toEqual([{ origen: "Atelier", sku: "AC005", nombre: "AC005", unidad: "kg", desde: "2026-11-07", hasta: "2026-12-05", antes: 28, ahora: 33.6, cambioPct: 20 }]);
  });
  it("con una sola foto no hay cambios", () => {
    expect(historialDePrecios([foto("2026-11-07", "AC005", 28)]).cambios).toEqual([]);
  });
  it("el alza de un SKU que compran Atelier y las cafeterías es el promedio de las dos", () => {
    const h = historialDePrecios([foto("2026-11-07", "AC005", 28), foto("2026-12-05", "AC005", 33.6), foto("2026-11-07", "AC005", 30, "Cafetería"), foto("2026-12-05", "AC005", 33, "Cafetería")]);
    expect(alzaPorSku(h.cambios).get("AC005")).toBe(15);
  });
});

describe("simulador", () => {
  const brownie: ProductoSim = { nombre: "Brownie", unidadesMes: 100, precio: 9, costo: 2.5, deAtelier: true, desglose: [{ sku: "AC005", nombre: "Mantequilla", costo: 1.5 }, { sku: "CC007", nombre: "Cacao", costo: 1 }] };
  const pie: ProductoSim = { nombre: "Pie de manzana", unidadesMes: 50, precio: 8, costo: 2.6, deAtelier: true, desglose: [{ sku: "AC005", nombre: "Mantequilla", costo: 1 }, { sku: "FR001", nombre: "Manzana", costo: 1.6 }] };

  it("lo que pesa cada insumo al mes en lo vendido", () => {
    const p = pesoDeInsumos([brownie, pie]);
    // Mantequilla: 1.5 × 100 + 1 × 50 = 200 de 380.
    expect(p[0]).toEqual({ clave: "AC005", sku: "AC005", nombre: "Mantequilla", costoMes: 200, pct: 52.6, productos: 2 });
  });

  it("mantequilla +20%: cuánto más cuesta al mes y quién pasa el 35%", () => {
    const r = simular([brownie, pie], new Map([[claveInsumo({ sku: "AC005", nombre: "" }), 20]]));
    // Brownie: 2.5 → 2.8 (27.8% → 31.1%). Pie: 2.6 → 2.8 (32.5% → 35%, no lo pasa).
    expect(r.extraMes).toBe(40);
    expect(r.productos.map((p) => [p.nombre, p.costoDespues, p.pctDespues, p.cruza, p.extraMes])).toEqual([["Brownie", 2.8, 31.1, false, 30], ["Pie de manzana", 2.8, 35, false, 10]]);
    // Con +30% el pie pasa el 35%.
    expect(simular([brownie, pie], new Map([["AC005", 30]])).productos.find((p) => p.nombre === "Pie de manzana")!.cruza).toBe(true);
  });

  it("el precio para seguir ganando lo mismo por unidad, redondeado como la carta", () => {
    // Empanada de S/ 8 cuyo costo sube S/ 0.13: S/ 8.13 → S/ 8.50 (no S/ 9).
    expect(precioParaMantener(8, 1.72, 1.85)).toBe(8.5);
    // 16.9 + 0.5 = 17.4 → de sol en sol y en .9: S/ 17.90.
    expect(precioParaMantener(16.9, 5, 5.5)).toBe(17.9);
    expect(precioParaMantener(12, 3, 3)).toBe(12);
  });

  it("sin alzas no cambia nada", () => {
    expect(simular([brownie], new Map())).toMatchObject({ productos: [], extraMes: 0, subidaCostoPct: 0 });
  });
});
