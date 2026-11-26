/**
 * Panes en % panadero (26-nov-2026): el caso de la focaccia V4 de la hoja de Luis.
 */
import { describe, it, expect } from "vitest";
import { aplicarPanadero, erroresPanadero, harinaBase, produccion, recetasParaProduccion, sumaPct } from "./recetas-panadero";
import { costoDeReceta, erroresDeReceta } from "./recetas";
import type { DetalleReceta } from "./costos-preparaciones";

const ing = (nombre: string, pct: number | null, unidad = "g", cantidad = 0) => ({ ref: nombre, nombre, unidad, cantidad, pct });

const focaccia = (pesoMasa: number): DetalleReceta => ({
  rendimiento: null, merma: 0, panadero: { pesoMasa, piezas: 4 },
  ingredientes: [
    ing("Harina Panadera", 96.1), ing("Harina Integral", 4), ing("Agua 1", 59.9, "ml"), ing("Agua 2", 8, "ml"),
    ing("Sal de maras", 2), ing("Masa Madre", 15), ing("Aceite de Oliva", 7, "ml"), ing("Levadura Seca", 1.6),
  ],
});

describe("focaccia V4 en % panadero", () => {
  it("la harina base sale del peso: con 2,022 g da la de la hoja (1,043.75)", () => {
    expect(sumaPct(focaccia(2022))).toBeCloseTo(193.6, 5);
    expect(harinaBase(focaccia(2020.7))!).toBeCloseTo(1043.75, 1);
  });

  it("con 1,520 g los insumos suman 1,520 g (la hoja seguía en 2,022)", () => {
    const d = aplicarPanadero(focaccia(1520));
    const g = Object.fromEntries(d.ingredientes.map((i) => [i.nombre, i.cantidad]));
    expect(g["Harina Panadera"]).toBeCloseTo(754.5, 0);
    expect(g["Agua 1"]).toBeCloseTo(470.29, 1);
    expect(d.ingredientes.reduce((s, i) => s + i.cantidad, 0)).toBeCloseTo(1520, 0);
  });

  it("2 bandejas = el doble; lo que no lleva % va fijo por bandeja", () => {
    const d = focaccia(1520);
    d.ingredientes.push(ing("Bolsa", null, "und", 4));
    const p = produccion(d, 2);
    expect(p.masa).toBe(3040);
    expect(p.lineas.find((l) => l.nombre === "Bolsa")!.cantidad).toBe(8);
    expect(p.lineas.find((l) => l.nombre === "Harina Panadera")!.cantidad).toBeCloseTo(1509, 0);
  });

  it("el costo por kg usa los gramos calculados", () => {
    const d = aplicarPanadero(focaccia(1520));
    const c = costoDeReceta("preparacion", d, () => ({ unidad: "kg", costo: 2 }));
    expect(c.kilos).toBeCloseTo(1.52, 2);
    expect(c.costo!).toBeCloseTo(2, 5);
  });

  it("avisa si falta el peso o los %", () => {
    expect(erroresPanadero({ rendimiento: null, merma: 0, panadero: { pesoMasa: 0, piezas: null }, ingredientes: [ing("Harina", null)] }))
      .toEqual(["Pon el peso de masa de una bandeja (en gramos).", "Pon el % de cada insumo de la masa (la harina es 100%)."]);
    expect(erroresDeReceta({ nombre: "Masa", tipo: "preparacion", detalle: aplicarPanadero(focaccia(1520)) })).toEqual([]);
  });
});

describe("lo que lee Producción", () => {
  it("solo recetas conectadas; la masa con su insumo de Producción y la harina base", () => {
    const d = focaccia(1520);
    d.panadero!.produccion = 4;
    d.ingredientes = d.ingredientes.map((i, k) => ({ ...i, prod: k + 1 }));
    d.ingredientes.push(ing("Bolsa", null, "und", 4));
    const r = recetasParaProduccion([
      { id: 10, nombre: "Masa de Focaccia V4", detalle: d, por: "jahnn", el: "2026-11-26" },
      { id: 11, nombre: "Sin conectar", detalle: focaccia(1520), por: null, el: "2026-11-26" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ ref: "REC:10", produccion: 4, pesoMasa: 1520, harinaBase: 785.12 });
    expect(r[0].lineas).toHaveLength(8);
    expect(r[0].lineas[2]).toEqual({ prod: 3, nombre: "Agua 1", pct: 59.9 });
  });
});
