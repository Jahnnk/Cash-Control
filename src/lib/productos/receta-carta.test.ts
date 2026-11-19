/**
 * Productos nuevos de la carta con su receta (fase 2b, 18-nov-2026).
 */
import { describe, it, expect } from "vitest";
import { costoTienda, erroresDeAlta, refNueva, type RecetaCarta } from "./receta-carta";

const insumos: Record<string, { unidad: string; precio: number }> = { CA012: { unidad: "kg", precio: 20 }, LC001: { unidad: "l", precio: 5 }, HV001: { unidad: "und", precio: 0.5 } };
const buscarInsumo = (s: string) => insumos[s] ?? null;
const buscarAtelier = (r: string) => (r === "AT-PAN" ? 1.2 : null);

describe("costo de lo que se prepara en tienda", () => {
  it("suma insumos y lo de Atelier, por porción", () => {
    const r: Extract<RecetaCarta, { tipo: "tienda" }> = { tipo: "tienda", porciones: 2, merma: 0, lineas: [
      { tipo: "insumo", ref: "CA012", nombre: "Pollo", cantidad: 200, unidad: "g" },   // S/ 4
      { tipo: "insumo", ref: "HV001", nombre: "Huevo", cantidad: 2, unidad: "und" },   // S/ 1
      { tipo: "atelier", ref: "AT-PAN", nombre: "Pan", cantidad: 2, unidad: "und" },   // S/ 2.40
    ] };
    const c = costoTienda(r, buscarInsumo, buscarAtelier);
    expect(c.costo).toBe(3.7);
    expect(c.desglose.map((d) => [d.sku, d.costo])).toEqual([["CA012", 2], ["AT-PAN", 1.2], ["HV001", 0.5]]);
  });
  it("con merma el costo por porción sube; sin precio de una línea, no hay costo", () => {
    const base = { tipo: "tienda" as const, porciones: 1, lineas: [{ tipo: "insumo" as const, ref: "LC001", nombre: "Leche", cantidad: 200, unidad: "ml" }] };
    expect(costoTienda({ ...base, merma: 0.2 }, buscarInsumo, buscarAtelier).costo).toBe(1.25);
    const sin = costoTienda({ ...base, merma: 0, lineas: [...base.lineas, { tipo: "insumo", ref: "XX999", nombre: "Raro", cantidad: 1, unidad: "g" }] }, buscarInsumo, buscarAtelier);
    expect(sin.costo).toBeNull();
    expect(sin.faltantes).toEqual(["Raro"]);
  });
});

describe("alta", () => {
  it("pide lo mínimo según la clase de producto", () => {
    expect(erroresDeAlta({ nombre: "", precio: null, costo: null, receta: { tipo: "reventa" } })).toHaveLength(3);
    expect(erroresDeAlta({ nombre: "Agua", precio: 6, costo: 1.8, receta: { tipo: "reventa" } })).toEqual([]);
    expect(erroresDeAlta({ nombre: "Sánguche", precio: 16, costo: null, receta: { tipo: "tienda", porciones: 1, merma: 0, lineas: [] } })).toEqual(["Agrega al menos un ingrediente."]);
  });
  it("numera los productos nuevos por clase", () => {
    expect(refNueva("tienda", ["CF-011", "CF-S002", "AT-S001"])).toBe("CF-S003");
    expect(refNueva("atelier", ["CF-S002"])).toBe("AT-S001");
  });
});
