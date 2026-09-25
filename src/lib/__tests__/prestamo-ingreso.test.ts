import { describe, it, expect } from "vitest";
import { categoriaPrestamoIngreso } from "../prestamo-ingreso";
import { partirMonto, type ReglaReparto } from "../reparto-compartido";

describe("ingresos que son préstamos (Excel de Kelly)", () => {
  it.each([
    ["PRÉSTAMO PARA 50% ARREGLO ABATIDOR (SE DEBOLVERÁ EN OCTUBRE) (JUAN TERRONES)", "Préstamos / financiamiento recibido"],
    ["PRÉSTAMO SIN INTERESES EN 5 CUOTAS (AGO-DIC) (SERVICIOS GASTRONOMICOS YAYIS SAC)", "Préstamos / financiamiento recibido"],
    ["PRESTAMO A ATELIER (FONDOS MUTUOS)", "Préstamos / financiamiento recibido"],
    ["PAGO 1ER CUOTA PRÉSTAMO (5000.00) (PRODUCTOS SALUDABLES YAYI)", "Otros no operativos"],
    ["PAGO 1ER CUOTA PRESTAMO A ATELIER (PRODUCTOS SALUDABLES YAYI´S SRL)", "Otros no operativos"],
  ])("%s → %s", (nota, cat) => {
    expect(categoriaPrestamoIngreso(nota)).toBe(cat);
  });

  it("las ventas y reembolsos normales no se tocan", () => {
    expect(categoriaPrestamoIngreso("VENTA DEL DÍA")).toBeNull();
    expect(categoriaPrestamoIngreso("REEMBOLSO POR COMPRA LECHE (LUIS PISCO)")).toBeNull();
    expect(categoriaPrestamoIngreso(null)).toBeNull();
  });
});

describe("reparto con monto fijo: el fijo es mensual", () => {
  const alquiler: ReglaReparto = {
    id: "r1", categoria: "ALQUILER", concepto: "Alquiler", modo: "fixed",
    atelierPct: 0, fonaviPct: 0, centroPct: 0, atelierFijo: 1800, fonaviFijo: 900, centroFijo: null,
  };

  it("un solo pago de S/2,700: 1,800 Atelier y 900 Fonavi", () => {
    expect(partirMonto(2700, alquiler)).toEqual({ atelier: 1800, fonavi: 900, centro: 0 });
  });

  it("pagado en dos partes (2,400 + 300 de saldo): el saldo va entero a Fonavi", () => {
    const p1 = partirMonto(2400, alquiler);
    expect(p1).toEqual({ atelier: 1800, fonavi: 600, centro: 0 });
    const p2 = partirMonto(300, alquiler, { atelier: p1.atelier, centro: p1.centro });
    expect(p2).toEqual({ atelier: 0, fonavi: 300, centro: 0 });
  });

  it("un pago menor que el fijo nunca deja partes negativas", () => {
    expect(partirMonto(300, alquiler)).toEqual({ atelier: 300, fonavi: 0, centro: 0 });
  });
});
