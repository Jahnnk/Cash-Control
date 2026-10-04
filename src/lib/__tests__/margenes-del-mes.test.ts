import { describe, it, expect } from "vitest";
import { margenesDelMes, porQueDifieren } from "../margenes-del-mes";
import { cifrasDeSede, cifrasDelGrupo } from "../seis-cifras";

const f = (categoria: string, monto: number) => ({ categoria, propio: monto, monto });
// Atelier setiembre, resumido: ganó poco y pagó mucha deuda → caja negativa.
const atelier = cifrasDeSede({
  businessId: 1, sede: "Atelier", mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
  filas: [f("INSUMOS", 18000), f("PLANILLA", 17000), f("IMPUESTOS", 600), f("PRÉSTAMOS Y TARJETAS", 10500), f("AHORRO", 300)],
  ventas: 36000, caja: { entro: 43000, salio: 47000 }, cobrado: 37000,
});
const fonavi = cifrasDeSede({
  businessId: 2, sede: "Fonavi", mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
  filas: [f("INSUMOS", 14000), f("PLANILLA", 14000), f("PRÉSTAMOS Y TARJETAS", 1800)],
  ventas: 37000, caja: { entro: 37000, salio: 31000 }, cobrado: 36000,
});
const cifras = { mes: "2026-09", sedes: [atelier, fonavi], grupo: cifrasDelGrupo([atelier, fonavi]) };

describe("los dos márgenes por sede", () => {
  it("ordena Fonavi, Centro, Atelier y cierra con el grupo", () => {
    expect(margenesDelMes(cifras).map((x) => x.etiqueta)).toEqual(["Fonavi", "Atelier", "Grupo"]);
  });

  it("margen de ganancia = ganancia real ÷ ventas; margen de caja = (entró − salió) ÷ entró", () => {
    const [fon, ate] = margenesDelMes(cifras);
    expect(fon).toMatchObject({ gananciaPct: 24.3, margenCajaPct: 16.22, salioPor100: 83.78 });
    expect(ate).toMatchObject({ gananciaPct: 1.1, margenCajaPct: -9.3, salioPor100: 109.3 });
  });

  it("una sede puede ganar y tener la caja negativa: el motivo son las deudas y el ahorro", () => {
    const d = porQueDifieren(cifras);
    expect(d?.sede).toBe("Atelier");
    expect(d?.motivos).toEqual([{ etiqueta: "cuotas de deuda", monto: 10500 }, { etiqueta: "ahorro a fondos mutuos", monto: 300 }]);
  });

  it("sin gastos cargados no hay margen de ganancia ni de caja (daría +100% sin ser verdad)", () => {
    const sinGastos = cifrasDeSede({ businessId: 2, sede: "Fonavi", mes: "2026-10", finDeMes: "2026-10-31", corte: "2026-10-02", filas: [], ventas: 3000, caja: { entro: 981.22, salio: 0 }, cobrado: 981.22 });
    const [fila] = margenesDelMes({ mes: "2026-10", sedes: [sinGastos], grupo: cifrasDelGrupo([sinGastos]) });
    expect(fila.gananciaPct).toBeNull();
    expect(fila.sinGananciaPorque).toBe("Sin gastos cargados");
    expect(fila.margenCajaPct).toBeNull();
    expect(fila.entro).toBe(981.22);
  });
});
