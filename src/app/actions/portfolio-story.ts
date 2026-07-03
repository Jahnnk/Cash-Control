"use server";

/**
 * PIC · Colector de hechos + compilación del PortfolioStory.
 *
 * Convención BKE: SOLO lee las tablas canónicas (product_month_sales +
 * products + product_cost_snapshots). El costo usado es el snapshot más
 * reciente ≤ mes del reporte (el pasado no se reescribe).
 */

import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import { compilePortfolioStory } from "@/lib/portfolio/story-compiler";
import { normalizeProductName } from "@/lib/product-matching";
import type { PortfolioFacts, PortfolioStory, ProductFacts } from "@/lib/portfolio/types";

const sql = neon(process.env.DATABASE_URL!);

const BUSINESS_NAMES: Record<number, string> = {
  1: "Yayi's Atelier",
  2: "Yayi's Fonavi",
  3: "Yayi's Centro",
};

function monthLabel(m: string): string {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
  const s = d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function getPortfolioStory(month: string): Promise<
  | { ok: true; story: PortfolioStory }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { ok: false, error: "Mes inválido." };
  }
  try {
    // Costo: snapshot más reciente ≤ mes; si el mes es ANTERIOR al primer
    // snapshot (historia pre-jul-2026), cae al snapshot más antiguo
    // disponible y se marca como APROXIMADO (no existe historial de
    // costos — se dice, no se esconde).
    const rows = (await sql`
      SELECT s.product_id::text AS product_id,
             s.product_name_raw,
             s.units::float AS units,
             s.revenue::float AS revenue,
             p.name AS catalog_name,
             p.category,
             c.unit_cogs::float AS unit_cogs,
             c.list_price::float AS list_price,
             c.target_margin_pct::float AS target_margin_pct,
             c.month AS cost_month
      FROM product_month_sales s
      LEFT JOIN products p ON p.id = s.product_id
      LEFT JOIN LATERAL (
        SELECT unit_cogs, list_price, target_margin_pct, month
        FROM product_cost_snapshots cs
        WHERE cs.product_id = s.product_id
        ORDER BY (cs.month <= s.month) DESC,
                 (CASE WHEN cs.month <= s.month THEN cs.month END) DESC NULLS LAST,
                 cs.month ASC
        LIMIT 1
      ) c ON true
      WHERE s.business_id = ${bId} AND s.month = ${month} AND s.source = 'byte'
      ORDER BY s.revenue DESC
    `) as Record<string, unknown>[];

    if (rows.length === 0) {
      return { ok: false, error: "No hay ventas por producto cargadas para ese mes. Importa el reporte de Byte primero." };
    }

    // Historia por producto (todos los meses ≤ mes del reporte). La clave
    // une por producto del catálogo o por nombre normalizado (los alias
    // retroactivos van uniendo la historia sola).
    const histRows = (await sql`
      SELECT product_id::text AS product_id, product_name_raw, month,
             SUM(units)::float AS units, SUM(revenue)::float AS revenue
      FROM product_month_sales
      WHERE business_id = ${bId} AND source = 'byte' AND month <= ${month}
      GROUP BY product_id, product_name_raw, month
      ORDER BY month
    `) as Record<string, unknown>[];
    const keyOf = (pid: string | null, raw: string) =>
      pid || `raw:${normalizeProductName(raw)}`;
    const historyByKey = new Map<string, { month: string; units: number; revenue: number }[]>();
    for (const h of histRows) {
      const k = keyOf((h.product_id as string) || null, h.product_name_raw as string);
      if (!historyByKey.has(k)) historyByKey.set(k, []);
      const arr = historyByKey.get(k)!;
      const m = h.month as string;
      const last = arr[arr.length - 1];
      if (last && last.month === m) {
        last.units += Number(h.units) || 0;
        last.revenue = Math.round((last.revenue + (Number(h.revenue) || 0)) * 100) / 100;
      } else {
        arr.push({ month: m, units: Number(h.units) || 0, revenue: Number(h.revenue) || 0 });
      }
    }

    const monthsSet = (await sql`
      SELECT DISTINCT month FROM product_month_sales
      WHERE business_id = ${bId} AND source = 'byte' AND month <= ${month}
      ORDER BY month
    `) as { month: string }[];

    const products: ProductFacts[] = rows.map((r) => {
      const units = Number(r.units) || 0;
      const revenue = Number(r.revenue) || 0;
      const key = keyOf((r.product_id as string) || null, r.product_name_raw as string);
      const costMonth = (r.cost_month as string) || null;
      return {
        productId: (r.product_id as string) || null,
        key,
        name: (r.catalog_name as string) || (r.product_name_raw as string),
        category: (r.category as string) || null,
        units,
        revenue,
        avgPrice: units > 0 ? Math.round((revenue / units) * 100) / 100 : 0,
        unitCogs: r.unit_cogs != null ? Number(r.unit_cogs) : null,
        listPrice: r.list_price != null ? Number(r.list_price) : null,
        targetMarginPct: r.target_margin_pct != null ? Number(r.target_margin_pct) : null,
        costApproximated: costMonth !== null && costMonth > month,
        history: historyByKey.get(key) ?? [{ month, units, revenue }],
      };
    });

    const facts: PortfolioFacts = {
      scope: { businessId: bId, businessName: BUSINESS_NAMES[bId] ?? `Unidad ${bId}` },
      month,
      monthLabel: monthLabel(month),
      generatedAt: new Date().toISOString(),
      products,
      historyMonths: monthsSet.map((h) => h.month),
    };

    return { ok: true, story: compilePortfolioStory(facts) };
  } catch (err) {
    console.error("[getPortfolioStory] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al compilar el análisis" };
  }
}
