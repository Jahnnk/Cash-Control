import { describe, it, expect } from "vitest";
import { sugerirProducto } from "../sugerencia-producto";
import type { FichaProducto } from "../matriz-carta";
import type { Candidato } from "../candidatos";

const ficha = (cuadrante: "estrella" | "vaca" | "interrogante" | "perro", o: { u?: number; m?: number; tendencia?: "cayendo" | "subiendo" | "estable"; cambio?: number } = {}): FichaProducto => ({
  clave: "X", nombre: "X", familia: "Bebidas" as never, situacion: "ubicado", motivoFuera: null, prueba: null, tamano: "grande", porQue: null, lanzamiento: null, porSede: [], unidadesSemana: o.u ?? 30,
  cortes: { unidadesSemana: 12, margenUnidad: 6.2 },
  puestos: { ganancia: { n: 4, de: 120 }, unidades: { n: 5, de: 120 }, margen: { n: 10, de: 120 }, enFamilia: { n: 1, de: 10 }, enCaja: { n: 2, de: 30 }, pctGanancia: 3.1 },
  punto: { clave: "X", nombre: "X", familia: "Bebidas" as never, cuadrante, unidadesSemana: o.u ?? 30, margenUnidad: o.m ?? 9.4, margenPct: 61, precio: 15.5, gananciaMes: 1200, ventaMes: 1980,
    tendencia: { clase: o.tendencia ?? "estable", antes: 30, ahora: 30, cambioPct: o.cambio ?? 0, cartaPct: null } as never, lanzamiento: null, serie: [], lectura: "" },
});

describe("ingeniería de menú: qué hacer con un producto", () => {
  it("cada caja tiene su verbo", () => {
    expect(sugerirProducto(ficha("estrella"), null).accion).toBe("potenciar");
    expect(sugerirProducto(ficha("vaca", { m: 3 }), null).accion).toBe("mantener");
    expect(sugerirProducto(ficha("interrogante", { u: 4 }), null).accion).toBe("promocionar");
    expect(sugerirProducto(ficha("perro", { u: 2, m: 2 }), null).accion).toBe("sacar");
  });
  it("explica con números contra la mediana de la carta", () => {
    const s = sugerirProducto(ficha("estrella"), null);
    expect(s.porque[0]).toContain("Vende 30 por semana: más que la mediana de la carta (12)");
    expect(s.porque[1]).toContain("Deja S/ 9.40 por venta (61% del precio): más que la mediana (S/ 6.20)");
    expect(s.porque[2]).toContain("el 3.1% de la ganancia de la carta, n.º 4 de 120");
  });
  it("una estrella que cae avisa", () => {
    expect(sugerirProducto(ficha("estrella", { tendencia: "cayendo", cambio: -25 }), null).ojo).toContain("Viene cayendo (-25%)");
  });
  it("el modelo de candidatos manda cuando dice sacar", () => {
    const c = { veredicto: "sacar", razon: "Está entre los que menos venden en las dos sedes; gana muy poco", referencia: { nombre: "Batido de fresa", gananciaDia: 20, ventaDia: 40 }, sedeRevisar: null } as unknown as Candidato;
    const s = sugerirProducto(ficha("interrogante", { u: 4 }), c);
    expect(s.accion).toBe("sacar");
    expect(s.ideas.join(" ")).toContain("Batido de fresa");
  });
  it("nuevo, sin costo o sin ficha: no se inventa un veredicto", () => {
    expect(sugerirProducto({ ...ficha("perro"), situacion: "prueba", prueba: {} as never, punto: null }, null).accion).toBe("esperar");
    expect(sugerirProducto({ ...ficha("perro"), situacion: "sin-costo", punto: null }, null).accion).toBe("sin-costo");
    expect(sugerirProducto(null, null).accion).toBe("sin-datos");
  });
});

describe("un perro por poco", () => {
  it("si está muy cerca de la mediana, no se saca a la primera", () => {
    expect(sugerirProducto(ficha("perro", { u: 11.5, m: 2 }), null).ojo).toContain("muy cerca de la mediana");
    expect(sugerirProducto(ficha("perro", { u: 2, m: 2 }), null).ojo).toBeNull();
  });
});
