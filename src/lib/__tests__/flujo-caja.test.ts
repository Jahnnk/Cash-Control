import { describe, it, expect } from "vitest";
import { armarSerie, sumarSedes, textoMovimientosAhorro, type MesFlujo } from "../flujo-caja";

const m = (mes: string, entro: number, salio: number, o: Partial<MesFlujo> = {}): MesFlujo => ({ mes, entro, salio, ahorro: 0, reparto: 0, rescate: 0, ...o });

describe("flujo de caja mensual", () => {
  it("el acumulado suma los flujos de todos los meses", () => {
    const s = armarSerie([m("2026-04", 100, 110), m("2026-05", 120, 100), m("2026-06", 90, 95)]);
    expect(s.map((p) => p.flujo)).toEqual([-10, 20, -5]);
    expect(s.map((p) => p.acumulado)).toEqual([-10, 10, 5]);
  });

  it("el ahorro no es pérdida: el acumulado no cuenta lo depositado, lo rescatado ni lo pagado a socios", () => {
    // Centro, septiembre: entró 43,984.61 · salió 44,906.85, de lo cual 7,200 al ahorro y 2,400 a socios; entró un rescate de 2,400.
    const [sep] = armarSerie([m("2026-09", 43984.61, 44906.85, { ahorro: 7200, reparto: 2400, rescate: 2400 })]);
    expect(sep.flujo).toBe(-922.24);
    expect(sep.neto).toBe(6277.76);
    expect(sep.acumulado).toBe(6277.76);
  });

  it("recorta a la ventana pero el acumulado no se reinicia", () => {
    const meses = ["01", "02", "03", "04", "05", "06", "07", "08"].map((x) => m(`2026-${x}`, 100, 90));
    const s = armarSerie(meses, 6);
    expect(s).toHaveLength(6);
    expect(s[0].mes).toBe("2026-03");
    expect(s[0].acumulado).toBe(30);
    expect(s[5].acumulado).toBe(80);
  });

  it("no dibuja los meses anteriores a que la sede tuviera datos", () => {
    const s = armarSerie([m("2026-03", 0, 0), m("2026-04", 50, 40)]);
    expect(s.map((p) => p.mes)).toEqual(["2026-04"]);
    expect(armarSerie([m("2026-03", 0, 0)])).toEqual([]);
  });

  it("el grupo suma las sedes: lo que una presta a otra se cancela", () => {
    // Atelier presta 1,000 a Centro: sale de Atelier y entra a Centro.
    const g = sumarSedes([[m("2026-09", 500, 1500)], [m("2026-09", 1700, 700)]]);
    expect(g).toEqual([{ mes: "2026-09", entro: 2200, salio: 2200, ahorro: 0, reparto: 0, rescate: 0 }]);
  });

  it("dice los movimientos del ahorro como un solo hecho cuando el rescate paga las utilidades", () => {
    expect(textoMovimientosAhorro({ ahorro: 7200, rescate: 2400, reparto: 2400 })).toBe("al ahorro S/7,200.00 · del ahorro S/2,400.00 → utilidades a socios S/2,400.00");
    expect(textoMovimientosAhorro({ ahorro: 0, rescate: 0, reparto: 0 })).toBe("");
  });
});
