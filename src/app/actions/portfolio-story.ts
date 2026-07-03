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
    const rows = (await sql`
      SELECT s.product_id::text AS product_id,
             s.product_name_raw,
             s.units::float AS units,
             s.revenue::float AS revenue,
             p.name AS catalog_name,
             p.category,
             c.unit_cogs::float AS unit_cogs,
             c.list_price::float AS list_price,
             c.target_margin_pct::float AS target_margin_pct
      FROM product_month_sales s
      LEFT JOIN products p ON p.id = s.product_id
      LEFT JOIN LATERAL (
        SELECT unit_cogs, list_price, target_margin_pct
        FROM product_cost_snapshots cs
        WHERE cs.product_id = s.product_id AND cs.month <= s.month
        ORDER BY cs.month DESC
        LIMIT 1
      ) c ON true
      WHERE s.business_id = ${bId} AND s.month = ${month} AND s.source = 'byte'
      ORDER BY s.revenue DESC
    `) as Record<string, unknown>[];

    if (rows.length === 0) {
      return { ok: false, error: "No hay ventas por producto cargadas para ese mes. Importa el reporte de Byte primero." };
    }

    const history = (await sql`
      SELECT DISTINCT month FROM product_month_sales
      WHERE business_id = ${bId} AND source = 'byte'
      ORDER BY month
    `) as { month: string }[];

    const products: ProductFacts[] = rows.map((r) => {
      const units = Number(r.units) || 0;
      const revenue = Number(r.revenue) || 0;
      return {
        productId: (r.product_id as string) || null,
        key: (r.product_id as string) || `raw:${r.product_name_raw as string}`,
        name: (r.catalog_name as string) || (r.product_name_raw as string),
        category: (r.category as string) || null,
        units,
        revenue,
        avgPrice: units > 0 ? Math.round((revenue / units) * 100) / 100 : 0,
        unitCogs: r.unit_cogs != null ? Number(r.unit_cogs) : null,
        listPrice: r.list_price != null ? Number(r.list_price) : null,
        targetMarginPct: r.target_margin_pct != null ? Number(r.target_margin_pct) : null,
      };
    });

    const facts: PortfolioFacts = {
      scope: { businessId: bId, businessName: BUSINESS_NAMES[bId] ?? `Unidad ${bId}` },
      month,
      monthLabel: monthLabel(month),
      generatedAt: new Date().toISOString(),
      products,
      historyMonths: history.map((h) => h.month),
    };

    return { ok: true, story: compilePortfolioStory(facts) };
  } catch (err) {
    console.error("[getPortfolioStory] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al compilar el análisis" };
  }
}
