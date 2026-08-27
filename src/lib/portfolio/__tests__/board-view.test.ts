/**
 * Tests del portafolio para la reunión.
 *
 * Lo que se clava:
 *  · Que cada cuadrante ordene por lo que hace URGENTE su decisión (no
 *    todos por venta: al que hay que sacar de la carta conviene verlo
 *    de menor a mayor).
 *  · Que la advertencia de cobertura NUNCA desaparezca — es lo que
 *    evita decidir la carta con la mitad del negocio sin costear.
 */
import { describe, it, expect } from "vitest";
import {
  construirCuadrantes, construirCobertura, construirBoardPortfolio,
  tituloDeAtencion, movimientosRelevantes, COBERTURA_MINIMA, MAX_POR_CUADRANTE,
} from "../board-view";
import type { PortfolioIntelligence, ProductIntel, MenuEngQuadrant } from "../types";

const prod = (
  name: string, menuEng: MenuEngQuadrant | null, revenue: number,
  unitContribution: number | null = 2, units = 100,
): ProductIntel => ({
  key: name, productId: null, name, category: null,
  units, revenue, avgPrice: revenue / units, revenueShare: 0.1,
  isAccompaniment: false,
  hasCost: unitContribution !== null, unitCogs: 1,
  unitContribution, contribution: unitContribution !== null ? unitContribution * units : null,
  marginPct: 0.3, targetMarginPct: 0.35,
  abcClass: "A", menuEng, menuEngReason: null,
  growthPct: null, trend: null, bcg: null, bcgReason: null, isNew: false,
  verdict: "observar", verdictReason: "x", drivers: [],
});

const intel = (
  products: ProductIntel[],
  dq: Partial<PortfolioIntelligence["dataQuality"]> = {},
): PortfolioIntelligence => ({
  products, signals: [],
  health: { total: 70, level: "estable", components: [], costCoveragePct: 90 },
  recommendations: [],
  concentration: { top1Share: 0.2, top3Share: 0.5, topCategory: null, severity: "media" },
  abcSummary: { aCount: 1, bCount: 1, cCount: 1, aRevenueShare: 0.8 },
  menuEngSummary: { stars: 0, plowHorses: 0, puzzles: 0, dogs: 0, healthyContributionShare: null },
  bcgSummary: null,
  dataQuality: {
    costCoveragePct: 90, productsWithCost: 9, productsTotal: 10,
    topUncosted: [], uncostedRevenue: 500, costsAreApproximated: false, ...dq,
  },
  boardDecisions: [], boardQuestions: [], inactiveMethodologies: [],
});

describe("orden dentro de cada cuadrante", () => {
  it("los de MANTENER van por venta: primero el que más plata mueve", () => {
    const c = construirCuadrantes(intel([
      prod("Chico", "star", 100), prod("Grande", "star", 900), prod("Medio", "star", 500),
    ]));
    const star = c.find((x) => x.q === "star")!;
    expect(star.productos.map((p) => p.nombre)).toEqual(["Grande", "Medio", "Chico"]);
  });

  it("los de PROMOCIONAR van por margen unitario: promocionar el que más deja", () => {
    const c = construirCuadrantes(intel([
      prod("PocoMargen", "puzzle", 900, 1), prod("MuchoMargen", "puzzle", 100, 8),
    ]));
    const puzzle = c.find((x) => x.q === "puzzle")!;
    expect(puzzle.productos[0].nombre).toBe("MuchoMargen");
  });

  it("los CANDIDATOS A REEMPLAZO van de menor a mayor venta: el más chico duele menos", () => {
    const c = construirCuadrantes(intel([
      prod("Duele", "dog", 900), prod("NoDuele", "dog", 40),
    ]));
    const dog = c.find((x) => x.q === "dog")!;
    expect(dog.productos[0].nombre).toBe("NoDuele");
  });

  it("un producto SIN costo no entra a ningún cuadrante", () => {
    const c = construirCuadrantes(intel([prod("SinCosto", null, 900, null)]));
    expect(c.every((x) => x.productos.length === 0)).toBe(true);
  });

  it("recorta la lista pero informa el total real", () => {
    const muchos = Array.from({ length: 9 }, (_, i) => prod(`P${i}`, "star", 100 * (i + 1)));
    const star = construirCuadrantes(intel(muchos)).find((x) => x.q === "star")!;
    expect(star.productos).toHaveLength(MAX_POR_CUADRANTE);
    expect(star.total).toBe(9);           // no se esconde cuántos son
    expect(star.venta).toBe(4500);        // la venta suma TODOS, no los 5
  });
});

