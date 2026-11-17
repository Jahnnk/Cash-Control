/**
 * Prueba de precios (fase 2, 17-nov-2026): la subida se detecta sola en las semanas de Byte y se mide
 * contra un control (la otra sede o el resto de la carta).
 */
import { describe, it, expect } from "vitest";
import { claveByte } from "./costos-carta";
import { detectarSubida, medirPruebas, sensibilidadDe, type SemanaSede } from "./prueba-precios";

const SEMANAS = [
  ["2026-12-06", "2026-12-12"], ["2026-12-13", "2026-12-19"], ["2026-12-20", "2026-12-26"], ["2026-12-27", "2027-01-02"],
  ["2027-01-03", "2027-01-09"], ["2027-01-10", "2027-01-16"], ["2027-01-17", "2027-01-23"], ["2027-01-24", "2027-01-30"],
];
type Venta = [nombre: string, unidades: number, precio: number];
const sem = (sedeId: number, i: number, ventas: Venta[]): SemanaSede => ({
  sedeId, desde: SEMANAS[i][0], hasta: SEMANAS[i][1], dias: 7,
  productos: ventas.map(([nombre, unidades, precio]) => ({ nombre, unidades, ingresos: unidades * precio })),
});
const SEDES = [{ id: 2, nombre: "Fonavi" }, { id: 3, nombre: "Centro" }];

describe("detectar la subida", () => {
  it("encuentra la semana en que el precio sube 3% o más y se queda", () => {
    expect(detectarSubida([21, 21, 21, 21, 23, 23, 23])).toMatchObject({ i: 4, transicion: false, precioAntes: 21, precioDespues: 23 });
  });
  it("una semana a medio camino no cuenta (parte se cobró al precio viejo)", () => {
    expect(detectarSubida([21, 21, 21, 22, 23, 23])).toMatchObject({ i: 3, transicion: true, precioAntes: 21, precioDespues: 23 });
  });
  it("una semana cara suelta no es una subida (un descuento que se quitó, una semana rara)", () => {
    expect(detectarSubida([21, 21, 22.5, 21, 21])).toBeNull();
  });
  it("menos de 3% no cuenta: los descuentos mueven el promedio un poco", () => {
    expect(detectarSubida([21, 20.8, 21.2, 21.4, 21.5])).toBeNull();
  });
  it("las semanas sin venta suficiente no se leen", () => {
    expect(detectarSubida([null, 21, null, 23, 23])).toMatchObject({ i: 3, precioAntes: 21 });
  });
});

describe("sensibilidad", () => {
  it("−0.5 o más = poca; hasta −1.5 = media; menos = alta", () => {
    expect([-0.2, -0.5, -1, -1.5, -2].map(sensibilidadDe)).toEqual(["poca", "media", "media", "media", "alta"]);
  });
});

describe("medir la prueba", () => {
  it("sube en Centro, Fonavi de control: corrige la semana floja de las dos sedes", () => {
    // Centro sube el Triple de 21 a 23 en la semana 4. Las dos sedes caen 20% en las semanas 4–7 (vacaciones).
    const semanas: SemanaSede[] = [];
    for (let i = 0; i < 8; i++) {
      const flojo = i >= 4 ? 0.8 : 1;
      semanas.push(sem(3, i, [["TRIPLE YAYIS", Math.round(70 * flojo * (i >= 4 ? 0.95 : 1)), i >= 4 ? 23 : 21]]));
      semanas.push(sem(2, i, [["TRIPLE YAYIS", Math.round(50 * flojo), 21]]));
    }
    const r = medirPruebas({ semanas, sedes: SEDES, costos: new Map([[claveByte("TRIPLE YAYIS"), 6]]) });
    expect(r.filas).toHaveLength(1);
    const f = r.filas[0];
    expect(f).toMatchObject({ sede: "Centro", control: "otra-sede", desde: "2027-01-03", precioAntes: 21, precioDespues: 23, subidaPct: 9.5, semanasAntes: 4, semanasDespues: 4 });
    // Sin control parecería una caída de 24%; corregida por Fonavi (−20%) el precio solo explica −5%.
    expect(f.cambioPct).toBe(-24.3);
    expect(f.cambioControlPct).toBe(-20);
    expect(f.efectoPct).toBe(-5.4);
    // Aguanta perder 2 ÷ 17 = 11.8%: perdió 5.4% → funciona.
    expect(f.quiebrePct).toBe(11.8);
    expect(f.veredicto).toBe("funciona");
    // −5.4% ÷ 9.5% ≈ −0.56: por cada 10% que sube, vende 5.6% menos.
    expect(f.elasticidad).toBe(-0.56);
    expect(f.sensibilidad).toBe("media");
    expect(f.extraMes).toBeGreaterThan(0);
  });

  it("si perdió más de lo que aguanta, no funciona", () => {
    const semanas: SemanaSede[] = [];
    for (let i = 0; i < 8; i++) {
      semanas.push(sem(3, i, [["EMPANADA MIXTA", i >= 4 ? 70 : 100, i >= 4 ? 8.5 : 8]]));
      semanas.push(sem(2, i, [["EMPANADA MIXTA", 100, 8]]));
    }
    const f = medirPruebas({ semanas, sedes: SEDES, costos: new Map([[claveByte("EMPANADA MIXTA"), 1.7]]) }).filas[0];
    expect(f).toMatchObject({ efectoPct: -30, veredicto: "no-funciona", sensibilidad: "alta" });
    expect(f.extraMes).toBeLessThan(0);
  });

  it("con menos de 2 semanas después, todavía midiendo", () => {
    const semanas: SemanaSede[] = [];
    for (let i = 0; i < 5; i++) {
      semanas.push(sem(3, i, [["CARROT CAKE", 50, i >= 4 ? 13 : 12]]));
      semanas.push(sem(2, i, [["CARROT CAKE", 40, 12]]));
    }
    const f = medirPruebas({ semanas, sedes: SEDES, costos: new Map() }).filas[0];
    expect(f).toMatchObject({ veredicto: "midiendo", semanasDespues: 1 });
  });

  it("si subió en las dos sedes, el control es el resto de la carta", () => {
    const semanas: SemanaSede[] = [];
    for (let i = 0; i < 8; i++) {
      const nuevo = i >= 4;
      for (const id of [2, 3]) semanas.push(sem(id, i, [["CARROT CAKE", nuevo ? 45 : 50, nuevo ? 13 : 12], ["CAPPUCCINO", nuevo ? 90 : 100, 12]]));
    }
    const r = medirPruebas({ semanas, sedes: SEDES, costos: new Map() });
    expect(r.filas).toHaveLength(2);
    // El resto de la carta también bajó 10%: el precio no explica nada.
    for (const f of r.filas) expect(f).toMatchObject({ control: "resto-carta", cambioPct: -10, cambioControlPct: -10, efectoPct: 0, veredicto: "funciona" });
  });

  it("sin subidas no inventa pruebas, y cuenta las semanas cargadas", () => {
    const semanas = [0, 1, 2].flatMap((i) => [sem(2, i, [["CAPPUCCINO", 100, 12]]), sem(3, i, [["CAPPUCCINO", 90, 12]])]);
    const r = medirPruebas({ semanas, sedes: SEDES, costos: new Map() });
    expect(r.filas).toEqual([]);
    expect(r.semanasPorSede).toEqual([{ sedeId: 2, semanas: 3, hasta: "2026-12-26" }, { sedeId: 3, semanas: 3, hasta: "2026-12-26" }]);
  });
});
