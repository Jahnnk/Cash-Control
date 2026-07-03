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
  /** Sincronizados pero sospechosos (ej. costo ≥ precio): visibles, no ocultos. */
  suspects?: { name: string; reason: string }[];
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

/** Fila cruda de productos_atelier del pricing-engine (con categoría resuelta). */
export type PricingAtelierProduct = {
  id: number;
  sku: string | null;
  nombre: string;
  categoria: string;
  activo: boolean;
  /** Costo de la TANDA completa, CON merma de preparación ya aplicada
   *  (así lo cachea el motor: cvTotalConMerma). */
  cvInsumos: string | number | null;
  /** Unidades que rinde la receta; si unidadVenta='kg' está en GRAMOS. */
  rendimientoCantidad: string | number | null;
  unidadVenta: string; // 'und' | 'kg'
  precioOverride: string | number | null;
  precioAtelierFacturado: string | number | null;
  precioAtelierNeto: string | number | null;
};

/**
 * Normaliza el catálogo de ATELIER al contrato canónico.
 *
 * Costo unitario = cv_insumos (tanda, con merma) ÷ rendimiento.
 * Con unidadVenta='kg' el rendimiento está en gramos → se convierte a kg
 * (las ventas de Byte de Atelier por peso van en kilos).
 * Precio de lista: override > facturado > neto. Sin margen objetivo
 * (el pricing-engine no lo modela para Atelier — se deja null, honesto).
 *
 * Productos con costo ≥ precio NO se ocultan: se sincronizan y se
 * reportan como sospechosos (puede ser margen negativo real o un
 * rendimiento mal cargado en la receta — decide el dueño).
 */
export function buildAtelierSyncPlan(
  rows: PricingAtelierProduct[],
  businessId: number,
): CatalogSyncPlan {
  const products: CanonicalProduct[] = [];
  const skipped: CatalogSyncPlan["skipped"] = [];
  const suspects: { name: string; reason: string }[] = [];

  for (const r of rows) {
    const cvTanda = num(r.cvInsumos);
    if (cvTanda === null || cvTanda <= 0) {
      skipped.push({ name: r.nombre, cafeteriaId: 0, reason: "sin costo válido en pricing-engine" });
      continue;
    }
    const rend = num(r.rendimientoCantidad);
    if (rend === null || rend <= 0) {
      skipped.push({ name: r.nombre, cafeteriaId: 0, reason: "rendimiento inválido (≤0): imposible costear la unidad" });
      continue;
    }
    const rendVenta = r.unidadVenta === "kg" ? rend / 1000 : rend;
    const unitCogs = Math.round((cvTanda / rendVenta) * 10000) / 10000;
    const listPrice =
      num(r.precioOverride) ?? num(r.precioAtelierFacturado) ?? num(r.precioAtelierNeto);
    if (listPrice !== null && unitCogs >= listPrice) {
      suspects.push({
        name: r.nombre,
        reason: `costo unitario S/${unitCogs.toFixed(2)} ≥ precio S/${listPrice.toFixed(2)} (¿margen negativo real o rendimiento mal cargado?)`,
      });
    }
    products.push({
      businessId,
      sku: r.sku?.trim() || null,
      name: r.nombre.trim(),
      category: r.categoria.trim(),
      active: r.activo,
      source: "pricing-engine",
      sourceRef: `atelier-${r.id}`,
      unitCogs,
      listPrice,
      targetMarginPct: null,
    });
  }

  return { products, skipped, suspects };
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
