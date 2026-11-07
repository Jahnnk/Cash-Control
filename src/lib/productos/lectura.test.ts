import { describe, it, expect } from "vitest";
import { lecturaDe } from "./candidatos";

const base = { exclusivos: [] as string[], insumos: [] as { nombre: string; exclusivo: boolean }[] };

describe("lecturaDe", () => {
  it("bolsita de infusión (reventa que dura, insumo compartido) se mantiene", () => {
    const l = lecturaDe({ ...base, nombre: "Bolsa de Infusión: Masala Chai", veredicto: "sacar", origen: "reventa", insumos: [{ nombre: "Masala Chai - Infusión, bolsa", exclusivo: false }] });
    expect(l?.tipo).toBe("mantener");
    expect(l?.porQue).toMatch(/usas en tus preparaciones/);
  });
  it("reventa perecible floja se saca", () => {
    expect(lecturaDe({ ...base, nombre: "Humita", veredicto: "sacar", origen: "reventa" })?.tipo).toBe("sacar");
  });
  it("lo que produce Atelier y rota poco se saca", () => {
    expect(lecturaDe({ ...base, nombre: "Carrot cake", veredicto: "sacar", origen: "atelier", exclusivos: ["Zanahoria"] })?.tipo).toBe("sacar");
  });
  it("producido pero flojo en una sola sede se revisa", () => {
    expect(lecturaDe({ ...base, nombre: "Brownie", veredicto: "revisar", origen: "tienda" })?.tipo).toBe("revisar");
  });
  it("sin origen y en duda: revisar", () => {
    expect(lecturaDe({ ...base, nombre: "X", veredicto: "revisar", origen: null })?.tipo).toBe("revisar");
  });
  it("confirmar no tiene lectura", () => {
    expect(lecturaDe({ ...base, nombre: "X", veredicto: "confirmar", origen: "tienda" })).toBeNull();
  });
});

describe("lecturaDe · hoja Carta", () => {
  it("bolsita fuera de carta: se mantiene y lo dice", () => {
    const l = lecturaDe({ ...base, nombre: "Bolsa de Infusión: Valentina", veredicto: "sacar", origen: "reventa", enCarta: false });
    expect(l?.tipo).toBe("mantener");
    expect(l?.porQue).not.toMatch(/exhibidor, no en la carta/);
  });
});

import { insumoPerecible } from "./candidatos";

describe("café base y perecibles", () => {
  it("reconoce perecibles y duraderos", () => {
    expect(insumoPerecible("Papaya")).toBe(true);
    expect(insumoPerecible("Plátano de Seda")).toBe(true);
    expect(insumoPerecible("Bola de helado - Vainilla, 25g")).toBe(true);
    expect(insumoPerecible("Leche Entera en Caja Gloria")).toBe(false);
    expect(insumoPerecible("Café en Grano")).toBe(false);
    expect(insumoPerecible("Zumo de Piña")).toBe(false);
  });
  it("espresso (insumos que duran y compartidos) se mantiene", () => {
    const l = lecturaDe({ ...base, nombre: "Café Espresso", veredicto: "sacar", origen: "tienda", insumos: [{ nombre: "Café en Grano", exclusivo: false }, { nombre: "Agua en Bidón", exclusivo: false }] });
    expect(l?.tipo).toBe("mantener");
  });
  it("batido de plátano (insumo perecible exclusivo) se saca", () => {
    const l = lecturaDe({ ...base, nombre: "Batido de Plátano", veredicto: "sacar", origen: "tienda", exclusivos: ["Plátano de Seda"], insumos: [{ nombre: "Plátano de Seda", exclusivo: true }] });
    expect(l?.tipo).toBe("sacar");
  });
  it("affogato (helado perecible) se saca aunque sea café", () => {
    const l = lecturaDe({ ...base, nombre: "Affogato", veredicto: "sacar", origen: "tienda", insumos: [{ nombre: "Café en Grano", exclusivo: false }, { nombre: "Bola de helado - Vainilla, 25g", exclusivo: false }] });
    expect(l?.tipo).toBe("sacar");
  });
});

import { pesoDeMantener } from "./candidatos";
it("pesa más lo que tiene perecibles cuya compra se elimina", () => {
  const fruta = { esfuerzo: 3, compras: [{ insumo: "Plátano", otros: [] }] };
  const cafe = { esfuerzo: 3, compras: [] };
  expect(pesoDeMantener(fruta)).toBeGreaterThan(pesoDeMantener(cafe));
});
