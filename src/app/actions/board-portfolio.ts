"use server";

/**
 * El portafolio de productos POR SEDE, para el Deck de la reunión.
 *
 * Pedido de Jahnn (24-ago-2026): que el deck exponga el análisis de
 * portafolio por rentabilidad × popularidad, con tendencia y proyección,
 * "para saber qué productos mantener, promocionar, reemplazar".
 *
 * Corregido el 26-ago-2026, también a pedido suyo: el análisis va POR
 * SEDE — Fonavi, Centro y Atelier por separado — no consolidado.
 *
 * ─── Por qué por sede resultó ser lo correcto ───
 *
 * La primera versión juntaba las cafeterías y dejaba a Atelier fuera,
 * porque su venta B2B a granel (un pedido de 200 panes) aplastaba la
 * variable de popularidad de un mostrador que vende cappuccinos de uno
 * en uno, y porque su costo unitario es otro: la "Empanada Mixta" de
 * Atelier cuesta S/1.72 y la de cafetería S/4.07.
 *
 * Separando por sede ese problema desaparece solo: cada sede se compara
 * CONSIGO MISMA. El umbral de popularidad y el margen promedio se
 * calculan dentro de la sede, así que Atelier se mide contra Atelier y
 * nadie compite contra una escala que no es la suya. Y aparece algo que
 * el consolidado escondía: un plato puede ser estrella en Centro y
 * candidato a reemplazo en Fonavi, y eso es justo lo que hay que
 * discutir en la reunión.
 *
 * ─── Un solo cerebro ───
 *
 * No hay análisis nuevo acá. Cada sede pasa por
 * `compilePortfolioIntelligence`, el mismo motor que alimenta el Product
 * Intelligence Center de esa sede. Si el deck dijera algo distinto de lo
 * que dice el PIC, la reunión se volvería una discusión sobre cuál
 * pantalla tiene razón.
 *
 * ─── La regla del mes parcial (lección de marzo) ───
 *
 * El mes en curso se alimenta con las subidas semanales, así que a
 * mitad de mes está incompleto. Igual que en `getPortfolioHistory`, las
 * TENDENCIAS y la PROYECCIÓN se calculan solo con meses cerrados: un
 * mes a medias parece un derrumbe. La MATRIZ sí usa el mes en curso,
 * porque compara productos entre sí dentro del mismo periodo — eso no
 * se distorsiona por estar a la mitad; y la lámina avisa que sigue
 * abierto.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { compilePortfolioIntelligence } from "@/lib/portfolio/intelligence";
import {
  armarFacts, keyDeProducto, estaEliminadoEnByte,
  type FilaVenta, type FilaHistoria,
} from "@/lib/portfolio/facts-sql";
import { computeMovers, projectNextMonth, type MonthSummary } from "@/lib/portfolio/history";
import { construirBoardPortfolio, type BoardPortfolio } from "@/lib/portfolio/board-view";
import { monthLabel } from "@/lib/utils";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: { id: number; nombre: string }[] = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },   // al final: es producción, no cafetería
];

const mesActualLima = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);

/**
 * Ventas del mes con su costo resuelto.
 *
 * El LATERAL del costo es el mismo de siempre (snapshot más reciente
 * ≤ mes; si no hay, el más antiguo, marcado como aproximado). No
 * duplicar esta consulta: ver el comentario de facts-sql.ts.
 */
