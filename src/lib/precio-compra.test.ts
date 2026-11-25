import { describe, expect, it } from "vitest";
import { comprasPara, precioPorBase } from "./precio-compra";

describe("precioPorBase", () => {
  it("por kg, litro o unidad: el precio tal cual", () => {
    expect(precioPorBase({ compra: "kg", gramos: "", precio: "12.5" })).toEqual({ unidad: "kg", precio: 12.5 });
    expect(precioPorBase({ compra: "und", gramos: "", precio: "1,20" })).toEqual({ unidad: "und", precio: 1.2 });
  });
  it("por g: 500 g a S/ 8.50 = S/ 17 por kg", () => {
    expect(precioPorBase({ compra: "g", gramos: "500", precio: "8.50" })).toEqual({ unidad: "kg", precio: 17 });
    expect(precioPorBase({ compra: "g", gramos: "393", precio: "5.90" })?.precio).toBeCloseTo(15.0127, 4);
  });
  it("falta un dato: null", () => {
    expect(precioPorBase({ compra: "g", gramos: "", precio: "8" })).toBeNull();
    expect(precioPorBase({ compra: "kg", gramos: "", precio: "0" })).toBeNull();
  });
  it("un insumo por kg se puede comprar por g; los demás no cambian de unidad", () => {
    expect(comprasPara("kg")).toEqual(["kg", "g"]);
    expect(comprasPara("l")).toEqual(["l"]);
    expect(comprasPara(null)).toEqual(["kg", "g", "l", "und"]);
  });
});
