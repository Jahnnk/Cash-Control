import { describe, it, expect } from "vitest";
import { reglaOchentaVeinte, tendenciaPareto } from "../ochenta-veinte";

const p = (nombre: string, ingresos: number) => ({ nombre, familia: "Postres y pastelería", ingresos });

describe("regla 80/20", () => {
  it("cuenta cuántos productos hacen el 80% (el que cruza la línea cuenta dentro)", () => {
    // 10 productos: 50 + 20 + 10 = 80% con 3 productos.
    const r = reglaOchentaVeinte([p("A", 50), p("B", 20), p("C", 10), ...Array.from({ length: 7 }, (_, i) => p(`z${i}`, 20 / 7))])!;
    expect(r.productos).toBe(10);
    expect(r.nucleo).toBe(3);
    expect(r.pctNucleo).toBe(30);
    expect(r.top20).toBe(2);
    expect(r.ventasTop20Pct).toBe(70);
    expect(r.cola).toBe(7);
    expect(r.ventasColaPct).toBe(20);
    expect(r.lista[2].acumPct).toBe(80);
  });

  it("ignora lo que no vendió y no se cae sin datos", () => {
    expect(reglaOchentaVeinte([])).toBeNull();
    expect(reglaOchentaVeinte([p("A", 0)])).toBeNull();
    expect(reglaOchentaVeinte([p("A", 10), p("B", 0)])!.productos).toBe(1);
  });

  it("tendencia: menos productos para el 80% = la venta se concentra", () => {
    const base = reglaOchentaVeinte([p("A", 50), p("B", 30), p("C", 20)])!;
    expect(tendenciaPareto({ ...base, pctNucleo: 18 }, { ...base, pctNucleo: 25 })!.tono).toBe("concentra");
    expect(tendenciaPareto({ ...base, pctNucleo: 30 }, { ...base, pctNucleo: 25 })!.tono).toBe("reparte");
    expect(tendenciaPareto({ ...base, pctNucleo: 26 }, { ...base, pctNucleo: 25 })!.tono).toBe("estable");
    expect(tendenciaPareto(null, base)).toBeNull();
  });
});

describe("candidatos por categoría", () => {
  it("filtra por categoría y sede, sin los de observación, y ordena sacar → preparar", async () => {
    const { candidatosDeCategoria } = await import("../por-categoria");
    const c = (clave: string, familia: string, veredicto: string, sedes: number[], puntos = 50) =>
      ({ clave, nombre: clave, familia, veredicto, puntos, sedes: sedes.map((businessId) => ({ businessId })) }) as never;
    const lista = [
      c("a", "Bebidas frías", "preparar", [2, 3]),
      c("b", "Bebidas frías", "sacar", [2]),
      c("c", "Bebidas frías", "observar", [2]),
      c("d", "Bebidas frías", "sacar", [3]),
      c("e", "Postres y pastelería", "sacar", [2]),
    ];
    expect(candidatosDeCategoria(lista, "Bebidas frías", 2).map((x) => (x as { clave: string }).clave)).toEqual(["b", "a"]);
  });
});
