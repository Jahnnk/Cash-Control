"use server";

/**
 * El portafolio de productos del GRUPO, para el Deck de la reunión.
 *
 * Pedido de Jahnn (24-ago-2026): que el deck exponga el análisis de
 * portafolio por rentabilidad × popularidad, con tendencia y proyección,
 * "para saber qué productos mantener, promocionar, reemplazar".
 *
 * ─── Un solo cerebro ───
 *
 * No hay análisis nuevo acá. Se juntan las ventas de las 3 sedes en un
 * solo portafolio y se pasan por `compilePortfolioIntelligence`, el
 * mismo motor que ya alimenta el Product Intelligence Center de cada
 * sede. Si el deck dijera algo distinto de lo que dice el PIC, la
 * reunión se convertiría en una discusión sobre cuál pantalla tiene
 * razón.
 *
 * ─── Por qué el grupo y no una sede ───
 *
 * La carta se decide para la cadena: un croissant que en Centro es
 * estrella y en Fonavi es perro sigue siendo un solo producto con una
 * sola receta y un solo costo. Sumar unidades y venta da la señal real
 * de qué mantener y qué promocionar.
 *
 * ─── La regla del mes parcial (lección de marzo) ───
 *
 * El mes en curso se alimenta con las subidas semanales, así que a
 * mitad de mes está incompleto. Igual que en `getPortfolioHistory`, las
 * TENDENCIAS y la PROYECCIÓN se calculan solo con meses cerrados: un
 * mes a medias parece un derrumbe. La MATRIZ sí puede usar el mes en
 * curso, porque compara productos entre sí dentro del mismo periodo —
 * eso no se distorsiona por estar a la mitad; y el deck avisa que el
 * mes sigue abierto.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { compilePortfolioIntelligence } from "@/lib/portfolio/intelligence";
import {
  armarFacts, keyDeCarta, estaEliminadoEnByte,
  type FilaVenta, type FilaHistoria,
} from "@/lib/portfolio/facts-sql";
import { computeMovers, projectNextMonth, type MonthSummary } from "@/lib/portfolio/history";
import { construirBoardPortfolio, type BoardPortfolio } from "@/lib/portfolio/board-view";
import { monthLabel } from "@/lib/utils";

const sql = neon(process.env.DATABASE_URL!);

/**
 * Las CAFETERÍAS. Atelier (1) queda fuera a propósito.
 *
 * Atelier es producción B2B: sus "productos" son pedidos mayoristas a
 * clientes, no platos de carta. Mezclarlo rompería la variable de
 * popularidad, que se mide en unidades: un pedido de 200 panes a un
 * cliente aplastaría a todos los cappuccinos del mostrador, y el
 * cuadrante diría que el mostrador no vende. Además su costo unitario
 * es otro — la "Empanada Mixta" de Atelier cuesta S/1.72 (a granel) y
 * la de cafetería S/4.07 (con presentación).
 *
 * Atelier tiene su propio análisis en /atelier/productos, con su
 * lógica de B2B. Misma línea que los reportes semanales: producción y
 * cafetería no se miden con la misma vara.
 */
const SEDES_CARTA = [2, 3];

const mesActualLima = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);

/**
 * Ventas del mes con su costo resuelto, sumando las sedes pedidas.
 *
 * El LATERAL del costo es el mismo de siempre (snapshot más reciente
 * ≤ mes; si no hay, el más antiguo, marcado como aproximado). No
 * duplicar esta consulta: ver el comentario de facts-sql.ts.
 */
async function ventasDelMes(bIds: number[], month: string): Promise<FilaVenta[]> {
  return (await sql`
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
    WHERE s.business_id = ANY(${bIds}) AND s.month = ${month} AND s.source = 'byte'
    ORDER BY s.revenue DESC
  `) as FilaVenta[];
}

async function historiaHasta(bIds: number[], month: string): Promise<FilaHistoria[]> {
  return (await sql`
    SELECT product_id::text AS product_id, product_name_raw, month,
           SUM(units)::float AS units, SUM(revenue)::float AS revenue
    FROM product_month_sales
    WHERE business_id = ANY(${bIds}) AND source = 'byte' AND month <= ${month}
    GROUP BY product_id, product_name_raw, month
    ORDER BY month
  `) as FilaHistoria[];
}

export type BoardPortfolioResult =
  | { ok: true; data: BoardPortfolio }
  | { ok: false; error: string };

/**
 * @param month Mes a analizar (YYYY-MM). Normalmente el del fin del
 *              rango del deck.
 */
