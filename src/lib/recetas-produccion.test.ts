import { describe, expect, it } from "vitest";
import { compararRecetas, factorInsumoPorDefecto, parecido, resumenComparacion, sugerirPareja, type DatosProduccion, type ParejaGuardada } from "./recetas-produccion";
import type { CostoPreparacion } from "./costos-preparaciones";

const cat = (ref: string, tipo: CostoPreparacion["tipo"], nombre: string, unidad: CostoPreparacion["unidad"], costo: number): CostoPreparacion =>
  ({ ref, tipo, nombre, categoria: null, unidad, costo });

const catalogo: CostoPreparacion[] = [
  cat("H1", "insumo", "Harina Panadera", "kg", 4),       // S/ 0.004 por g
  cat("S1", "insumo", "Sal", "kg", 2),
  cat("HU", "insumo", "Huevo", "und", 0.5),
  cat("LE", "insumo", "Leche", "l", 5),
  cat("AT-1", "producto", "Pan Campesino Normal", "und", 1.5),
  cat("AT-2", "producto", "Galleta", "und", 1),
  cat("SUB:CR", "preparacion", "Crema Pastelera (kg)", "kg", 10),
];

const datos: DatosProduccion = {
  recetas: [
    { id: 1, nombre: "Pan Campesino", linea: "panaderia", modo: "panadero", activa: true, pesoBase: 650, harinaBase: 400, mermaPct: 0 },
    { id: 2, nombre: "Galleta", linea: "pasteleria", modo: "directo", activa: true, pesoBase: 650, harinaBase: 335, mermaPct: 10 },
    { id: 3, nombre: "Crema Pastelera", linea: "sub_recetas", modo: "directo", activa: false, pesoBase: 650, harinaBase: 335, mermaPct: 0 },
    { id: 4, nombre: "Apagada", linea: "pasteleria", modo: "directo", activa: false, pesoBase: 650, harinaBase: 335, mermaPct: 0 },
  ],
  formatos: [{ id: 10, recetaId: 1, nombre: "Normal", pesoMasa: 650, activo: true }, { id: 11, recetaId: 1, nombre: "Viejo", pesoMasa: 900, activo: false }],
  ingredientes: [
    { recetaId: 1, insumoId: 100, porcentaje: 100, gramosUnidad: null, orden: 1 },
    { recetaId: 1, insumoId: 101, porcentaje: 2, gramosUnidad: null, orden: 2 },
    { recetaId: 2, insumoId: 102, porcentaje: 0, gramosUnidad: 1, orden: 1 },   // 1 huevo
    { recetaId: 2, insumoId: 103, porcentaje: 0, gramosUnidad: 100, orden: 2 }, // 100 ml leche
    { recetaId: 2, insumoId: 104, porcentaje: 0, gramosUnidad: 50, orden: 3 },  // 50 g crema (sub-receta con precio en el Excel)
    { recetaId: 3, insumoId: 103, porcentaje: 0, gramosUnidad: 800, orden: 1 },
    { recetaId: 3, insumoId: 105, porcentaje: 0, gramosUnidad: 200, orden: 2 }, // sin precio
  ],
  insumos: [
    { id: 100, nombre: "Harina Panadera", activo: true, base: "peso", subrecetaId: null },
    { id: 101, nombre: "Sal", activo: true, base: "peso", subrecetaId: null },
    { id: 102, nombre: "Huevo", activo: true, base: "unidad", subrecetaId: null },
    { id: 103, nombre: "Leche", activo: true, base: "volumen", subrecetaId: null },
    { id: 104, nombre: "Crema Pastelera", activo: true, base: "peso", subrecetaId: 3 },
    { id: 105, nombre: "Vainilla rara", activo: true, base: "volumen", subrecetaId: null },
  ],
};

