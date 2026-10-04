import { describe, it, expect } from "vitest";
import { rentabilidadDeSede } from "../productos/rentabilidad";
import type { CostoCarta } from "../productos/costos-carta";

const carta = (nombre: string, unidades: number, precio: number) => ({ nombre, familia: "Cafetería", unidades, ingresos: unidades * precio });
const costo = (ref: string, nombre: string, c: number, p: number): CostoCarta => ({ ref, nombre, nombreCarta: null, categoria: null, costo: c, precio: p });

// El ejemplo del libro, en soles: el café vende mucho y deja mucho; el smoothie vende bastante y deja poco;
// la torta vende poco y deja mucho. Se agregan productos de relleno para que haya con qué comparar.
const COSTOS: CostoCarta[] = [
  costo("A1", "Café americano", 0.6, 3.5), costo("A2", "Sándwich del día", 4.2, 8), costo("A3", "Smoothie especial", 3.8, 6),
  costo("A4", "Torta de la casa", 1.2, 4.5), costo("A5", "Jugo de naranja", 1.5, 6), costo("A6", "Empanada de pollo", 2.4, 6),
  costo("A7", "Ensalada fresca", 6.0, 12), costo("A8", "Galleta de avena", 0.9, 3), costo("A9", "Té helado", 0.8, 5),
];
const MES = [
  carta("Café americano", 400, 3.5), carta("Sándwich del día", 200, 8), carta("Smoothie especial", 380, 6), carta("Torta de la casa", 40, 4.5),
  carta("Jugo de naranja", 150, 6), carta("Empanada de pollo", 120, 6), carta("Ensalada fresca", 60, 12), carta("Galleta de avena", 90, 3), carta("Té helado", 25, 5),
];
const sede = () => rentabilidadDeSede({ businessId: 2, sede: "Fonavi", mes: "2026-09", desde: "2026-09-01", hasta: "2026-09-30", dias: 30, carta: MES, costos: COSTOS, vinculos: new Map() });

describe("rentabilidad por producto", () => {
  it("margen, margen % y lo que deja = margen $ × unidades", () => {
    const cafe = sede().productos.find((p) => p.nombre === "Café americano")!;
    expect(cafe).toMatchObject({ precio: 3.5, costo: 0.6, margenUnidad: 2.9, margenPct: 82.9, deja: 1160 });
  });

  it("ordena por lo que más deja, no por lo que más vende", () => {
    const s = sede();
    const deja = s.productos.map((p) => p.deja ?? 0);
    expect(deja).toEqual([...deja].sort((a, b) => b - a));
    expect(s.productos[0].nombre).toBe("Café americano");
    // El jugo vende menos unidades que el sándwich pero deja casi lo mismo: el orden lo decide el margen.
    const posicion = (n: string) => s.productos.findIndex((p) => p.nombre === n);
    expect(posicion("Jugo de naranja")).toBeLessThan(posicion("Ensalada fresca"));
  });

  it("marca los que venden mucho y dejan poco (el smoothie) y los campeones (el café)", () => {
    const s = sede();
    const m = (n: string) => s.productos.find((p) => p.nombre === n)!.marca;
    expect(m("Smoothie especial")).toBe("mucho-deja-poco");
    expect(m("Café americano")).toBe("campeon");
  });

  it("marca la joya escondida: vende poco, margen % alto y margen $ que vale la pena", () => {
    const s = sede();
    expect(s.productos.find((p) => p.nombre === "Torta de la casa")!.marca).toBe("joya");
  });

  it("los que no tienen costo no entran a las marcas y se avisan aparte", () => {
    const s = rentabilidadDeSede({ businessId: 2, sede: "Fonavi", mes: "2026-09", desde: "2026-09-01", hasta: "2026-09-30", dias: 30,
      carta: [...MES, carta("Ciabatta x4", 50, 12)], costos: COSTOS, vinculos: new Map() });
    expect(s.sinCosto.map((x) => x.nombre)).toEqual(["Ciabatta x4"]);
    expect(s.coberturaPct).toBeLessThan(100);
    expect(s.productos.find((p) => p.nombre === "Ciabatta x4")).toMatchObject({ deja: null, marca: null });
  });

  it("resume: margen promedio ponderado y cuánto explican los 10 que más dejan", () => {
    const s = sede();
    expect(s.dejaTotal).toBe(s.productos.reduce((t, p) => t + (p.deja ?? 0), 0));
    expect(s.margenPromedioPct).toBeGreaterThan(40);
    expect(s.top10Pct).toBe(100); // solo hay 9 productos
  });

  it("con muy pocos productos con volumen no opina (no hay con qué comparar)", () => {
    const s = rentabilidadDeSede({ businessId: 2, sede: "Fonavi", mes: "2026-09", desde: "2026-09-01", hasta: "2026-09-30", dias: 30,
      carta: MES.slice(0, 3), costos: COSTOS, vinculos: new Map() });
    expect(s.conteo).toEqual({ campeon: 0, "mucho-deja-poco": 0, joya: 0 });
  });
});
