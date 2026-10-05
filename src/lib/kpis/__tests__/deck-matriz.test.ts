import { describe, it, expect } from "vitest";
import PptxGenJS from "pptxgenjs";
import { contexto } from "../deck-semanal";
import { matrizDeLaCarta } from "../deck-productos";
import type { CandidatosReemplazo } from "@/app/actions/productos-panorama";
import type { ProductoMatriz, CartaSede } from "@/lib/productos/matriz-carta";

const MESES = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const serie = (v: number[]) => MESES.map((month, i) => ({ month, completo: true, porDia: v[i] }));
const sede = (porDia: number[], precio: number, costo: number) => {
  const u = porDia.slice(-3).reduce((s, x) => s + x, 0) / 3;
  return { businessId: 2, sede: "Fonavi", estado: "bien" as const, unidadesDia: u, unidadesSemana: u * 7, ventaDia: u * precio, precio, costo, gananciaDia: u * (precio - costo), serie: serie(porDia) };
};
const matriz: ProductoMatriz[] = [
  { clave: "a", nombre: "ESTRELLA GRANDE", familia: "Panadería", sedes: [sede([3, 3, 3, 3, 3, 3], 15, 5)] },
  { clave: "b", nombre: "VACA LECHERA", familia: "Panadería", sedes: [sede([4, 4, 4, 2, 2, 2], 6, 4)] },
  { clave: "c", nombre: "INTERROGANTE", familia: "Panadería", sedes: [sede([0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 20, 8)] },
  { clave: "d", nombre: "PERRO CAYENDO", familia: "Panadería", sedes: [sede([0.9, 0.9, 0.9, 0.2, 0.2, 0.2], 5, 4)] },
];
const cartas: CartaSede[] = [{ businessId: 2, sede: "Fonavi", serie: serie([100, 100, 100, 100, 100, 100]) }];
const laminas = (p: PptxGenJS) => (p as unknown as { slides: unknown[] }).slides.length;
const datos = (m: ProductoMatriz[]) => ({ matriz: m, cartas } as unknown as CandidatosReemplazo);

describe("lámina «La carta en una matriz» del deck", () => {
  it("agrega una lámina con la matriz", () => {
    const pptx = new PptxGenJS();
    matrizDeLaCarta(contexto(pptx, "2026-09-27", "2026-10-03"), datos(matriz));
    expect(laminas(pptx)).toBe(1);
  });
  it("sin productos no agrega nada (el deck sale igual)", () => {
    const pptx = new PptxGenJS();
    matrizDeLaCarta(contexto(pptx, "2026-09-27", "2026-10-03"), datos([]));
    expect(laminas(pptx)).toBe(0);
  });
  it("si ningún producto tiene costo, tampoco hay matriz que mostrar", () => {
    const sinCosto: ProductoMatriz[] = [{ clave: "x", nombre: "X", familia: "Panadería", sedes: [{ ...sede([2, 2, 2, 2, 2, 2], 10, 5), costo: null, gananciaDia: null }] }];
    const pptx = new PptxGenJS();
    matrizDeLaCarta(contexto(pptx, "2026-09-27", "2026-10-03"), datos(sinCosto));
    expect(laminas(pptx)).toBe(0);
  });
});
