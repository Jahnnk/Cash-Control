import { describe, it, expect } from "vitest";
import { armarHistorial, buscarEnHistorial, claveProducto, resumenProducto } from "../historial-producto";

const mes = (m: string, total: number, desde: string, hasta: string, confiable = true) => ({ mes: m, total, desde, hasta, confiable });
const h = armarHistorial({
  meses: ["2026-08", "2026-09", "2026-10"], hoy: "2026-10-24",
  sedes: [
    { id: 2, nombre: "Fonavi", filas: [
      { mes: "2026-08", nombre: "BATIDO DE PLÁTANO", unidades: 62, ingresos: 620 },
      { mes: "2026-09", nombre: "BATIDO DE PLÁTANO", unidades: 30, ingresos: 300 },
      { mes: "2026-10", nombre: "[ELIMINADO 2026-10-15 10:00:00] BATIDO DE PLATANO", unidades: 9, ingresos: 90 },
      { mes: "2026-10", nombre: "CAPPUCCINO", unidades: 200, ingresos: 2400 },
    ], meses: [mes("2026-08", 39000, "2026-08-01", "2026-08-31"), mes("2026-09", 37000, "2026-09-01", "2026-09-30"), mes("2026-10", 20700, "2026-10-01", "2026-10-18")] },
    { id: 1, nombre: "Atelier", filas: [
      { mes: "2026-10", nombre: "Y-BROWNIE TRIPLE CHOCOLATE", unidades: 54, ingresos: 291.6 },
      { mes: "2026-10", nombre: "P-BROWNIE TRIPLE CHOCOLATE", unidades: 181, ingresos: 1332.16 },
    ], meses: [mes("2026-10", 20538, "2026-10-01", "2026-10-18")] },
  ],
});

describe("buscador de producto", () => {
  it("el mismo producto aunque Byte lo marque eliminado o le quite la tilde", () => {
    expect(claveProducto("[ELIMINADO 2026-10-15 10:00:00] BATIDO DE PLATANO")).toBe(claveProducto("Batido de plátano"));
    const p = h.productos.find((x) => x.clave === claveProducto("batido de platano"))!;
    expect(p.eliminado).toBe(true);
    expect(p.ventas[2]["2026-08"].u).toBe(62);
  });
  it("en Atelier, Y- y P- son productos distintos", () => {
    expect(buscarEnHistorial(h.productos, "brownie").map((x) => x.nombre)).toEqual(["P-BROWNIE TRIPLE CHOCOLATE", "Y-BROWNIE TRIPLE CHOCOLATE"]);
  });
  it("busca sin tildes ni mayúsculas, por palabras", () => {
    expect(buscarEnHistorial(h.productos, "platano batido")[0].nombre).toBe("BATIDO DE PLATANO");
  });
  it("el último mes a medias se compara por día con el anterior", () => {
    const r = resumenProducto(h, claveProducto("batido de platano"), 1)[0];
    expect(r.venta).toBe(90);
    expect(r.dias).toBe(18);
    expect(r.ventaDia).toBe(5);
    expect(r.cambioPct).toBe(-50); // 5/día contra 10/día en setiembre
    expect(r.puesto).toEqual({ n: 2, de: 2, mes: "2026-10" });
  });
  it("3 meses suma lo confiable y compara contra el periodo anterior si existe", () => {
    const r = resumenProducto(h, claveProducto("batido de platano"), 3)[0];
    expect(r.unidades).toBe(101);
    expect(r.cambioPct).toBeNull();
  });
});
