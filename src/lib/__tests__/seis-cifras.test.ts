import { describe, it, expect } from "vitest";
import { cifrasDeSede, cifrasDelGrupo, rubroDe, type FilaCifras } from "../seis-cifras";

const f = (categoria: string, monto: number, propio = monto): FilaCifras => ({ categoria, monto, propio });
const sede = (businessId: number, nombre: string, o: Partial<Parameters<typeof cifrasDeSede>[0]> = {}) =>
  cifrasDeSede({
    businessId, sede: nombre, mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
    filas: [], ventas: 10000, caja: { entro: 0, salio: 0 }, ...o,
  });

describe("las seis cifras: cada categoría en su rubro", () => {
  it("variable = costos (menos impuestos); fijo y desconocido = gastos; lo demás, fuera de la ganancia", () => {
    expect(rubroDe("INSUMOS")).toBe("costos");
    expect(rubroDe("PRODUCTOS ATELIER")).toBe("costos");
    expect(rubroDe("IMPUESTOS")).toBe("impuestos");
    expect(rubroDe("PLANILLA")).toBe("gastos");
    expect(rubroDe("POR ACLARAR")).toBe("gastos");
    expect(rubroDe("CATEGORIA QUE NO EXISTE")).toBe("gastos");
    expect(rubroDe("PRÉSTAMOS Y TARJETAS")).toBe("deudas");
    expect(rubroDe("EQUIPOS")).toBe("inversion");
    expect(rubroDe("UTILIDADES A SOCIOS")).toBe("noEsGasto");
  });
});

describe("cifras de una sede", () => {
  it("margen = (ventas − costos) ÷ ventas; ganancia = ventas − costos − gastos − impuestos", () => {
    const s = sede(2, "Fonavi", {
      filas: [f("INSUMOS", 3000), f("PRODUCTOS ATELIER", 2000), f("PLANILLA", 2500), f("ALQUILER", 500), f("IMPUESTOS", 100)],
    });
    expect(s).toMatchObject({ costos: 5000, gastos: 3000, impuestos: 100, margenPct: 50, ganancia: 1900, gananciaPct: 19, conResultado: true });
  });

  it("deudas, inversión y reparto de utilidades salen de la caja pero no de la ganancia", () => {
    const s = sede(2, "Fonavi", {
      filas: [f("INSUMOS", 4000), f("PLANILLA", 3000), f("PRÉSTAMOS Y TARJETAS", 1000), f("EQUIPOS", 800), f("UTILIDADES A SOCIOS", 2400), f("ALQUILER", 900, 600)],
      caja: { entro: 11000, salio: 12100 },
    });
    expect(s.ganancia).toBe(10000 - 4000 - (3000 + 600));
    expect(s.fuera).toEqual({ deudas: 1000, inversion: 800, noEsGasto: 2400, otrasSedes: 300 });
    expect(s.caja.flujo).toBe(-1100);
  });

  it("sin gastos cargados no hay resultado: no se inventa una ganancia de 100%", () => {
    const s = sede(2, "Fonavi", { filas: [], corte: "2026-09-30" });
    expect(s).toMatchObject({ ganancia: null, margenPct: null, conResultado: false, sinResultadoPorque: "Sin gastos cargados" });
  });

  it("mes recién empezado (antes del día 10) tampoco muestra resultado", () => {
    const s = sede(3, "Centro", { mes: "2026-10", finDeMes: "2026-10-31", corte: "2026-10-02", filas: [f("INSUMOS", 665), f("ALQUILER", 150)], ventas: 1271 });
    expect(s).toMatchObject({ conResultado: false, sinResultadoPorque: "El mes recién empieza", mesCompleto: false });
  });

  it("sin Excel o sin ventas se dice por qué", () => {
    expect(sede(1, "Atelier", { corte: null }).sinResultadoPorque).toBe("Sin Excel de este mes");
    expect(sede(1, "Atelier", { ventas: null, filas: [f("INSUMOS", 1)] }).sinResultadoPorque).toBe("Sin ventas cargadas");
  });

  it("a mitad de mes con Excel avanzado sí hay resultado, pero provisional", () => {
    const s = sede(2, "Fonavi", { mes: "2026-10", finDeMes: "2026-10-31", corte: "2026-10-18", filas: [f("INSUMOS", 3000), f("PLANILLA", 1000)] });
    expect(s).toMatchObject({ conResultado: true, mesCompleto: false });
  });
});

describe("el grupo cuenta una sola vez lo que Atelier le vende a las cafeterías", () => {
  it("baja ventas y costos por la compra a Atelier; la ganancia no cambia, el margen sí", () => {
    const fonavi = sede(2, "Fonavi", { filas: [f("PRODUCTOS ATELIER", 3000), f("INSUMOS", 1000), f("PLANILLA", 3000)], ventas: 10000 });
    const atelier = sede(1, "Atelier", { filas: [f("INSUMOS", 2000), f("PLANILLA", 2000)], ventas: 8000 });
    const g = cifrasDelGrupo([fonavi, atelier]);
    expect(g.ventasInternas).toBe(3000);
    expect(g.ventas).toBe(15000);
    expect(g.costos).toBe(4000 + 2000 - 3000);
    // La ganancia es la suma de las dos sedes: (10000-4000-3000) + (8000-2000-2000) = 7000
    expect(g.ganancia).toBe(7000);
    expect(g.margenPct).toBeCloseTo(((15000 - 3000) / 15000) * 100, 0);
  });

  it("una sede sin resultado no entra y se dice cuál y por qué", () => {
    const fonavi = sede(2, "Fonavi", { filas: [f("INSUMOS", 4000), f("PLANILLA", 3000)] });
    const atelier = sede(1, "Atelier", { corte: null });
    const g = cifrasDelGrupo([fonavi, atelier]);
    expect(g.sinResultado).toEqual([{ sede: "Atelier", porque: "Sin Excel de este mes" }]);
    expect(g.ganancia).toBe(3000);
  });
});
