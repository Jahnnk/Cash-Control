/**
 * ¿Qué precios subir? (pedido de Jahnn, 17-nov-2026). Se clavan el redondeo como la carta, el riesgo
 * por tipo de producto, el veredicto, el punto de quiebre y los escenarios de caída.
 */
import { describe, it, expect } from "vitest";
import { necesidadDe, precioRedondo, riesgoDe, subidaDePrecios } from "./subida-precios";
import type { ProductoRentable, RentabilidadSede } from "./rentabilidad";

const prod = (nombre: string, precio: number, costo: number | null, unidades: number, familia = "Sánguches, platos y desayunos", precioCarta: number | null = precio): ProductoRentable => ({
  nombre, familia, unidades, ingresos: precio * unidades, precio, precioCarta,
  costo, costoInsumos: costo, deAtelier: false, origen: null,
  margenUnidad: null, margenPct: null, deja: null, marca: null,
});
const sede = (productos: ProductoRentable[], hasta = "2026-10-31", dias = 31): RentabilidadSede => ({
  businessId: 3, sede: "Centro", mes: "2026-10", desde: "2026-10-01", hasta, dias, productos,
  ventasCarta: 0, coberturaPct: 100, margenPromedioPct: null, dejaTotal: 0, top10Pct: null, sinCosto: [], conteo: { campeon: 0, "mucho-deja-poco": 0, joya: 0 },
});
/** Relleno con poca venta: baja la mediana para que los de prueba tengan demanda fuerte. */
const relleno = (n: number) => Array.from({ length: n }, (_, i) => prod(`Relleno ${i}`, 10, 2, 10));

describe("redondeo como la carta", () => {
  it("bajo S/ 10 sube de S/ 0.50 en S/ 0.50; desde S/ 10, de sol en sol", () => {
    expect(precioRedondo(8, 0.05)).toBe(8.5);
    expect(precioRedondo(8, 0.10)).toBe(9);
    expect(precioRedondo(21, 0.10)).toBe(23);
    expect(precioRedondo(12, 0.05)).toBe(13);
  });
  it("un precio en .9 sigue en .9", () => {
    expect(precioRedondo(16.9, 0.08)).toBe(17.9);
    expect(precioRedondo(20.9, 0.10)).toBe(22.9);
  });
  it("siempre sube al menos un paso", () => {
    expect(precioRedondo(2, 0.05)).toBe(2.5);
  });
});

describe("riesgo por tipo de producto", () => {
  it("básicos fáciles de comparar = alto; propios de Yayi's = bajo", () => {
    expect(riesgoDe("CAFÉ AMERICANO")).toBe("alto");
    expect(riesgoDe("EMPANADA MIXTA")).toBe("alto");
    expect(riesgoDe("DESAYUNO SABOR CAJAMARQUINO")).toBe("bajo");
    expect(riesgoDe("TRIPLE YAYIS")).toBe("bajo");
    expect(riesgoDe("CAPPUCCINO")).toBe("medio");
  });
  it("busca palabras enteras: «TE» (té) no es «chocolaTE» ni «crocanTE»", () => {
    expect(riesgoDe("CAKE DE CHOCOLATE")).toBe("medio");
    expect(riesgoDe("CROCANTE DE FRESA")).toBe("bajo");
    expect(riesgoDe("TE VERDE")).toBe("alto");
  });
  it("necesidad por el costo: más de 35% alta, 28–35% media, menos baja", () => {
    expect([40, 35, 28, 27.9].map(necesidadDe)).toEqual(["alta", "media", "media", "baja"]);
  });
});

