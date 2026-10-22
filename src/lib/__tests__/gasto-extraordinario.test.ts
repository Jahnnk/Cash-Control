/**
 * Gasto extraordinario (22-oct-2026): un pago de MANTENIMIENTO de S/1,000 o más. Sigue siendo gasto: la ganancia no
 * cambia, solo se dice aparte. Caso real: Atelier, setiembre (abatidor y refrigeradora, S/6,300).
 */
import { describe, it, expect } from "vitest";
import { cifrasDeSede, cifrasDelGrupo, esGastoExtraordinario } from "../seis-cifras";

const atelierSet = cifrasDeSede({
  businessId: 1, sede: "Atelier", mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
  ventas: 36285.43, caja: { entro: 0, salio: 0 },
  filas: [
    { categoria: "INSUMOS", propio: 14463.83, monto: 14463.83 },
    { categoria: "PLANILLA", propio: 12742, monto: 12742 },
    { categoria: "MANTENIMIENTO", concepto: "MANTENIMIENTO (LUIS LINAN)", propio: 3300, monto: 3300 },
    { categoria: "MANTENIMIENTO", concepto: "ARREGLO 50% ABATIDOR (LUIS LINAN) [FA]", propio: 1500, monto: 1500 },
    { categoria: "MANTENIMIENTO", concepto: "ARREGLO 50% ABATIDOR (PRÉSTAMO DE JUAN) (LUIS LINAN) [FA]", propio: 1500, monto: 1500 },
    { categoria: "MANTENIMIENTO", concepto: "Gasfitero", propio: 508, monto: 508 },
    { categoria: "EQUIPOS", concepto: "Licuadora nueva", propio: 2000, monto: 2000 },
  ],
});

describe("gasto extraordinario", () => {
  it("la regla: mantenimiento de S/1,000 o más en un solo pago", () => {
    expect(esGastoExtraordinario("MANTENIMIENTO", 1000)).toBe(true);
    expect(esGastoExtraordinario("mantenimiento ", 6300)).toBe(true);
    expect(esGastoExtraordinario("MANTENIMIENTO", 911)).toBe(false);
    expect(esGastoExtraordinario("EQUIPOS", 5000)).toBe(false); // comprar un equipo es inversión, no gasto
  });

  it("Atelier setiembre: S/6,300 de extraordinario, con sus tres pagos", () => {
    expect(atelierSet.extraordinario.total).toBe(6300);
    expect(atelierSet.extraordinario.movimientos).toHaveLength(3);
  });

  it("la ganancia NO cambia: lo extraordinario sigue dentro de los gastos", () => {
    expect(atelierSet.gastos).toBe(12742 + 6300 + 508);
    expect(atelierSet.ganancia).toBe(Math.round((36285.43 - 14463.83 - 12742 - 6300 - 508) * 100) / 100);
  });

  it("el grupo suma lo extraordinario de las sedes con resultado", () => {
    expect(cifrasDelGrupo([atelierSet]).extraordinario).toBe(6300);
  });
});
