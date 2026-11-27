/** Líneas «se quita» (cantidad negativa) solo en productos: el costo es lo que entra menos lo que sale. */
import { describe, it, expect } from "vitest";
import { costoDeReceta, erroresDeReceta } from "../recetas";

const det = (ings: { ref: string; cantidad: number }[]) => ({
  rendimiento: 1, merma: 0,
  ingredientes: ings.map((i) => ({ ref: i.ref, nombre: i.ref, unidad: "g", cantidad: i.cantidad })),
});
const precios: Record<string, { unidad: "kg"; costo: number }> = { A: { unidad: "kg", costo: 6 }, B: { unidad: "kg", costo: 5 } };

describe("cambio de insumo con línea negativa", () => {
  it("costo = lo que entra − lo que sale", () => {
    const c = costoDeReceta("producto", det([{ ref: "A", cantidad: 100 }, { ref: "B", cantidad: -100 }]), (r) => precios[r] ?? null);
    expect(c.costo).toBeCloseTo(0.1, 6);
  });
  it("en un producto se acepta; en una preparación no", () => {
    const d = det([{ ref: "A", cantidad: 100 }, { ref: "B", cantidad: -100 }]);
    expect(erroresDeReceta({ nombre: "x", tipo: "producto", detalle: d })).toEqual([]);
    expect(erroresDeReceta({ nombre: "x", tipo: "preparacion", detalle: d }).length).toBeGreaterThan(0);
  });
  it("tiene que entrar algo y no vale cero", () => {
    expect(erroresDeReceta({ nombre: "x", tipo: "producto", detalle: det([{ ref: "B", cantidad: -100 }]) }).length).toBeGreaterThan(0);
    expect(erroresDeReceta({ nombre: "x", tipo: "producto", detalle: det([{ ref: "A", cantidad: 0 }]) }).length).toBeGreaterThan(0);
  });
});
