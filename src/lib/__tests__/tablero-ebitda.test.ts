/**
 * El tablero de rentabilidad del CEO (16-oct-2026): las cinco tarjetas y el radar salen de lo que ya
 * calculan los otros motores. Se clavan los estados y que lo que no tiene dato salga en gris.
 */
import { describe, it, expect } from "vitest";
import { tarjetasDelTablero, titularEbitda, puntosDelRadar, ventasPorDia } from "../tablero-ebitda";
import { regla33, profitFirst } from "../regla-33";
import { motoresDeSede } from "../motores-ebitda";
import { cifrasDeSede, cifrasDelGrupo } from "../seis-cifras";
import type { BreakevenResult } from "../breakeven";

const f = (categoria: string, monto: number) => ({ categoria, propio: monto, monto });
// Venta 30,000: costos 14,000 (46.7%), fijos 11,000 (36.7%; planilla 9,000 = 30%), ahorro 3,000.
const sede = cifrasDeSede({
  businessId: 2, sede: "Fonavi", mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
  filas: [f("INSUMOS", 14000), f("PLANILLA", 9000), f("ALQUILER", 2000), f("AHORRO", 3000)], ventas: 30000, caja: { entro: 30000, salio: 0 }, cobrado: 30000,
});
const cif = { sedes: [sede], grupo: cifrasDelGrupo([sede]) };
const regla = regla33(cif)[0];
const pf = profitFirst(cif)[0];
const be = (o: Partial<BreakevenResult>): BreakevenResult => ({
  fijos: 11000, variables: 14000, sinClasificar: 0, ventas: 30000, varRatio: 0.467, contributionMargin: 0.533, breakEven: 25000, pisoDia: 833.33,
  foodCostProyectado: 14000, ventasEsperadas: 30000, sociosFuera: 0, breakEvenLibro: 20000, avancePct: 120, ventasProyectadas: null, diaEstimadoCruce: null,
  estado: "superado", referenceMonths: null, warnings: [], ...o,
});
const merma = (estado: "verde" | "rojo", valor: number) => motoresDeSede({
  regla, ventas: { monto: 30000, esperada: 30000, mesAnterior: null },
  senales: [{ clave: "mermas", etiqueta: "Mermas", estado, detalle: "x", valor, peso: 30000, meta: 4 }],
});

describe("las cinco tarjetas", () => {
  const t = tarjetasDelTablero({ regla, profit: pf, equilibrio: be({}), enCurso: false, motores: merma("verde", 1.9) });

  it("vienen en orden: piso, Profit First, food cost, planilla y mermas", () => {
    expect(t.map((x) => x.clave)).toEqual(["piso", "profit", "food", "planilla", "merma"]);
  });

  it("piso diario: lo que se vende por día contra el piso, en la misma base de 30 días", () => {
    // 30,000 ÷ 30 = 1,000 por día contra un piso de 833.33.
    expect(t[0]).toMatchObject({ valor: "S/833", estado: "verde", avance: 120 });
    expect(t[0].meta).toContain("S/1,000 al día");
    expect(ventasPorDia(be({}), false)).toBe(1000);
  });

  it("mes en curso: se compara el ritmo (ventas proyectadas) contra el piso", () => {
    expect(ventasPorDia(be({ ventasProyectadas: 24000 }), true)).toBe(800);
    // 800 contra un piso de 833.33 (96%): a menos de 5% es ámbar; a 666.67 (80%), rojo.
    expect(tarjetasDelTablero({ regla, profit: pf, equilibrio: be({ ventasProyectadas: 24000 }), enCurso: true, motores: null })[0].estado).toBe("ambar");
    const pobre = tarjetasDelTablero({ regla, profit: pf, equilibrio: be({ ventasProyectadas: 20000 }), enCurso: true, motores: null })[0];
    expect(pobre.estado).toBe("rojo");
    expect(pobre.apoyo).toContain("faltan");
    expect(pobre.meta).toContain("al ritmo actual");
  });

  it("Profit First: lo apartado contra el 25% de la venta", () => {
    // Apartado 3,000 de 7,500: a medias.
    expect(t[1]).toMatchObject({ valor: "S/3,000", estado: "ambar", avance: 40 });
    expect(t[1].meta).toBe("de S/7,500 que toca apartar");
  });

  it("food cost: 46.7% contra su tercio es rojo y dice cuánto se pasó", () => {
    expect(t[2]).toMatchObject({ valor: "46.7%", estado: "rojo" });
    expect(t[2].apoyo).toContain("sobre su tercio");
  });

  it("planilla: 30% está sobre el tope de 25%", () => {
    expect(t[3]).toMatchObject({ valor: "30%", estado: "ambar" });
    expect(t[3].meta).toBe("sano 20–25% de la venta");
    expect(t[3].apoyo).toContain("sobre el tope");
  });

  it("mermas: viene del KPI de la sede; en verde si está bajo su meta", () => {
    expect(t[4]).toMatchObject({ valor: "1.9%", estado: "verde" });
    expect(tarjetasDelTablero({ regla, profit: pf, equilibrio: be({}), enCurso: false, motores: merma("rojo", 6.5) })[4].estado).toBe("rojo");
  });
});

describe("sin datos no se inventa", () => {
  it("todo en gris", () => {
    const t = tarjetasDelTablero({ regla: null, profit: null, equilibrio: null, enCurso: false, motores: null });
    expect(t.every((x) => x.estado === "gris" && x.valor === "—")).toBe(true);
  });
});

describe("titular y radar", () => {
  it("el titular es el EBITDA con su semáforo", () => {
    expect(titularEbitda(regla)).toMatchObject({ estado: "ambar", pct: 16.7 });
    expect(titularEbitda(regla).texto).toBe("EBITDA 16.7% · en camino");
    expect(titularEbitda(null).estado).toBe("gris");
  });

  it("el radar tiene los cuatro ejes en orden y cada puntaje es qué tan cerca está de su meta", () => {
    const r = puntosDelRadar(merma("verde", 1.9));
    expect(r.map((x) => x.clave)).toEqual(["ventas", "producto", "fijos", "eficiencia"]);
    // Ventas en su meta: 100. Costos 46.7% contra 33.3%: 71. Fijos 36.7% contra 33.3%: 91. Eficiencia 1 de 1 en verde: 100.
    expect(r.map((x) => x.puntaje)).toEqual([100, 71, 91, 100]);
  });

  it("sin motores, el radar queda sin puntajes", () => {
    expect(puntosDelRadar(null).every((x) => x.puntaje === null)).toBe(true);
  });
});
