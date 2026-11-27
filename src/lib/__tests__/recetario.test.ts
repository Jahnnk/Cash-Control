/** Recetario de cocina: fichas por sección, bases en orden, medida de cocina y sin líneas «se quita». */
import { describe, it, expect } from "vitest";
import { armarRecetario, lineaDe } from "../recetario";
import type { RecetaSistema } from "../recetas";

const r = (id: number, nombre: string, tipo: "producto" | "preparacion", categoria: string, ings: { ref: string | null; nombre: string; cantidad: number; unidad?: string; cocina?: string }[], pasos?: string[]): RecetaSistema => ({
  id, nombre, tipo, categoria, reemplaza: null,
  detalle: { rendimiento: 1, merma: 0, ingredientes: ings.map((i) => ({ ref: i.ref, nombre: i.nombre, unidad: i.unidad ?? "g", cantidad: i.cantidad, ...(i.cocina ? { cocina: i.cocina } : {}) })), ...(pasos ? { ficha: { pasos } } : {}) },
});

const salsa = r(2, "Salsa", "preparacion", "Sub-recetas", [{ ref: "X1", nombre: "Tomate", cantidad: 500 }], ["Licuar."]);
const base = r(3, "Base", "preparacion", "Sub-recetas", [{ ref: "REC:2", nombre: "Salsa", cantidad: 100 }]);
const prod = r(1, "Zeta", "producto", "Bebidas", [
  { ref: "REC:3", nombre: "Base", cantidad: 30.612, cocina: "4 líneas" },
  { ref: "X2", nombre: "Pan", cantidad: 0.25, unidad: "und" },
  { ref: "X3", nombre: "Leche entera", cantidad: -153 },
]);
const otro = r(4, "Alfa", "producto", "Bebidas", [{ ref: "X4", nombre: "Agua", cantidad: 200, unidad: "ml" }], ["Servir."]);

describe("armarRecetario", () => {
  const rec = armarRecetario("bebidas", [prod, salsa, base, otro, r(5, "Archivado", "producto", "Bebidas", [])], new Set(["REC:5"]));
  it("productos de la sección, por nombre, numerados, sin archivados", () => {
    expect(rec.productos.map((f) => `${f.numero} ${f.nombre}`)).toEqual(["01 Alfa", "02 Zeta"]);
  });
  it("las bases van primero lo que necesitan (salsa antes que la base)", () => {
    expect(rec.productos[1].bases.map((b) => b.nombre)).toEqual(["Salsa", "Base"]);
  });
  it("medida de cocina manda, fracciones legibles y sin lo que se quita", () => {
    expect(rec.productos[1].lineas).toEqual([
      { nombre: "Base", cantidad: "4 líneas", unidad: "" },
      { nombre: "Pan", cantidad: "¼", unidad: "und" },
    ]);
    expect(rec.faltanPasos).toEqual(["Zeta"]);
  });
  it("redondea: 153.061 g → 153 gr; 2.45 ml → 2,5 ml", () => {
    expect(lineaDe({ ref: null, nombre: "a", unidad: "g", cantidad: 153.061 })).toEqual({ nombre: "a", cantidad: "153", unidad: "gr" });
    expect(lineaDe({ ref: null, nombre: "b", unidad: "ml", cantidad: 2.45 })?.cantidad).toBe("2,5");
  });
});
