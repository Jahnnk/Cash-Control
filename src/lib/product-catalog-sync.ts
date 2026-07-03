/**
 * PIC · Normalización del catálogo de productos (lógica PURA).
 *
 * Convierte filas crudas del pricing-engine (fuente de verdad de costos,
 * recetas y márgenes) en filas canónicas de Cash Control. Sin BD, sin
 * side-effects: el script de sync la usa y los tests la verifican.
 *
 * Convención BKE (docs/PIC-ARQUITECTURA.md): la normalización ocurre
 * UNA vez, en la frontera; los motores de inteligencia solo leen las
 * tablas canónicas resultantes.
 */

/** Fila cruda de productos_cafeteria del pricing-engine (con categoría resuelta). */
export type PricingCafeteriaProduct = {
  id: number;
  sku: string | null;
  nombre: string;
  categoria: string;
  cafeteriaId: number;
  activo: boolean;
  costoTotalCafeteria: string | number | null;
  precioPublicoFinal: string | number | null;
  precioOverride: string | number | null;
  precioPublicoCalc: string | number | null;
  margenCafeteriaPct: string | number | null;
};

/** Producto canónico listo para upsert en `products` + snapshot de costo. */
export type CanonicalProduct = {
  businessId: number;
  sku: string | null;
  name: string;
  category: string;
  active: boolean;
  source: "pricing-engine";
  sourceRef: string;
  // Snapshot del mes
  unitCogs: number;
  listPrice: number | null;
  targetMarginPct: number | null;
};

export type CatalogSyncPlan = {
  products: CanonicalProduct[];
  /** Filas que NO se sincronizan, con motivo (reporte de calidad de datos). */
  skipped: { name: string; cafeteriaId: number; reason: string }[];
};

const num = (v: string | number | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Precio de lista efectivo, con la misma precedencia del pricing-engine:
 * override manual > precio publicado final > precio calculado.
 */
export function effectiveListPrice(p: PricingCafeteriaProduct): number | null {
  return num(p.precioOverride) ?? num(p.precioPublicoFinal) ?? num(p.precioPublicoCalc);
}

/**
 * Normaliza el catálogo del pricing-engine al contrato canónico.
 *
 * @param rows filas crudas (solo cafeterías)
 * @param cafeteriaToBusiness mapeo id de cafetería (pricing) → business_id
 *        (Cash Control). Ej: {1: 2, 2: 3} = Fonavi→2, Centro→3.
 *
 * Reglas de calidad:
 * - cafetería sin mapeo → skip con motivo (nunca inventar unidad).
 * - producto inactivo → se sincroniza con active=false (histórico intacto).
 * - sin costo (NULL o ≤ 0) → skip con motivo: un producto sin costo
 *   contaminaría todos los márgenes del portafolio.
 */
export function buildCatalogSyncPlan(
  rows: PricingCafeteriaProduct[],
  cafeteriaToBusiness: Record<number, number>,
): CatalogSyncPlan {
  const products: CanonicalProduct[] = [];
  const skipped: CatalogSyncPlan["skipped"] = [];

  for (const r of rows) {
    const businessId = cafeteriaToBusiness[r.cafeteriaId];
    if (!businessId) {
      skipped.push({
        name: r.nombre,
        cafeteriaId: r.cafeteriaId,
        reason: `cafetería ${r.cafeteriaId} sin mapeo a unidad de negocio`,
      });
      continue;
    }
    const cogs = num(r.costoTotalCafeteria);
    if (cogs === null || cogs <= 0) {
      skipped.push({
        name: r.nombre,
        cafeteriaId: r.cafeteriaId,
        reason: "sin costo válido en pricing-engine (contaminaría los márgenes)",
      });
      continue;
    }
    products.push({
      businessId,
      sku: r.sku?.trim() || null,
      name: r.nombre.trim(),
      category: r.categoria.trim(),
      active: r.activo,
      source: "pricing-engine",
      sourceRef: String(r.id),
      unitCogs: cogs,
      listPrice: effectiveListPrice(r),
      targetMarginPct: num(r.margenCafeteriaPct),
    });
  }

  return { products, skipped };
}
