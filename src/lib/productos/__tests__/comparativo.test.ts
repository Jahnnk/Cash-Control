import { describe, expect, it } from "vitest";
import { armarHistorial } from "../historial-producto";
import { antesDespues, comparativo, mesesDelRango, productosQueCambian, semanaPorFamilias, TODAS, tramoCompleto } from "../comparativo";

const POSTRES = "Postres y pastelería";
const mesSede = (mes: string, total: number, confiable = true, hasta?: string) => ({ mes, total, desde: `${mes}-01`, hasta: hasta ?? `${mes}-30`, confiable });
const h = armarHistorial({
  meses: ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"], hoy: "2026-11-13",
  sedes: [{
    id: 2, nombre: "Fonavi",
    filas: [
      { mes: "2026-07", nombre: "CARROT CAKE", unidades: 300, ingresos: 3000 }, { mes: "2026-07", nombre: "CAPPUCCINO", unidades: 600, ingresos: 6000 },
      { mes: "2026-08", nombre: "CARROT CAKE", unidades: 300, ingresos: 3000 }, { mes: "2026-08", nombre: "CAPPUCCINO", unidades: 600, ingresos: 6000 },
      { mes: "2026-09", nombre: "CARROT CAKE", unidades: 150, ingresos: 1500 }, { mes: "2026-09", nombre: "CAPPUCCINO", unidades: 600, ingresos: 6000 },
      { mes: "2026-09", nombre: "CHEESECAKE DE FRESA", unidades: 30, ingresos: 300 },
      { mes: "2026-10", nombre: "CARROT CAKE", unidades: 900, ingresos: 9000 }, { mes: "2026-10", nombre: "CAPPUCCINO", unidades: 600, ingresos: 6000 },
      { mes: "2026-11", nombre: "CARROT CAKE", unidades: 50, ingresos: 500 },
    ],
    meses: [mesSede("2026-07", 9000), mesSede("2026-08", 9000), mesSede("2026-09", 7800), mesSede("2026-10", 15000, false), mesSede("2026-11", 500, true, "2026-11-10")],
  }],
});

describe("mesesDelRango", () => {
  it("devuelve los meses entre los dos extremos, en cualquier orden", () => {
    expect(mesesDelRango(h, "2026-08", "2026-09")).toEqual(["2026-08", "2026-09"]);
    expect(mesesDelRango(h, "2026-09", "2026-08")).toEqual(["2026-08", "2026-09"]);
  });
});

describe("comparativo", () => {
  const c = comparativo(h, "2026-07", "2026-11");
  const postres = c.filas.find((f) => f.familia === POSTRES)!;
  it("da una fila por categoría con venta y el total de la sede", () => {
    expect(c.filas.map((f) => f.familia)).toEqual([TODAS, POSTRES, "Bebidas calientes"]);
  });
  it("mide por día y saca la parte de la venta de la sede", () => {
    expect(postres.serie[0]).toMatchObject({ mes: "2026-07", venta: 3000, unidades: 300, dias: 30, ventaDia: 100, unidadesDia: 10, pctSede: 33.3 });
    expect(postres.serie[2]).toMatchObject({ venta: 1800, pctSede: 23.1 });
  });
  it("marca el mes que no cuadra y el mes en curso", () => {
    expect(postres.serie[3].confiable).toBe(false);
    expect(postres.serie[4]).toMatchObject({ aMedias: true, dias: 10, ventaDia: 50 });
    expect(postres.serie[0].aMedias).toBe(false);
  });
});

describe("antesDespues", () => {
  const c = comparativo(h, "2026-07", "2026-11");
  const postres = c.filas.find((f) => f.familia === POSTRES)!, total = c.filas.find((f) => f.familia === TODAS)!;
  it("compara por día y deja fuera el mes que no cuadra", () => {
    const ad = antesDespues(postres.serie, "2026-09", total.serie);
    expect(ad.antes).toMatchObject({ meses: ["2026-07", "2026-08"], dias: 60, ventaDia: 100, pctSede: 33.3 });
    expect(ad.despues.meses).toEqual(["2026-09", "2026-11"]); // octubre no cuadra con Byte
    expect(ad.despues.ventaDia).toBeCloseTo(2300 / 40, 5);
    expect(ad.cambioVentaPct).toBe(-42.5);
    expect(ad.cambioPctSede).toBeCloseTo(27.7 - 33.3, 1);
  });
  it("sin un lado no inventa el cambio", () => {
    expect(antesDespues(postres.serie, "2026-07", total.serie).cambioVentaPct).toBeNull();
  });
  it("el total de la sede no tiene parte", () => {
    expect(antesDespues(total.serie, "2026-09", null).antes.pctSede).toBeNull();
  });
});

describe("productosQueCambian", () => {
  it("ordena del que más bajó al que más subió, solo de la categoría", () => {
    const p = productosQueCambian(h, 2, POSTRES, "2026-07", "2026-11", "2026-09");
    expect(p.map((x) => x.nombre)).toEqual(["CARROT CAKE", "CHEESECAKE DE FRESA"]);
    expect(p[0]).toMatchObject({ antesDia: 100, despuesDia: 50, cambioDia: -50 });
    expect(p[1].cambioDia).toBe(7.5);
  });
  it("vacío si falta un lado", () => {
    expect(productosQueCambian(h, 2, POSTRES, "2026-07", "2026-08", "2026-07")).toEqual([]);
  });
});

describe("semanaPorFamilias y tramoCompleto", () => {
  it("suma la semana por categoría y deja el total en «Todas»", () => {
    const s = semanaPorFamilias(2, { desde: "2026-10-18", hasta: "2026-10-24", dias: 7, productos: [{ nombre: "CARROT CAKE", unidades: 10, ingresos: 120 }, { nombre: "BROWNIE VEGANO", unidades: 5, ingresos: 35 }, { nombre: "CAPPUCCINO", unidades: 20, ingresos: 180 }] });
    expect(s.porFamilia[POSTRES]).toEqual({ u: 15, r: 155 });
    expect(s.porFamilia[TODAS]).toEqual({ u: 35, r: 335 });
    expect(s.dias).toBe(7);
  });
  it("el tramo completo deja fuera el mes que no cuadra", () => {
    const c = comparativo(h, "2026-07", "2026-10");
    const postres = c.filas.find((f) => f.familia === POSTRES)!, total = c.filas.find((f) => f.familia === TODAS)!;
    const t = tramoCompleto(postres.serie, total.serie);
    expect(t.meses).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(t.ventaDia).toBeCloseTo(7800 / 90, 5);
  });
});
