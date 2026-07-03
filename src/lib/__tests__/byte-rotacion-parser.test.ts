/**
 * Tests del parser de "Productos con mayor rotación" de Byte, con la
 * estructura REAL observada en el export de junio 2026 (título con rango,
 * header en fila 1, nombres duplicados, fila TOTAL sin nombre).
 */
import { describe, it, expect } from "vitest";
import { parseByteRotacion } from "../byte-rotacion-parser";
import { normalizeProductName, matchSalesToCatalog } from "../product-matching";

const REAL_SHAPE: unknown[][] = [
  ["Platos con mayor rotacion del 2026-06-01 al 2026-06-30", null, null, null, null, null],
  ["Plato", "Precio Unitario (S/)", "Vendido", "Por Cobrar", "Total Vendido (S/)", "Total Por Cobrar (S/)"],
  ["P- CIABATTA", 5.6, 534, 0, 2990.4, 0],
  ["BROWNIE TRIPLE CHOCOLATE", 7.36, 355, 0, 2612.8, 0],
  ["Y-BERLINES", 3, 10, 0, 30, 0],
  ["Y-BERLINES", 3.5, 4, 0, 14, 0], // Byte repite nombres (variantes)
  [null, null, 903, 0, "TOTAL", 5647.2],
];

describe("parseByteRotacion", () => {
  it("parsea la estructura real: mes, items, TOTAL declarado", () => {
    const r = parseByteRotacion(REAL_SHAPE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.month).toBe("2026-06");
    expect(r.periodStart).toBe("2026-06-01");
    expect(r.declaredTotal).toBe(5647.2);
    expect(r.items).toHaveLength(3); // duplicado agregado
  });

  it("suma los nombres duplicados (variantes de Byte) con aviso", () => {
    const r = parseByteRotacion(REAL_SHAPE);
    if (!r.ok) throw new Error("parse failed");
    const berlines = r.items.find((i) => i.name === "Y-BERLINES")!;
    expect(berlines.units).toBe(14);
    expect(berlines.revenue).toBe(44);
    expect(r.warnings.some((w) => w.includes("Y-BERLINES"))).toBe(true);
  });

  it("la suma de filas vs TOTAL de Byte genera aviso si no cuadra", () => {
    const r = parseByteRotacion(REAL_SHAPE);
    if (!r.ok) throw new Error("parse failed");
    // 2990.4 + 2612.8 + 44 = 5647.2 → cuadra exacto, sin aviso de TOTAL
    expect(r.warnings.some((w) => w.includes("no coincide con el TOTAL"))).toBe(false);
    const mal = parseByteRotacion([
      ...REAL_SHAPE.slice(0, 6),
      [null, null, 903, 0, "TOTAL", 9999],
    ]);
    if (!mal.ok) throw new Error("parse failed");
    expect(mal.warnings.some((w) => w.includes("no coincide con el TOTAL"))).toBe(true);
  });

  it("header dinámico: tolera columnas corridas (col A vacía, lección Prompt 19)", () => {
    const shifted = REAL_SHAPE.map((r) => [null, ...r]);
    const r = parseByteRotacion(shifted);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items).toHaveLength(3);
  });

  it("rechaza un rango que cruza dos meses", () => {
    const cross = [["Platos con mayor rotacion del 2026-06-15 al 2026-07-14"], ...REAL_SHAPE.slice(1)];
    const r = parseByteRotacion(cross);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/dos meses/);
  });

  it("avisa si el rango no cubre el mes completo", () => {
    const partial = [["Platos con mayor rotacion del 2026-06-05 al 2026-06-30"], ...REAL_SHAPE.slice(1)];
    const r = parseByteRotacion(partial);
    if (!r.ok) throw new Error("parse failed");
    expect(r.warnings.some((w) => w.includes("mes completo"))).toBe(true);
  });

  it("archivo equivocado → error claro (no crash)", () => {
    const r = parseByteRotacion([["Otro reporte"], ["Fecha", "Monto"], ["2026-06-01", 100]]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/mayor rotación/);
  });
});

describe("normalizeProductName + matching", () => {
  it("normaliza prefijos de línea, tildes y signos", () => {
    expect(normalizeProductName("P- CIABATTA")).toBe("CIABATTA");
    expect(normalizeProductName("Y-EMPANADA MIXTA")).toBe("EMPANADA MIXTA");
    expect(normalizeProductName("P-COOKIE DE AVENA CLÁSICA")).toBe("COOKIE DE AVENA CLASICA");
    expect(normalizeProductName("  Empanada   mixta ")).toBe("EMPANADA MIXTA");
  });

  it("quita el sufijo de sede del pricing-engine y la etiqueta [ELIMINADO] de Byte (casos reales)", () => {
    expect(normalizeProductName("Café Americano (Fonavi)")).toBe("CAFE AMERICANO");
    expect(normalizeProductName("[ELIMINADO 2026-06-24 19:18:31] EMPANADA DE LOMITO")).toBe("EMPANADA DE LOMITO");
  });

  it("matchea Byte vs catálogo por nombre normalizado; lo demás queda sin match", () => {
    const r = matchSalesToCatalog(
      [{ name: "Y-EMPANADA MIXTA" }, { name: "PAVO POR KILO" }],
      [{ id: "u1", name: "Empanada Mixta" }, { id: "u2", name: "Café Americano" }],
    );
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].productId).toBe("u1");
    expect(r.unmatched.map((u) => u.name)).toEqual(["PAVO POR KILO"]);
  });

  it("catálogo con nombres que colisionan al normalizar → ambiguo, NO se matchea", () => {
    const r = matchSalesToCatalog(
      [{ name: "BERLINES" }],
      [{ id: "a", name: "Y-Berlines" }, { id: "b", name: "P-BERLINES" }],
    );
    expect(r.matched).toHaveLength(0);
    expect(r.ambiguous).toContain("BERLINES");
  });
});
