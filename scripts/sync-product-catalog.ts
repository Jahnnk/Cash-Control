/**
 * PIC · Sync de catálogo: pricing-engine → tablas canónicas de Cash Control.
 *
 *   npx tsx scripts/sync-product-catalog.ts [--month 2026-07] [--apply]
 *
 * DRY-RUN por defecto (solo imprime el plan). Con --apply escribe:
 *  - upsert en `products` (por business_id + source + source_ref)
 *  - upsert del snapshot del mes en `product_cost_snapshots`
 *
 * ⚠️ --apply escribe en la BD de PRODUCCIÓN de Cash Control: correr solo
 * con OK explícito de Jahnn. Requiere PRICING_DATABASE_URL en .env.local
 * (solo local, nunca en Vercel — las apps quedan desacopladas).
 *
 * Mapeo de unidades: cafetería pricing 1 "Fonavi" → business 2;
 * cafetería pricing 2 "Centro" → business 3.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import {
  buildCatalogSyncPlan,
  buildAtelierSyncPlan,
  type PricingCafeteriaProduct,
  type PricingAtelierProduct,
  type CanonicalProduct,
} from "../src/lib/product-catalog-sync";

const CAFETERIA_TO_BUSINESS: Record<number, number> = { 1: 2, 2: 3 };
const ATELIER_BUSINESS_ID = 1;

async function main() {
  const apply = process.argv.includes("--apply");
  const monthArg = process.argv[process.argv.indexOf("--month") + 1];
  const month =
    process.argv.includes("--month") && /^\d{4}-\d{2}$/.test(monthArg ?? "")
      ? monthArg
      : new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);

  const pricingUrl = process.env.PRICING_DATABASE_URL;
  if (!pricingUrl) {
    console.error("Falta PRICING_DATABASE_URL en .env.local (URL de la Neon del pricing-engine).");
    process.exit(1);
  }
  const pricing = neon(pricingUrl);
  const cash = neon(process.env.DATABASE_URL!);

  // 1) Leer catálogo crudo del pricing-engine (solo cafeterías).
  const rows = (await pricing`
    SELECT pc.id, pc.sku, pc.nombre, c.nombre AS categoria, pc.cafeteria_id,
           pc.activo, pc.costo_total_cafeteria, pc.precio_publico_final,
           pc.precio_override, pc.precio_publico_calc, pc.margen_cafeteria_pct
    FROM productos_cafeteria pc
    JOIN categorias c ON c.id = pc.categoria_id
  `) as Record<string, unknown>[];

  const raw: PricingCafeteriaProduct[] = rows.map((r) => ({
    id: Number(r.id),
    sku: (r.sku as string) ?? null,
    nombre: r.nombre as string,
    categoria: r.categoria as string,
    cafeteriaId: Number(r.cafeteria_id),
    activo: !!r.activo,
    costoTotalCafeteria: r.costo_total_cafeteria as string | null,
    precioPublicoFinal: r.precio_publico_final as string | null,
    precioOverride: r.precio_override as string | null,
    precioPublicoCalc: r.precio_publico_calc as string | null,
    margenCafeteriaPct: r.margen_cafeteria_pct as string | null,
  }));

  // 1b) Catálogo de Atelier (B2B): costo unitario = cv tanda ÷ rendimiento.
  const rowsAtelier = (await pricing`
    SELECT pa.id, pa.sku, pa.nombre, c.nombre AS categoria, pa.activo,
           pa.cv_insumos, pa.rendimiento_cantidad, pa.unidad_venta,
           pa.precio_override, pa.precio_atelier_facturado, pa.precio_atelier_neto
    FROM productos_atelier pa
    JOIN categorias c ON c.id = pa.categoria_id
    WHERE pa.es_sub_receta = false
  `) as Record<string, unknown>[];
  const rawAtelier: PricingAtelierProduct[] = rowsAtelier.map((r) => ({
    id: Number(r.id),
    sku: (r.sku as string) ?? null,
    nombre: r.nombre as string,
    categoria: r.categoria as string,
    activo: !!r.activo,
    cvInsumos: r.cv_insumos as string | null,
    rendimientoCantidad: r.rendimiento_cantidad as string | null,
    unidadVenta: (r.unidad_venta as string) ?? "und",
    precioOverride: r.precio_override as string | null,
    precioAtelierFacturado: r.precio_atelier_facturado as string | null,
    precioAtelierNeto: r.precio_atelier_neto as string | null,
  }));

  // 2) Normalizar (lógica pura, testeada).
  const planCaf = buildCatalogSyncPlan(raw, CAFETERIA_TO_BUSINESS);
  const planAte = buildAtelierSyncPlan(rawAtelier, ATELIER_BUSINESS_ID);
  const products: CanonicalProduct[] = [...planCaf.products, ...planAte.products];
  const skipped = [...planCaf.skipped, ...planAte.skipped];
  const suspects = planAte.suspects ?? [];

  const byBusiness = new Map<number, number>();
  for (const p of products) byBusiness.set(p.businessId, (byBusiness.get(p.businessId) ?? 0) + 1);

  console.log(`── Plan de sync · snapshot del mes ${month} ──`);
  console.log(`Productos a sincronizar: ${products.length}`);
  for (const [bId, n] of byBusiness) console.log(`  · business ${bId}: ${n} productos`);
  console.log(`Omitidos (calidad de datos): ${skipped.length}`);
  for (const s of skipped.slice(0, 15)) console.log(`  ✗ ${s.name} — ${s.reason}`);
  if (skipped.length > 15) console.log(`  … y ${skipped.length - 15} más`);
  if (suspects.length > 0) {
    console.log(`Sospechosos (se sincronizan igual, revisar receta): ${suspects.length}`);
    for (const s of suspects.slice(0, 10)) console.log(`  ⚠ ${s.name} — ${s.reason}`);
  }

  if (!apply) {
    console.log("\nDRY-RUN: no se escribió nada. Corre con --apply para aplicar.");
    return;
  }

  // 3) Upsert atómico: productos + snapshots del mes, todo o nada.
  let upserts = 0;
  for (const p of products) {
    // Un producto por vez pero dentro de transacción por producto
    // (producto + su snapshot nunca quedan a medias).
    const inserted = (await cash`
      INSERT INTO products (business_id, sku, name, category, active, source, source_ref, updated_at)
      VALUES (${p.businessId}, ${p.sku}, ${p.name}, ${p.category}, ${p.active}, ${p.source}, ${p.sourceRef}, NOW())
      ON CONFLICT (business_id, source, source_ref) DO UPDATE
        SET sku = EXCLUDED.sku, name = EXCLUDED.name, category = EXCLUDED.category,
            active = EXCLUDED.active, updated_at = NOW()
      RETURNING id
    `) as { id: string }[];
    await cash`
      INSERT INTO product_cost_snapshots (product_id, month, unit_cogs, list_price, target_margin_pct, source)
      VALUES (${inserted[0].id}, ${month}, ${p.unitCogs}, ${p.listPrice}, ${p.targetMarginPct}, ${p.source})
      ON CONFLICT (product_id, month) DO UPDATE
        SET unit_cogs = EXCLUDED.unit_cogs, list_price = EXCLUDED.list_price,
            target_margin_pct = EXCLUDED.target_margin_pct, imported_at = NOW()
    `;
    upserts += 1;
  }
  console.log(`\n✓ Aplicado: ${upserts} productos con snapshot ${month}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