describe("cobertura de costos", () => {
  it("con poca cobertura avisa que NO sirve para decidir la carta", () => {
    const c = construirCobertura(intel([], {
      costCoveragePct: 49, productsWithCost: 20, productsTotal: 60, uncostedRevenue: 18000,
    }));
    expect(c.insuficiente).toBe(true);
    expect(c.advertencia).toContain("NO para decidir la carta");
    expect(c.advertencia).toContain("49%");
  });

  it("aun con cobertura ALTA sigue diciendo qué quedó fuera", () => {
    const c = construirCobertura(intel([], {
      costCoveragePct: 82, productsWithCost: 50, productsTotal: 60, uncostedRevenue: 3000,
    }));
    expect(c.insuficiente).toBe(false);
    expect(c.advertencia).toContain("82%");
    expect(c.advertencia).toContain("10 productos");
  });

  it("el umbral es 60%: 59 avisa fuerte, 60 no", () => {
    expect(construirCobertura(intel([], { costCoveragePct: COBERTURA_MINIMA - 1 })).insuficiente).toBe(true);
    expect(construirCobertura(intel([], { costCoveragePct: COBERTURA_MINIMA })).insuficiente).toBe(false);
  });

  it("declara cuando los costos son aproximados", () => {
    const c = construirCobertura(intel([], { costsAreApproximated: true }));
    expect(c.advertencia).toContain("aproximación");
  });
});

describe("qué mirar primero", () => {
  const armar = (i: PortfolioIntelligence) => construirBoardPortfolio({
    intel: i, mes: "2026-08", mesLabel: "agosto 2026", mesEnCurso: true,
    movers: { risers: [], fallers: [] }, proyeccion: null,
  });

  it("con cobertura baja, la prioridad es COSTEAR, no decidir", () => {
    const t = tituloDeAtencion(armar(intel([prod("A", "puzzle", 100)], { costCoveragePct: 40 })));
    expect(t).toContain("costear");
  });

  it("manda promocionar los de buen margen y poca rotación", () => {
    const t = tituloDeAtencion(armar(intel([prod("A", "puzzle", 100), prod("B", "plow_horse", 900)])));
    expect(t).toContain("promocionarlos");
  });

  it("sin puzzles, apunta a los de mucha rotación y poco margen", () => {
    const t = tituloDeAtencion(armar(intel([prod("B", "plow_horse", 900)])));
    expect(t).toContain("revisar precio o receta");
  });

  it("sin desequilibrios no inventa una urgencia", () => {
    const t = tituloDeAtencion(armar(intel([prod("A", "star", 900)])));
    expect(t).toContain("no muestra desequilibrios");
  });
});

describe("qué movimientos llegan a la reunión", () => {
  const mover = (name: string, firstRevenue: number, lastRevenue: number) => ({
    name, firstMonth: "2026-06", lastMonth: "2026-07",
    firstRevenue, lastRevenue,
    changePct: Math.round(((lastRevenue - firstRevenue) / firstRevenue) * 1000) / 10,
  });

  it("descarta el +1200% que solo mueve S/240: en porcentaje gana lo chico", () => {
    const r = movimientosRelevantes([mover("Torta Tropical", 20, 260)], 4);
    expect(r).toHaveLength(0);
  });

  it("ordena por PLATA movida, no por porcentaje", () => {
    const r = movimientosRelevantes([
      mover("MuchoPct", 400, 1000),    // +150%, mueve S/600
      mover("MuchaPlata", 5000, 9000), // +80%,  mueve S/4000
    ], 4);
    expect(r.map((m) => m.name)).toEqual(["MuchaPlata", "MuchoPct"]);
  });

  it("el umbral son S/300 exactos", () => {
    expect(movimientosRelevantes([mover("Justo", 1000, 1300)], 4)).toHaveLength(1);
    expect(movimientosRelevantes([mover("Casi", 1000, 1299)], 4)).toHaveLength(0);
  });

  it("también aplica a las caídas, que llegan con cambio negativo", () => {
    const r = movimientosRelevantes([mover("Cae", 2000, 900), mover("CaePoco", 500, 400)], 4);
    expect(r.map((m) => m.name)).toEqual(["Cae"]);
  });
});
