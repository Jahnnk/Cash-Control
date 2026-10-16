/**
 * Mano de obra por producto, método 2 del coach (15-oct-2026): la planilla se reparte en proporción
 * a las ventas. Se clava el reparto, que todos carguen el mismo %, y el margen tras insumos y sueldos.
 */
import { describe, it, expect } from "vitest";
import { manoDeObraPorProducto } from "./mano-de-obra";
import type { ProductoRentable, RentabilidadSede } from "./rentabilidad";

const prod = (nombre: string, precio: number | null, costoInsumos: number | null, unidades: number): ProductoRentable => ({
  nombre, familia: "Sánguches", unidades, ingresos: (precio ?? 0) * unidades, precio, costo: costoInsumos, costoInsumos, deAtelier: false, origen: null,
  margenUnidad: null, margenPct: null, deja: null, marca: null,
});
const sede = (productos: ProductoRentable[]): RentabilidadSede => ({
  businessId: 2, sede: "Fonavi", mes: "2026-09", desde: "2026-09-01", hasta: "2026-09-30", dias: 30, productos,
  ventasCarta: 0, coberturaPct: 100, margenPromedioPct: null, dejaTotal: 0, top10Pct: null, sinCosto: [], conteo: { campeon: 0, "mucho-deja-poco": 0, joya: 0 },
});
// Planilla 8,000 sobre ventas de 30,000 = 26.7% de cada sol vendido.
const BASE = { planilla: 8000, ventas: 30000, mes: "2026-09" };

describe("método 2: la planilla se reparte en proporción a las ventas", () => {
  it("cada producto lleva el mismo % de su precio en sueldos", () => {
    const r = manoDeObraPorProducto(sede([prod("Sánguche", 15, 4, 1000), prod("Café", 9, 2, 1000)]), BASE)!;
    expect(r.planillaPct).toBe(26.7);
    const [san, cafe] = r.filas;
    expect(san.moUnidad).toBe(4);   // 15 × 8,000 ÷ 30,000
    expect(cafe.moUnidad).toBe(2.4); // 9 × 0.2667
    expect(san.moUnidad / san.precio).toBeCloseTo(cafe.moUnidad / cafe.precio, 2);
  });

  it("lo que paga cada producto en total suma lo repartido y se ordena de más a menos sueldos", () => {
    const r = manoDeObraPorProducto(sede([prod("Café", 9, 2, 1000), prod("Sánguche", 15, 4, 1000), prod("Torta", 60, 20, 100)]), BASE)!;
    expect(r.filas.map((f) => f.nombre)).toEqual(["Sánguche", "Café", "Torta"]);
    expect(r.filas.reduce((t, f) => t + f.moTotal, 0)).toBeCloseTo(r.repartida, 1);
    expect(r.filas[0].participacionPct).toBe(15000 / 30000 * 100);
  });

  it("el margen después de insumos y sueldos: precio − costo de insumos − sueldos de la unidad", () => {
    const r = manoDeObraPorProducto(sede([prod("Sánguche", 15, 4, 1000)]), BASE)!;
    expect(r.filas[0]).toMatchObject({ margenUnidad: 7, margenPct: 46.7, estado: "ok" });
  });

  it("la meta sale de la regla: 100% − un tercio de insumos − 25% de planilla = 41.7%", () => {
    const r = manoDeObraPorProducto(sede([prod("A", 15, 6, 1000)]), BASE)!;
    expect(r.metaPct).toBe(41.7);
    // 15 − 6 − 4 = 5 → 33.3% < 41.7%: bajo.
    expect(r.filas[0]).toMatchObject({ margenPct: 33.3, estado: "bajo" });
    expect(r.bajo).toBe(1);
  });

  it("si el CEO sube el EBITDA objetivo, el tercio de costos baja y la meta tras sueldos sube", () => {
    expect(manoDeObraPorProducto(sede([prod("A", 15, 4, 1000)]), BASE, 30)!.metaPct).toBe(45);
  });

  it("sin costo de insumos el producto sí reparte sueldos pero no tiene margen", () => {
    const r = manoDeObraPorProducto(sede([prod("A", 15, 4, 1000), prod("Sin costo", 10, null, 500)]), BASE)!;
    const sin = r.filas.find((f) => f.nombre === "Sin costo")!;
    expect(sin).toMatchObject({ estado: "sin-costo", margenUnidad: null, margenPct: null });
    expect(sin.moTotal).toBeGreaterThan(0);
    expect(r.conCosto).toBe(1);
  });

  it("los 5 que más venden pagan tal % de la planilla, y el margen de la carta se pondera por ventas", () => {
    const r = manoDeObraPorProducto(sede([prod("A", 15, 4, 1000), prod("B", 9, 2, 1000)]), BASE)!;
    expect(r.top5Pct).toBe(100);
    // (15−4−4 + 9−2−2.4) = 7 + 4.6 por par; ÷ ventas (15 + 9): 11.6 ÷ 24 = 48.3%
    expect(r.margenCartaPct).toBe(48.3);
  });

  it("sin planilla o sin ventas no hay reparto: no se inventa", () => {
    expect(manoDeObraPorProducto(sede([prod("A", 15, 4, 100)]), { planilla: 0, ventas: 30000, mes: "2026-09" })).toBeNull();
    expect(manoDeObraPorProducto(sede([prod("A", 15, 4, 100)]), { planilla: 8000, ventas: 0, mes: "2026-09" })).toBeNull();
    expect(manoDeObraPorProducto(sede([]), BASE)).toBeNull();
  });
});