describe("Producción vs Excel (Etapa 3c)", () => {
  const filas = compararRecetas(datos, catalogo);
  const fila = (clave: string) => filas.find((f) => f.clave === clave)!;

  it("pan en modo panadero: gramos por la harina base del formato", () => {
    // 400 g harina × S/0.004 + 8 g sal × S/0.002 = 1.616
    const f = fila("1-10");
    expect(f.costoProduccion).toBeCloseTo(1.616, 4);
    expect(f.pareja?.nombre).toBe("Pan Campesino Normal");
    expect(f.diferencia).toBeCloseTo((1.616 - 1.5) / 1.5, 4);
    expect(filas.some((x) => x.clave === "1-11")).toBe(false); // formato apagado
  });

  it("modo directo con unidades, volumen, preparación del Excel y merma", () => {
    // (0.5 + 100 ml × 0.005 + 50 g × 0.01) × 1.10 = 1.65
    const f = fila("2");
    expect(f.costoProduccion).toBeCloseTo(1.65, 4);
    expect(f.diferencia).toBeCloseTo(0.65, 4);
  });

  it("sub-receta por kg; si falta un precio no se compara pero muestra lo que sí", () => {
    const f = fila("3");
    expect(f.por).toBe("kg");
    expect(f.costoProduccion).toBeNull();
    expect(f.sinPrecio).toEqual(["Vainilla rara"]);
    expect(f.costoParcial).toBeCloseTo(4, 4); // 800 ml × 0.005 = 4 por 1 kg de mezcla
    expect(f.pareja?.exacta).toBe(true);
  });

  it("las recetas apagadas (salvo sub-recetas) no entran", () => {
    expect(filas.some((x) => x.recetaId === 4)).toBe(false);
    expect(resumenComparacion(filas)).toMatchObject({ total: 3, comparables: 2, faltanPrecios: 1 });
  });

  it("parejas por nombre", () => {
    expect(parecido("Pan Integral Multigrano Normal", "Pan IMG Normal 550 g")).toBeGreaterThan(0.5);
    expect(sugerirPareja(catalogo, "Torta de chocolate")).toBeNull();
    expect(sugerirPareja(catalogo, "Crema Pastelera")?.exacta).toBe(true);
  });
});

describe("parejas guardadas (parte 2)", () => {
  const conPrecio = [...catalogo, cat("VA", "insumo", "Extracto de vainilla", "l", 50), cat("AT-9", "producto", "Galletas x5", "und", 6)];
  const parejas: ParejaGuardada[] = [
    { tipo: "insumo", prodClave: "105", refCC: "VA", factor: 0.001 },      // «Vainilla rara» en ml = Extracto de vainilla (l)
    { tipo: "insumo", prodClave: "101", refCC: null, factor: 1 },          // Sal: sin pareja a propósito
    { tipo: "receta", prodClave: "2", refCC: "AT-9", factor: 5 },          // 1 paquete del Excel = 5 galletas
    { tipo: "receta", prodClave: "1-10", refCC: null, factor: 1 },         // pan: sin pareja (no sugerir)
  ];
  const filas = compararRecetas(datos, conPrecio, parejas);
  const fila = (clave: string) => filas.find((f) => f.clave === clave)!;

  it("un insumo con pareja usa su precio y su equivalencia", () => {
    // 800 ml leche × 0.005 + 200 ml vainilla × 50 × 0.001 = 4 + 10 = 14 por 1 kg de mezcla
    expect(fila("3").costoProduccion).toBeCloseTo(14, 4);
    expect(fila("3").sinPrecio).toEqual([]);
  });

  it("«sin pareja» en un insumo lo deja sin precio aunque el nombre coincida", () => {
    expect(fila("1-10").sinPrecio).toEqual(["Sal"]);
  });

  it("la receta compara un paquete del Excel contra 5 de Producción, y «sin pareja» no sugiere", () => {
    const g = fila("2");
    expect(g.pareja).toMatchObject({ ref: "AT-9", guardada: true });
    // la crema usa su precio del Excel (S/ 10/kg) antes que su sub-receta: (0.5 + 0.5 + 0.5) × 1.10 = 1.65 → × 5 = 8.25
    expect(g.costoProduccion).toBeCloseTo(8.25, 4);
    expect(g.diferencia).toBeCloseTo((8.25 - 6) / 6, 4);
    expect(fila("1-10").pareja).toBeNull();
  });

  it("equivalencia que se propone por unidad", () => {
    expect(factorInsumoPorDefecto("kg")).toBe(0.001);
    expect(factorInsumoPorDefecto("und")).toBe(1);
  });
});
