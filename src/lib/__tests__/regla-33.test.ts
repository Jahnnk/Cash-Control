/**
 * La regla del 33-33-33 y el EBITDA (pedido de Jahnn, 15-oct-2026).
 * Lo que se clava: el EBITDA es venta − costos − gastos (la ganancia sin impuestos),
 * lo que le falta a su tercio es lo que los otros dos se pasaron, y el semáforo.
 */
import { describe, it, expect } from "vitest";
import { regla33, dondeFalta, termometroEbitda, TOPE_PLANILLA_PCT } from "../regla-33";
import { cifrasDeSede, cifrasDelGrupo } from "../seis-cifras";

const f = (categoria: string, monto: number) => ({ categoria, propio: monto, monto });
const sede = (businessId: number, nombre: string, filas: ReturnType<typeof f>[], ventas: number) =>
  cifrasDeSede({ businessId, sede: nombre, mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30", filas, ventas, caja: { entro: ventas, salio: 0 }, cobrado: ventas });

// Venta 30,000: costos 12,000 (40%), fijos 10,500 (35%, planilla 9,000 = 30%), impuestos 300.
const fonavi = sede(2, "Fonavi", [f("INSUMOS", 12000), f("PLANILLA", 9000), f("ALQUILER", 1500), f("IMPUESTOS", 300)], 30000);
// Venta 30,000: costos 9,000 (30%), fijos 9,000 (30%, planilla 6,000 = 20%) → EBITDA 40%.
const centro = sede(3, "Centro", [f("INSUMOS", 9000), f("PLANILLA", 6000), f("ALQUILER", 3000)], 30000);
const cifras = { sedes: [fonavi, centro], grupo: cifrasDelGrupo([fonavi, centro]) };

describe("el EBITDA contra la regla 33-33-33", () => {
  it("ordena Fonavi, Centro y cierra con el Grupo", () => {
    expect(regla33(cifras).map((x) => x.etiqueta)).toEqual(["Fonavi", "Centro", "Grupo"]);
  });

  it("EBITDA = venta − costos − gastos, sin contar los impuestos", () => {
    const [fon] = regla33(cifras);
    expect(fon.ebitda).toMatchObject({ monto: 7500, pct: 25 });
    expect(fon.costos).toMatchObject({ monto: 12000, pct: 40, meta: 10000, difMeta: 2000 });
    expect(fon.fijos).toMatchObject({ monto: 10500, pct: 35, meta: 10000, difMeta: 500 });
    // La ganancia real descuenta además los S/ 300 de impuestos.
    expect(fonavi.ganancia).toBe(7200);
  });

  it("lo que le falta al EBITDA para su tercio es lo que costos y fijos se pasaron", () => {
    const [fon] = regla33(cifras);
    const d = dondeFalta(fon)!;
    expect(d).toMatchObject({ llegaAlTercio: false, masCostos: 2000, masFijos: 500 });
    expect(fon.ebitda!.difMeta).toBeCloseTo(d.masCostos + d.masFijos, 1);
  });

  it("si pasa del tercio no pide nada", () => {
    const [, cen] = regla33(cifras);
    expect(cen.ebitda).toMatchObject({ pct: 40 });
    expect(dondeFalta(cen)).toMatchObject({ llegaAlTercio: true, masCostos: 0, masFijos: 0 });
    expect(cen.termometro).toBe("eficiente");
  });

  it("la planilla se mide aparte contra su tope de 25%", () => {
    const [fon, cen] = regla33(cifras);
    expect(TOPE_PLANILLA_PCT).toBe(25);
    expect(fon.planilla).toMatchObject({ monto: 9000, pct: 30, pasaDelTope: true });
    expect(cen.planilla).toMatchObject({ pct: 20, pasaDelTope: false });
  });

  it("el Grupo suma las sedes con la misma regla", () => {
    const g = regla33(cifras)[2];
    expect(g.ventas).toBe(60000);
    expect(g.ebitda).toMatchObject({ monto: 19500, pct: 32.5 });
    expect(g.termometro).toBe("eficiente");
    expect(g.planilla).toMatchObject({ monto: 15000, pct: 25, pasaDelTope: false });
  });

  it("lo que Atelier le vende a las cafeterías se cuenta una vez en el Grupo", () => {
    const atelier = sede(1, "Atelier", [f("INSUMOS", 8000), f("PLANILLA", 9000)], 20000);
    const caf = sede(2, "Fonavi", [f("PRODUCTOS ATELIER", 5000), f("PLANILLA", 6000)], 25000);
    const g = regla33({ sedes: [atelier, caf], grupo: cifrasDelGrupo([atelier, caf]) }).at(-1)!;
    // Ventas 45,000 − 5,000 internas = 40,000; costos 8,000 + 5,000 − 5,000 = 8,000; gastos 15,000.
    expect(g.ventas).toBe(40000);
    expect(g.costos?.monto).toBe(8000);
    expect(g.ebitda).toMatchObject({ monto: 17000, pct: 42.5 });
  });

  it("sin gastos cargados no hay EBITDA: dice por qué en vez de un número engañoso", () => {
    const vacia = cifrasDeSede({ businessId: 2, sede: "Fonavi", mes: "2026-10", finDeMes: "2026-10-31", corte: "2026-10-02", filas: [], ventas: 3000, caja: { entro: 900, salio: 0 }, cobrado: 900 });
    const [fila] = regla33({ sedes: [vacia], grupo: cifrasDelGrupo([vacia]) });
    expect(fila.ebitda).toBeNull();
    expect(fila.sinResultadoPorque).toBe("Sin gastos cargados");
  });

  it("EBITDA negativo: frágil, y no se rompe", () => {
    const rojo = sede(1, "Atelier", [f("INSUMOS", 20000), f("PLANILLA", 17000), f("ALQUILER", 3000)], 36000);
    const [fila] = regla33({ sedes: [rojo], grupo: cifrasDelGrupo([rojo]) });
    expect(fila.ebitda?.monto).toBe(-4000);
    expect(fila.termometro).toBe("fragil");
  });
});

describe("el termómetro", () => {
  it("menos de 10% frágil · de 10 a 30% en camino · 30% o más eficiente", () => {
    expect([-5, 9.9, 10, 29.9, 30, 35].map(termometroEbitda)).toEqual(["fragil", "fragil", "en_camino", "en_camino", "eficiente", "eficiente"]);
  });
});