export async function getBoardPortfolio(month: string): Promise<BoardPortfolioResult> {
  if (!(await requireFullSession())) {
    return { ok: false, error: "Solo dirección puede ver el portafolio del grupo." };
  }
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Mes inválido." };

  try {
    const mesActual = mesActualLima();
    const mesEnCurso = month >= mesActual;

    const mesesCargados = async () =>
      (await sql`
        SELECT DISTINCT month FROM product_month_sales
        WHERE business_id = ANY(${SEDES_CARTA}) AND source = 'byte' AND month <= ${month}
        ORDER BY month
      `) as { month: string }[];

    const [ventasRaw, historiaRaw, mesesRows] = await Promise.all([
      ventasDelMes(SEDES_CARTA, month),
      historiaHasta(SEDES_CARTA, month),
      mesesCargados(),
    ]);

    // Los productos que Byte marcó como eliminados se sacan UNA vez,
    // acá, y no en cada consumidor: `armarFacts` los filtra por su
    // cuenta, pero la serie de tendencias se arma directo de `historia`
    // y sin esto el "producto que más cayó" salía siendo uno que ya no
    // está en la carta. Una regla aplicada en dos sitios es una regla
    // que tarde o temprano se aplica en uno solo.
    const ventas = ventasRaw.filter((v) => !estaEliminadoEnByte(v.product_name_raw));
    const historia = historiaRaw.filter((h) => !estaEliminadoEnByte(h.product_name_raw));

    const facts = armarFacts({
      scope: { businessId: 0, businessName: "Yayi's · Fonavi + Centro" },
      month,
      ventas,
      historia,
      historyMonths: mesesRows.map((m) => m.month),
      // El mismo plato catalogado "(Fonavi)" y sin sufijo es UNO solo.
      fusionarSedes: true,
    });
    if (!facts) {
      return { ok: false, error: `No hay ventas de productos cargadas para ${monthLabel(month)}.` };
    }

    const intel = compilePortfolioIntelligence(facts);

    // ── Tendencia y proyección: SOLO meses cerrados ──────────────────
    // La lección de marzo: un mes a medias parece un derrumbe. Se
    // construyen desde la historia ya consultada, sin volver a la base.
    const mesesCerrados = mesesRows.map((m) => m.month).filter((m) => m < mesActual);
    const serie = new Map<string, { name: string; points: { month: string; revenue: number }[] }>();
    const porMes = new Map<string, { revenue: number; keys: Set<string> }>();
    const nombrePorKey = new Map<string, string>();
    for (const p of facts.products) nombrePorKey.set(p.key, p.name);

    for (const h of historia) {
      if (!mesesCerrados.includes(h.month)) continue;
      const key = keyDeCarta(null, h.product_name_raw);
      const nombre = nombrePorKey.get(key) ?? h.product_name_raw;
      if (!serie.has(key)) serie.set(key, { name: nombre, points: [] });
      const pts = serie.get(key)!.points;
      const ya = pts.find((x) => x.month === h.month);
      if (ya) ya.revenue += Number(h.revenue) || 0;
      else pts.push({ month: h.month, revenue: Number(h.revenue) || 0 });

      const acc = porMes.get(h.month) ?? { revenue: 0, keys: new Set<string>() };
      acc.revenue += Number(h.revenue) || 0;
      acc.keys.add(key);
      porMes.set(h.month, acc);
    }

    const movers = computeMovers(serie);

    // La serie mensual que alimenta la proyección. La contribución y la
    // salud exactas exigirían recompilar cada mes; acá se usa la venta
    // real y se deja la contribución proporcional a la cobertura del
    // mes analizado — la proyección es de VENTA, que es lo que se
    // muestra en la reunión.
    const cobertura = intel.health.costCoveragePct / 100;
    const resumenMeses: MonthSummary[] = mesesCerrados
      .map((m) => {
        const acc = porMes.get(m);
        if (!acc) return null;
        const revenue = Math.round(acc.revenue * 100) / 100;
        return {
          month: m,
          monthLabel: monthLabel(m),
          revenue,
          contribution: Math.round(revenue * cobertura * 100) / 100,
          costCoveragePct: intel.health.costCoveragePct,
          health: intel.health.total,
          products: acc.keys.size,
        };
      })
      .filter((x): x is MonthSummary => x !== null);

    return {
      ok: true,
      data: construirBoardPortfolio({
        intel,
        mes: month,
        mesLabel: monthLabel(month),
        mesEnCurso,
        movers,
        proyeccion: resumenMeses.length >= 2 ? projectNextMonth(resumenMeses) : null,
      }),
    };
  } catch (err) {
    console.error("[getBoardPortfolio] failed:", err);
    return { ok: false, error: "No pude armar el portafolio del grupo." };
  }
}