describe("veredicto, punto de quiebre y escenarios", () => {
  it("se pide mucho y es propio: sube hasta 10%, con su punto de quiebre", () => {
    const r = subidaDePrecios(sede([prod("TRIPLE YAYIS", 21, 6, 100), ...relleno(4)]));
    const f = r.filas.find((x) => x.nombre === "TRIPLE YAYIS")!;
    expect(f).toMatchObject({ veredicto: "subir", demandaFuerte: true, riesgo: "bajo", precioNuevo: 23, subidaPct: 9.5 });
    // Puede perder 2 ÷ (23 − 6) = 11.8% de las ventas y dejar lo mismo.
    expect(f.quiebrePct).toBe(11.8);
    // Hoy deja 15 × 100 = 1,500. Igual: 17 × 100 − 1,500 = 200 · −5%: 1,615 − 1,500 = 115 · −10%: 1,530 − 1,500 = 30.
    expect(f.extraMes).toEqual([200, 115, 30]);
  });

  it("vende poco y su costo está bien: no se toca", () => {
    const r = subidaDePrecios(sede([prod("CAPPUCCINO", 12, 3, 9), ...Array.from({ length: 4 }, (_, i) => prod(`Mucho ${i}`, 10, 2, 100))]));
    expect(r.filas.find((x) => x.nombre === "CAPPUCCINO")).toMatchObject({ veredicto: "no-tocar", precioNuevo: null, extraMes: null });
  });

  it("vende poco pero su costo pasa el 35%: subir poco y revisar la receta", () => {
    const r = subidaDePrecios(sede([prod("JAMON AHUMADO CRIOLLO", 18, 8, 9), ...Array.from({ length: 4 }, (_, i) => prod(`Mucho ${i}`, 10, 2, 100))]));
    expect(r.filas.find((x) => x.nombre === "JAMON AHUMADO CRIOLLO")).toMatchObject({ veredicto: "subir-poco", precioNuevo: 19 });
  });

  it("un básico que ya deja buen margen queda como precio ancla", () => {
    const r = subidaDePrecios(sede([prod("EMPANADA MIXTA", 8, 1.7, 300), ...relleno(4)]));
    expect(r.filas.find((x) => x.nombre === "EMPANADA MIXTA")).toMatchObject({ veredicto: "no-tocar", riesgo: "alto" });
  });

  it("si el paso más chico de la carta es demasiado (+25% en una cookie de S/ 2), espera a otra ronda", () => {
    const r = subidaDePrecios(sede([prod("COOKIE DE AVENA", 2, 0.8, 300), ...relleno(4)]));
    expect(r.filas.find((x) => x.nombre === "COOKIE DE AVENA")).toMatchObject({ veredicto: "no-tocar", pasoMuyGrande: true });
  });

  it("parte del precio de carta; sin él, del promedio que cobró Byte", () => {
    const r = subidaDePrecios(sede([prod("TRIPLE YAYIS", 20.4, 6, 100, undefined, 21), prod("CAPRESE RUSTICO", 18, 7, 100, undefined, null), ...relleno(4)]));
    expect(r.filas.find((x) => x.nombre === "TRIPLE YAYIS")).toMatchObject({ precio: 21, precioDeCarta: true });
    expect(r.filas.find((x) => x.nombre === "CAPRESE RUSTICO")).toMatchObject({ precio: 18, precioDeCarta: false });
  });

  it("deja fuera lo que no tiene costo, vende muy poco o no es un plato", () => {
    const r = subidaDePrecios(sede([prod("SIN COSTO", 10, null, 100), prod("POCO", 10, 3, 3), prod("TAPER", 1, 0.5, 100, "Otros (extras y retail)"), ...relleno(2)]));
    expect(r.filas.map((f) => f.nombre)).toEqual(["Relleno 0", "Relleno 1"]);
    expect(r.fuera).toBe(2);
  });

  it("un mes a medias se lleva a mes completo", () => {
    const r = subidaDePrecios(sede([prod("TRIPLE YAYIS", 21, 6, 50), ...relleno(4)], "2026-10-15", 15));
    // 50 u en 15 días = 103.3 al mes · 2 × 103.3 = 206.67
    expect(r.filas.find((x) => x.nombre === "TRIPLE YAYIS")!.extraMes![0]).toBe(206.67);
  });

  it("orden: primero Subir, luego Subir poco, luego No tocar; el que más deja arriba", () => {
    const r = subidaDePrecios(sede([
      prod("EMPANADA MIXTA", 8, 1.7, 300), prod("CAPPUCCINO", 12, 3, 200), prod("TRIPLE YAYIS", 21, 6, 100), prod("CARROT CAKE", 12, 3.7, 150),
      ...relleno(4),
    ]));
    expect(r.filas.filter((f) => !f.nombre.startsWith("Relleno")).map((f) => [f.nombre, f.veredicto])).toEqual([
      ["TRIPLE YAYIS", "subir"], ["CARROT CAKE", "subir"], ["CAPPUCCINO", "subir-poco"], ["EMPANADA MIXTA", "no-tocar"],
    ]);
    // Los rellenos (S/ 10, costo 20%, riesgo medio) entran como «Subir poco» y van después de Cappuccino.
    expect(r.conteo).toEqual({ subir: 2, "subir-poco": 5, "no-tocar": 1 });
  });
});
