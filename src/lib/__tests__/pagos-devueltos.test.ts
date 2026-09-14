import { describe, it, expect } from "vitest";
import { gastosDevueltos } from "../pagos-devueltos";

const g = (id: string, date: string, amount: number, concept: string) => ({ id, date, amount, concept });
const i = (id: string, date: string, amount: number, note: string) => ({ id, date, amount, note });

describe("gastosDevueltos", () => {
  it("Fonavi agosto: cada pago mal ejecutado con su devolución se excluye", () => {
    const gastos = [
      g("a", "2026-08-10", 1027.9, "PAGO DE ATELIER MAL EJECUTADO (OTROS)"),
      g("b", "2026-08-10", 358.32, "PAGO DE ATELIER MAL EJECUTADO (OTROS)"),
      g("c", "2026-08-17", 777.82, "PAGO MAL EJECUTADO (PRODUCTOS SALUDABLES YAYI)"),
      g("x", "2026-08-17", 780.5, "PRODUCTOS ATELIER"),
    ];
    const ingresos = [
      i("1", "2026-08-11", 1027.9, "DEVOLUCIÒN DE ATELIER MAL EJECUTADO (OTROS)"),
      i("2", "2026-08-10", 358.32, "DEVOLUCIÒN DE ATELIER MAL EJECUTADO (OTROS)"),
      i("3", "2026-08-17", 777.82, "DEVOLUCIÓN POR PAGO MAL EJECUTADO (PRODUCTOS SALUDABLES YAYI)"),
      i("4", "2026-08-17", 780.5, "DEVOLUCIÓN POR PAGO MAL EJECUTADO"),
    ];
    expect([...gastosDevueltos(gastos, ingresos)].sort()).toEqual(["a", "b", "c"]);
  });

  it("sin devolución registrada el gasto sigue contando", () => {
    expect(gastosDevueltos([g("a", "2026-08-10", 100, "PAGO MAL EJECUTADO")], []).size).toBe(0);
  });

  it("la devolución tiene que ser del mismo monto", () => {
    const r = gastosDevueltos([g("a", "2026-08-10", 100, "PAGO DOBLE DE TAPERS")], [i("1", "2026-08-12", 99, "REEMBOLSO")]);
    expect(r.size).toBe(0);
  });

  it("acepta hasta 15 días de espera (Centro: 5 → 17 de julio), no más", () => {
    const gasto = [g("a", "2026-07-05", 35, "GASTO MAL EJECUTADO, SE DEVOLVERÁ EL 17.07")];
    expect(gastosDevueltos(gasto, [i("1", "2026-07-17", 35, "DEVOLUCION DE KELLY")]).size).toBe(1);
    expect(gastosDevueltos(gasto, [i("1", "2026-07-25", 35, "DEVOLUCION DE KELLY")]).size).toBe(0);
    expect(gastosDevueltos(gasto, [i("1", "2026-07-01", 35, "DEVOLUCION DE KELLY")]).size).toBe(0);
  });

  it("una devolución no sirve para dos gastos iguales", () => {
    const gastos = [g("a", "2026-08-10", 50, "PAGO MAL EJECUTADO"), g("b", "2026-08-11", 50, "PAGO MAL EJECUTADO")];
    expect(gastosDevueltos(gastos, [i("1", "2026-08-12", 50, "DEVOLUCIÓN")]).size).toBe(1);
  });

  it("un ingreso cualquiera del mismo monto no cuenta como devolución", () => {
    const r = gastosDevueltos([g("a", "2026-08-10", 100, "PAGO DOBLE")], [i("1", "2026-08-11", 100, "DEPÓSITO POR VENTAS EN EFECTIVO")]);
    expect(r.size).toBe(0);
  });
});
