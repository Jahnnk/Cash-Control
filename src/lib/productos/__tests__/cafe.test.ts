import { describe, expect, it } from "vitest";
import { esCafe, resumenCafe, tipoCafe } from "../cafe";
import type { ProductoRentable, RentabilidadSede } from "../rentabilidad";

const prod = (nombre: string, familia: string, unidades: number, precio: number, costo: number | null): ProductoRentable => ({
  nombre, familia, unidades, ingresos: unidades * precio, precio, costo, origen: null, costoInsumos: costo, deAtelier: false,
  margenUnidad: costo === null ? null : precio - costo, margenPct: costo === null ? null : Math.round(((precio - costo) / precio) * 1000) / 10,
  deja: costo === null ? null : (precio - costo) * unidades, marca: null,
});

describe("qué es café", () => {
  it.each([
    "CAFÉ AMERICANO", "CAFE PASADO", "CAPPUCCINO", "CAPUCCINO", "CAFE ESPRESSO", "CAFE CORTADO", "LATTE", "ICED CARAMEL LATTE", "CARAMEL LATTE",
    "LATTE MACCHIATO", "MOCCACCINO", "AFFOGATO", "COLD BREW", "FRAPPE CLÁSICO", "FRAPPE DE CARAMELO", "CAFÉ PASADO BOTELLA 250 ML", "LATTE : LECHE DESLACTOSADA",
  ])("%s es café", (n) => expect(esCafe(n)).toBe(true));

  it.each([
    "MATCHA LATTE CALIENTE", "MATCHA LATTE: LECHE DESLACTOSADA", "MATCHA LATTE FRÍO", "CHOCOLATE CON LECHE", "CHOCOLATE PURO", "BOSQUE ENCANTADO",
    "BOLSA DE INFUSION: VALENTINA", "BATIDO DE FRESA", "JUGO DE NARANJA", "MILKSHAKE CHOCOLATE", "KOMBUCHA EN VASO", "EMPANADA MIXTA",
  ])("%s no es café", (n) => expect(esCafe(n)).toBe(false));

  it("frío o caliente", () => {
    expect(tipoCafe("ICED LATTE")).toBe("frio");
    expect(tipoCafe("COLD BREW")).toBe("frio");
    expect(tipoCafe("FRAPPE CLASICO")).toBe("frio");
    expect(tipoCafe("CAFÉ PASADO BOTELLA 250 ML")).toBe("frio");
    expect(tipoCafe("CAPPUCCINO")).toBe("caliente");
    expect(tipoCafe("LATTE")).toBe("caliente");
  });
});

describe("resumen del café", () => {
  const d: RentabilidadSede = {
    businessId: 2, sede: "Fonavi", mes: "2026-10", desde: "2026-10-01", hasta: "2026-10-31", dias: 31,
    productos: [
      prod("CAPPUCCINO", "Bebidas calientes", 100, 12, 3),
      prod("CAFÉ AMERICANO", "Bebidas calientes", 200, 8, 2),
      prod("ICED LATTE", "Bebidas calientes", 20, 13, 3.25),
      prod("FRAPPE CLÁSICO", "Bebidas frías", 10, 13, null),
      prod("MATCHA LATTE CALIENTE", "Bebidas calientes", 50, 15, 5),
      prod("JUGO DE FRESA", "Bebidas frías", 80, 10, 3),
      prod("CAFÉ KAPHIY", "Otros", 5, 28, 22),
    ],
    ventasCarta: 10000, coberturaPct: 100, margenPromedioPct: 60, dejaTotal: 0, top10Pct: null, sinCosto: [], conteo: { campeon: 0, "mucho-deja-poco": 0, joya: 0 },
  };
  const r = resumenCafe(d);

  it("junta solo los cafés de las bebidas (sin matcha, jugos ni retail)", () => {
    expect(r.productos.map((p) => p.nombre)).toEqual(["CAFÉ AMERICANO", "CAPPUCCINO", "ICED LATTE", "FRAPPE CLÁSICO"]);
  });
  it("ventas, tazas y % de la carta", () => {
    expect(r.ventas).toBe(1600 + 1200 + 260 + 130);
    expect(r.unidades).toBe(330);
    expect(r.pctDeCarta).toBe(31.9);
    expect(r.tazasPorDia).toBe(10.6);
  });
  it("lo que deja solo cuenta los cafés con costo, y la cobertura lo dice", () => {
    // americano 6×200 + cappuccino 9×100 + iced latte 9.75×20
    expect(r.deja).toBe(1200 + 900 + 195);
    expect(r.costo).toBe(400 + 300 + 65);
    expect(r.margenPct).toBe(Math.round((2295 / 3060) * 1000) / 10);
    expect(r.coberturaPct).toBe(Math.round((3060 / 3190) * 1000) / 10);
    expect(r.sinCosto).toEqual([{ nombre: "FRAPPE CLÁSICO", ingresos: 130 }]);
  });
  it("separa frío y caliente", () => {
    expect(r.caliente.unidades).toBe(300);
    expect(r.frio.unidades).toBe(30);
    expect(r.frio.ventas).toBe(390);
  });
  it("sin cafés vendidos no inventa nada", () => {
    const vacio = resumenCafe({ ...d, productos: [prod("JUGO DE FRESA", "Bebidas frías", 80, 10, 3)] });
    expect(vacio.productos).toEqual([]);
    expect(vacio.deja).toBeNull();
    expect(vacio.margenPct).toBeNull();
    expect(vacio.coberturaPct).toBe(0);
  });
});