async function ventasDelMes(bId: number, month: string): Promise<FilaVenta[]> {
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
    WHERE s.business_id = ${bId} AND s.month = ${month} AND s.source = 'byte'
    ORDER BY s.revenue DESC
  `) as FilaVenta[];
}

async function historiaHasta(bId: number, month: string): Promise<FilaHistoria[]> {
  return (await sql`
    SELECT product_id::text AS product_id, product_name_raw, month,
           SUM(units)::float AS units, SUM(revenue)::float AS revenue
    FROM product_month_sales
    WHERE business_id = ${bId} AND source = 'byte' AND month <= ${month}
    GROUP BY product_id, product_name_raw, month
    ORDER BY month
  `) as FilaHistoria[];
}

async function mesesCargados(bId: number, month: string): Promise<string[]> {
  const rows = (await sql`
    SELECT DISTINCT month FROM product_month_sales
    WHERE business_id = ${bId} AND source = 'byte' AND month <= ${month}
    ORDER BY month
  `) as { month: string }[];
  return rows.map((r) => r.month);
}

/** El portafolio de UNA sede. null = esa sede no tiene ventas del mes. */
async function portafolioDeSede(
  bId: number, month: string, mesActual: string,
): Promise<BoardPortfolio | null> {
  const [ventasRaw, historiaRaw, meses] = await Promise.all([
    ventasDelMes(bId, month),
    historiaHasta(bId, month),
    mesesCargados(bId, month),
  ]);

  // Los productos que Byte marcó como eliminados se sacan UNA vez, acá,
  // y no en cada consumidor: `armarFacts` los filtra por su cuenta, pero
  // la serie de tendencias se arma directo de `historia` y sin esto el
  // "producto que más cayó" salía siendo uno que ya no está en la carta.
  // Una regla aplicada en dos sitios es una regla que tarde o temprano
  // se aplica en uno solo.
  const ventas = ventasRaw.filter((v) => !estaEliminadoEnByte(v.product_name_raw));
  const historia = historiaRaw.filter((h) => !estaEliminadoEnByte(h.product_name_raw));

  const facts = armarFacts({
    scope: { businessId: bId, businessName: `Sede ${bId}` },
    month, ventas, historia, historyMonths: meses,
    // Por sede NO se fusiona: cada producto del catálogo es uno solo.
    fusionarSedes: false,
  });
  if (!facts) return null;

  const intel = compilePortfolioIntelligence(facts);

  // ── Tendencia y proyección: SOLO meses cerrados ────────────────────
  const mesesCerrados = meses.filter((m) => m < mesActual);
  const serie = new Map<string, { name: string; points: { month: string; revenue: number }[] }>();
  const porMes = new Map<string, { revenue: number; keys: Set<string> }>();
  const nombrePorKey = new Map(facts.products.map((p) => [p.key, p.name] as const));

  for (const h of historia) {
    if (!mesesCerrados.includes(h.month)) continue;
    const key = keyDeProducto(h.product_id, h.product_name_raw);
    if (!serie.has(key)) {
      serie.set(key, { name: nombrePorKey.get(key) ?? h.product_name_raw, points: [] });
    }
    const pts = serie.get(key)!.points;
    const ya = pts.find((x) => x.month === h.month);
    if (ya) ya.revenue += Number(h.revenue) || 0;
    else pts.push({ month: h.month, revenue: Number(h.revenue) || 0 });

    const acc = porMes.get(h.month) ?? { revenue: 0, keys: new Set<string>() };
    acc.revenue += Number(h.revenue) || 0;
    acc.keys.add(key);
    porMes.set(h.month, acc);
  }

  // La serie mensual que alimenta la proyección. La contribución exacta
  // exigiría recompilar cada mes; se usa la venta real y la contribución
  // proporcional a la cobertura — lo que se muestra es venta.
  const cobertura = intel.health.costCoveragePct / 100;
  const resumenMeses: MonthSummary[] = mesesCerrados
    .map((m) => {
      const acc = porMes.get(m);
      if (!acc) return null;
      const revenue = Math.round(acc.revenue * 100) / 100;
      return {
        month: m, monthLabel: monthLabel(m), revenue,
        contribution: Math.round(revenue * cobertura * 100) / 100,
        costCoveragePct: intel.health.costCoveragePct,
        health: intel.health.total,
        products: acc.keys.size,
      };
    })
    .filter((x): x is MonthSummary => x !== null);

  return construirBoardPortfolio({
    intel,
    mes: month,
    mesLabel: monthLabel(month),
    mesEnCurso: month >= mesActual,
    movers: computeMovers(serie),
    proyeccion: resumenMeses.length >= 2 ? projectNextMonth(resumenMeses) : null,
  });
}

export type PortafolioSede = {
  businessId: number;
  sede: string;
  portafolio: BoardPortfolio;
};

export type BoardPortfolioResult =
  | { ok: true; sedes: PortafolioSede[] }
  | { ok: false; error: string };

/**
 * @param month Mes a analizar (YYYY-MM). Normalmente el del fin del
 *              rango del deck.
 */
export async function getBoardPortfolio(month: string): Promise<BoardPortfolioResult> {
  if (!(await requireFullSession())) {
    return { ok: false, error: "Solo dirección puede ver el portafolio." };
  }
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Mes inválido." };

  try {
    const mesActual = mesActualLima();
    const resultados = await Promise.all(
      SEDES.map(async (s) => ({
        businessId: s.id,
        sede: s.nombre,
        portafolio: await portafolioDeSede(s.id, month, mesActual),
      })),
    );

    // Una sede sin ventas cargadas no genera lámina: mejor que no exista
    // a que salga en blanco ocupando un turno de la reunión.
    const sedes = resultados.filter(
      (r): r is PortafolioSede => r.portafolio !== null,
    );
    if (sedes.length === 0) {
      return { ok: false, error: `No hay ventas de productos cargadas para ${monthLabel(month)}.` };
    }
    return { ok: true, sedes };
  } catch (err) {
    console.error("[getBoardPortfolio] failed:", err);
    return { ok: false, error: "No pude armar el portafolio de productos." };
  }
}
