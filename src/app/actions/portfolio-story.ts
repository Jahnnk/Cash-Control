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
import { requireFullSession } from "@/lib/session-access";
import { compilePortfolioStory } from "@/lib/portfolio/story-compiler";
import { compilePortfolioIntelligence } from "@/lib/portfolio/intelligence";
import { normalizeProductName } from "@/lib/product-matching";
import { monthLabel } from "@/lib/utils";
import {
  projectNextMonth,
  computeMovers,
  type MonthSummary,
  type PortfolioProjection,
  type ProductMover,
} from "@/lib/portfolio/history";
import type { PortfolioFacts, PortfolioStory, ProductFacts } from "@/lib/portfolio/types";

const sql = neon(process.env.DATABASE_URL!);

const BUSINESS_NAMES: Record<number, string> = {
  1: "Yayi's Atelier",
  2: "Yayi's Fonavi",
  3: "Yayi's Centro",
};

/** Colector interno reutilizable (getPortfolioStory y la vista histórica). */
async function collectFacts(bId: number, month: string): Promise<PortfolioFacts | null> {
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

    if (rows.length === 0) return null;

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

    return {
      scope: { businessId: bId, businessName: BUSINESS_NAMES[bId] ?? `Unidad ${bId}` },
      month,
      monthLabel: monthLabel(month),
      generatedAt: new Date().toISOString(),
      products,
      historyMonths: monthsSet.map((h) => h.month),
    };
}

export async function getPortfolioStory(month: string): Promise<
  | { ok: true; story: PortfolioStory }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  return storyFor(bId, month);
}

/**
 * Mismo análisis con sede EXPLÍCITA, para Grupo → Productos (solo
 * dirección). Lección /grupo: nada de activeBusinessId() ahí.
 */
export async function getPortfolioStoryForSede(
  sede: number,
  month: string,
): Promise<
  | { ok: true; story: PortfolioStory }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) {
    return { ok: false, error: "Solo para la dirección." };
  }
  if (sede !== 1 && sede !== 2 && sede !== 3) {
    return { ok: false, error: "Sede inválida." };
  }
  return storyFor(sede, month);
}

async function storyFor(
  bId: number,
  month: string,
): Promise<
  | { ok: true; story: PortfolioStory }
  | { ok: false; error: string }
> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { ok: false, error: "Mes inválido." };
  }
  try {
    const facts = await collectFacts(bId, month);
    if (!facts) {
      return { ok: false, error: "No hay ventas por producto cargadas para ese mes. Importa el reporte de Byte primero." };
    }
    return { ok: true, story: compilePortfolioStory(facts) };
  } catch (err) {
    console.error("[getPortfolioStory] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al compilar el análisis" };
  }
}

export type PortfolioHistoryResult =
  | {
      ok: true;
      months: MonthSummary[];
      projection: PortfolioProjection | null;
      risers: ProductMover[];
      fallers: ProductMover[];
    }
  | { ok: false; error: string };

/**
 * Vista histórica: compila la inteligencia de CADA mes cargado (mismo
 * cerebro, sin lógica duplicada) y arma serie, movers y proyección.
 */
export async function getPortfolioHistory(): Promise<PortfolioHistoryResult> {
  const bId = await activeBusinessId();
  try {
    // Regla del MES PARCIAL: el mes en curso (alimentado semanalmente
    // desde el Panel de Sede) se EXCLUYE de tendencias, movers y
    // proyecciones — un mes a medias parecería un derrumbe y dañaría el
    // análisis (la lección de marzo). Entra solo cuando termina.
    const currentMonth = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
    const monthsRows = (await sql`
      SELECT DISTINCT month FROM product_month_sales
      WHERE business_id = ${bId} AND source = 'byte' AND month < ${currentMonth}
      ORDER BY month
    `) as { month: string }[];
    if (monthsRows.length === 0) {
      return { ok: false, error: "Aún no hay meses completos cargados (el mes en curso entra al histórico cuando termina)." };
    }

    // Los meses son independientes entre sí → se consultan en paralelo
    // (antes era secuencial y la espera crecía con cada mes cargado).
    // El procesamiento posterior sí es en orden para que las series
    // queden cronológicas.
    const factsByMonth = await Promise.all(
      monthsRows.map(({ month }) => collectFacts(bId, month)),
    );

    const summaries: MonthSummary[] = [];
    const series = new Map<string, { name: string; points: { month: string; revenue: number }[] }>();
    for (let i = 0; i < monthsRows.length; i++) {
      const month = monthsRows[i].month;
      const facts = factsByMonth[i];
      if (!facts) continue;
      const intel = compilePortfolioIntelligence(facts);
      summaries.push({
        month,
        monthLabel: monthLabel(month),
        revenue: Math.round(facts.products.reduce((s, p) => s + p.revenue, 0) * 100) / 100,
        contribution: Math.round(intel.products.reduce((s, p) => s + (p.contribution ?? 0), 0) * 100) / 100,
        costCoveragePct: intel.health.costCoveragePct,
        health: intel.health.total,
        products: facts.products.length,
      });
      for (const p of facts.products) {
        if (!series.has(p.key)) series.set(p.key, { name: p.name, points: [] });
        series.get(p.key)!.points.push({ month, revenue: p.revenue });
      }
    }

    const { risers, fallers } = computeMovers(series);
    return { ok: true, months: summaries, projection: projectNextMonth(summaries), risers, fallers };
  } catch (err) {
    console.error("[getPortfolioHistory] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al armar el histórico" };
  }
}
