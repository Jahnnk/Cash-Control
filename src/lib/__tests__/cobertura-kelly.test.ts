/** La grilla de los Excel de Kelly: casos reales de set-2026. */
import { describe, it, expect } from "vitest";
import { celdaKelly, type MesKelly } from "../cobertura-kelly";

const m = (o: Partial<MesKelly>): MesKelly => ({
  businessId: 2, month: "2026-08", ventas: 38872.65, diasVenta: 31, gastos: 52000, hasta: "2026-08-31", cargadoEl: "2026-09-03", ...o,
});
const HOY = "2026-09-22";

describe("un mes cerrado", () => {
  it("con movimientos hasta fin de mes y ventas todos los días: completo", () => {
    expect(celdaKelly(m({}), HOY, true)).toMatchObject({ estado: "completo", texto: "mes completo" });
  });
  it("la planilla se paga el 30: un mes que llega al 29 sigue completo", () => {
    expect(celdaKelly(m({ hasta: "2026-08-29" }), HOY, true).estado).toBe("completo");
  });
  it("si se corta antes, parcial y hasta qué día", () => {
    expect(celdaKelly(m({ hasta: "2026-08-22" }), HOY, true)).toMatchObject({ estado: "parcial", texto: "solo hasta el 22 ago" });
  });
  it("en una cafetería, sin ventas en la mayoría de días: parcial", () => {
    expect(celdaKelly(m({ diasVenta: 11 }), HOY, true)).toMatchObject({ estado: "parcial", texto: "ventas en 11 de 31 días" });
  });
  it("Atelier no necesita venta todos los días", () => {
    expect(celdaKelly(m({ businessId: 1, diasVenta: 20 }), HOY, false).estado).toBe("completo");
  });
});

describe("el mes en curso", () => {
  it("hasta hace una semana: al día", () => {
    expect(celdaKelly(m({ month: "2026-09", hasta: "2026-09-15" }), HOY, true)).toMatchObject({ estado: "al-dia", texto: "al día · hasta el 15 set" });
  });
  it("más de una semana: atrasado", () => {
    expect(celdaKelly(m({ month: "2026-09", hasta: "2026-09-11" }), HOY, true)).toMatchObject({ estado: "atrasado" });
  });
});

it("sin nada cargado: vacío", () => {
  expect(celdaKelly(m({ ventas: 0, gastos: 0, hasta: null, cargadoEl: null }), HOY, true).estado).toBe("vacio");
});

it("un mes registrado a mano (Atelier antes del Excel) no es un hueco", () => {
  expect(celdaKelly(m({ businessId: 1, ventas: 0, gastos: 0, hasta: null, cargadoEl: null, gastosManuales: 30000 }), HOY, false))
    .toMatchObject({ estado: "manual", texto: "registrado a mano" });
});
