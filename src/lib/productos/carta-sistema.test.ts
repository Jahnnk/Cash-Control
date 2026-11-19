/**
 * La carta con los cambios hechos en el sistema (fase 2a, 18-nov-2026).
 */
import { describe, it, expect } from "vitest";
import type { CostoCarta } from "./costos-carta";
import { aplicarCartaSistema, marcaDe, type CambioCarta } from "./carta-sistema";

const excel: CostoCarta[] = [
  { ref: "CF-011", nombre: "Latte", nombreCarta: "Latte", categoria: "CAFÉ", costo: 3.2, precio: 12, origen: "Cafetería", seccion: "Café Caliente", enCarta: true },
  { ref: "AT-046", nombre: "Brownie", nombreCarta: null, categoria: "POSTRES", costo: 4.1, precio: 9, origen: "Atelier", seccion: null, enCarta: false },
];
const cambio = (c: Partial<CambioCarta> & { ref: string }): CambioCarta => ({ nombre: null, nombreCarta: null, seccion: null, origen: null, categoria: null, precio: null, costo: null, nuevo: false, ...c });

describe("carta del sistema", () => {
  it("sin cambios es la carta del Excel", () => {
    expect(aplicarCartaSistema(excel, [])).toBe(excel);
  });
  it("el sistema cambia precio, precio interno y sección; lo vacío queda del Excel", () => {
    const r = aplicarCartaSistema(excel, [cambio({ ref: "CF-011", precio: 13 }), cambio({ ref: "AT-046", costo: 4.5, seccion: "Postres" })]);
    expect(r[0]).toMatchObject({ precio: 13, costo: 3.2, seccion: "Café Caliente" });
    expect(r[1]).toMatchObject({ precio: 9, costo: 4.5, seccion: "Postres", enCarta: true });
    expect(excel[0].precio).toBe(12); // no toca la lista original
  });
  it("un cambio de un producto que ya no está en el Excel no aparece (salvo que sea nuevo)", () => {
    expect(aplicarCartaSistema(excel, [cambio({ ref: "CF-999", precio: 5 })])).toHaveLength(2);
    const r = aplicarCartaSistema(excel, [cambio({ ref: "SIS-001", nombre: "Sánguche nuevo", precio: 16, costo: 5, seccion: "Sánguches", nuevo: true })]);
    expect(r).toHaveLength(3);
    expect(r[2]).toMatchObject({ ref: "SIS-001", precio: 16, costo: 5, enCarta: true });
  });
  it("la marca dice qué cambió el sistema", () => {
    expect(marcaDe(cambio({ ref: "x", precio: 1 }))).toEqual({ precio: true, costo: false, seccion: false, nuevo: false });
    expect(marcaDe(undefined)).toEqual({ precio: false, costo: false, seccion: false, nuevo: false });
  });
});
