/**
 * Tests de la normalización del catálogo PIC (lógica pura).
 * Reglas de calidad: sin costo → skip explícito; cafetería sin mapeo →
 * skip explícito; inactivo → se sincroniza (histórico intacto).
 */
import { describe, it, expect } from "vitest";
import {
  buildCatalogSyncPlan,
  effectiveListPrice,
  type PricingCafeteriaProduct,
} from "../product-catalog-sync";

const MAP = { 1: 2, 2: 3 }; // Fonavi→2, Centro→3

const mk = (over: Partial<PricingCafeteriaProduct>): PricingCafeteriaProduct => ({
  id: 22,
  sku: "PC-CC001",
  nombre: "Café Americano",
  categoria: "Café caliente",
  cafeteriaId: 2,
  activo: true,
  costoTotalCafeteria: "2.6717",
  precioPublicoFinal: "8.00",
  precioOverride: null,
  precioPublicoCalc: "7.50",
  margenCafeteriaPct: "0.6310",
  ...over,
});

describe("buildCatalogSyncPlan", () => {
  it("normaliza un producto real de Centro con costo, precio y margen objetivo", () => {
    const plan = buildCatalogSyncPlan([mk({})], MAP);
    expect(plan.skipped).toHaveLength(0);
    expect(plan.products).toHaveLength(1);
    const p = plan.products[0];
    expect(p.businessId).toBe(3); // Centro
    expect(p.sourceRef).toBe("22");
    expect(p.unitCogs).toBeCloseTo(2.6717, 4);
    expect(p.listPrice).toBe(8);
    expect(p.targetMarginPct).toBeCloseTo(0.631, 4);
  });

  it("mapea Fonavi (cafetería 1) al business 2", () => {
    const plan = buildCatalogSyncPlan([mk({ cafeteriaId: 1 })], MAP);
    expect(plan.products[0].businessId).toBe(2);
  });

  it("omite productos sin costo válido, con motivo auditable", () => {
    const plan = buildCatalogSyncPlan(
      [mk({ costoTotalCafeteria: null }), mk({ id: 2, costoTotalCafeteria: "0" })],
      MAP,
    );
    expect(plan.products).toHaveLength(0);
    expect(plan.skipped).toHaveLength(2);
    expect(plan.skipped[0].reason).toMatch(/sin costo/);
  });

  it("omite cafeterías sin mapeo a unidad (nunca inventa negocio)", () => {
    const plan = buildCatalogSyncPlan([mk({ cafeteriaId: 99 })], MAP);
    expect(plan.products).toHaveLength(0);
    expect(plan.skipped[0].reason).toMatch(/sin mapeo/);
  });

  it("los inactivos SÍ se sincronizan (active=false) para no romper histórico", () => {
    const plan = buildCatalogSyncPlan([mk({ activo: false })], MAP);
    expect(plan.products).toHaveLength(1);
    expect(plan.products[0].active).toBe(false);
  });
});

import { buildAtelierSyncPlan, type PricingAtelierProduct } from "../product-catalog-sync";

const mkAte = (over: Partial<PricingAtelierProduct>): PricingAtelierProduct => ({
  id: 7,
  sku: "PA-007",
  nombre: "Brownie Triple Chocolate",
  categoria: "Brownies / Blondies / Bars",
  activo: true,
  cvInsumos: "22.7281",       // costo de la TANDA (con merma), dato real
  rendimientoCantidad: "12",  // la tanda rinde 12 unidades
  unidadVenta: "und",
  precioOverride: null,
  precioAtelierFacturado: "5.40",
  precioAtelierNeto: "4.89",
  ...over,
});

describe("buildAtelierSyncPlan — costo unitario = tanda ÷ rendimiento", () => {
  it("divide el CV de la tanda entre el rendimiento (caso real del Brownie)", () => {
    const plan = buildAtelierSyncPlan([mkAte({})], 1);
    expect(plan.products).toHaveLength(1);
    const p = plan.products[0];
    expect(p.businessId).toBe(1);
    expect(p.unitCogs).toBeCloseTo(22.7281 / 12, 4); // ≈ S/1.89 la unidad
    expect(p.listPrice).toBe(5.4); // facturado (sin override)
    expect(p.targetMarginPct).toBeNull(); // honesto: no existe para Atelier
    expect(p.sourceRef).toBe("atelier-7");
  });

  it("unidadVenta='kg': el rendimiento está en gramos → costo por kilo", () => {
    const plan = buildAtelierSyncPlan(
      [mkAte({ nombre: "Pavo por kilo", unidadVenta: "kg", cvInsumos: "30", rendimientoCantidad: "2000" })],
      1,
    );
    expect(plan.products[0].unitCogs).toBeCloseTo(15, 4); // 30 ÷ 2kg
  });

  it("rendimiento inválido (≤0) → skip con motivo, nunca costo infinito", () => {
    const plan = buildAtelierSyncPlan([mkAte({ rendimientoCantidad: "0" })], 1);
    expect(plan.products).toHaveLength(0);
    expect(plan.skipped[0].reason).toMatch(/rendimiento/);
  });

  it("costo ≥ precio → se sincroniza IGUAL pero queda como sospechoso", () => {
    const plan = buildAtelierSyncPlan([mkAte({ rendimientoCantidad: "1" })], 1); // 22.73 ≥ 5.40
    expect(plan.products).toHaveLength(1);
    expect(plan.suspects).toHaveLength(1);
    expect(plan.suspects![0].reason).toMatch(/rendimiento mal cargado/);
  });
});

describe("effectiveListPrice — precedencia del pricing-engine", () => {
  it("override manual gana a todo", () => {
    expect(effectiveListPrice(mk({ precioOverride: "9.50" }))).toBe(9.5);
  });
  it("sin override, gana el precio publicado final", () => {
    expect(effectiveListPrice(mk({}))).toBe(8);
  });
  it("sin override ni final, cae al calculado", () => {
    expect(effectiveListPrice(mk({ precioPublicoFinal: null }))).toBe(7.5);
  });
  it("sin ninguno → null (el reporte lo dirá, no lo inventa)", () => {
    expect(
      effectiveListPrice(mk({ precioPublicoFinal: null, precioPublicoCalc: null })),
    ).toBeNull();
  });
});
