/**
 * PIC · Vista histórica del portafolio (lógica PURA).
 *
 * Serie mensual + proyección del próximo mes con tres escenarios
 * derivados de los cambios REALES mes a mes (patrón liquidity.ts):
 * conservador = peor variación reciente, esperado = variación promedio,
 * optimista = mejor variación. Honestidad: la confianza depende de
 * cuánta historia hay y de qué tan estable viene el negocio.
 */

export type MonthSummary = {
  month: string;       // YYYY-MM
  monthLabel: string;
  revenue: number;
  /** Utilidad de contribución de la parte costeada. */
  contribution: number;
  costCoveragePct: number;
  health: number;
  products: number;
};

export type PortfolioProjection = {
  scenarios: { scenario: "conservador" | "esperado" | "optimista"; revenue: number; contribution: number }[];
  confidence: "alta" | "media" | "baja";
  basis: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Proyección del próximo mes a partir de la serie real. null con <3 meses. */
export function projectNextMonth(months: MonthSummary[]): PortfolioProjection | null {
  if (months.length < 3) return null;
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  // Variaciones % mes a mes de la venta (hasta las últimas 3 transiciones).
  const deltas: number[] = [];
  for (let i = Math.max(1, sorted.length - 3); i < sorted.length; i++) {
    const prev = sorted[i - 1].revenue;
    if (prev > 0) deltas.push((sorted[i].revenue - prev) / prev);
  }
  if (deltas.length === 0) return null;
  const last = sorted[sorted.length - 1];
  const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const worst = Math.min(...deltas);
  const best = Math.max(...deltas);
  // Margen de contribución reciente para proyectar utilidad de forma coherente.
  const marginRate = last.revenue > 0 ? last.contribution / last.revenue : 0;

  const mk = (scenario: "conservador" | "esperado" | "optimista", d: number) => ({
    scenario,
    revenue: r2(last.revenue * (1 + d)),
    contribution: r2(last.revenue * (1 + d) * marginRate),
  });

  // Confianza: baja con 3 meses o si el negocio viene volátil (rango de
  // variaciones > 25 puntos); media en el resto. "Alta" requeriría más
  // historia de la que existe — no se regala.
  const spreadPts = (best - worst) * 100;
  const confidence: "alta" | "media" | "baja" =
    months.length <= 3 || spreadPts > 25 ? "baja" : "media";

  return {
    scenarios: [mk("conservador", worst), mk("esperado", avg), mk("optimista", best)],
    confidence,
    basis:
      `variaciones reales de los últimos ${deltas.length + 1} meses ` +
      `(${deltas.map((d) => `${d >= 0 ? "+" : ""}${r1(d * 100)}%`).join(", ")}), ` +
      `aplicadas a la venta de ${last.monthLabel}; utilidad proyectada con el margen reciente (${r1(marginRate * 100)}%)`,
  };
}

export type ProductMover = {
  name: string;
  firstMonth: string;
  lastMonth: string;
  firstRevenue: number;
  lastRevenue: number;
  changePct: number;
};

/**
 * Mayores subidas y caídas comparando la PRIMERA y la ÚLTIMA aparición
 * de cada producto en la serie (mínimo 2 meses y venta relevante).
 */
export function computeMovers(
  series: Map<string, { name: string; points: { month: string; revenue: number }[] }>,
  top = 6,
): { risers: ProductMover[]; fallers: ProductMover[] } {
  const movers: ProductMover[] = [];
  for (const { name, points } of series.values()) {
    if (points.length < 2) continue;
    const sorted = [...points].sort((a, b) => a.month.localeCompare(b.month));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first.revenue < 50 && last.revenue < 50) continue; // ruido
    if (first.revenue <= 0) continue;
    movers.push({
      name,
      firstMonth: first.month,
      lastMonth: last.month,
      firstRevenue: r2(first.revenue),
      lastRevenue: r2(last.revenue),
      changePct: r1(((last.revenue - first.revenue) / first.revenue) * 100),
    });
  }
  const byChange = [...movers].sort((a, b) => b.changePct - a.changePct);
  return {
    risers: byChange.filter((m) => m.changePct >= 15).slice(0, top),
    fallers: byChange.filter((m) => m.changePct <= -15).reverse().slice(0, top),
  };
}

export type ParetoPoint = {
  name: string;
  contribution: number;
  share: number;        // % del total
  cumulativePct: number;
  inTop80: boolean;
};

/**
 * Curva de Pareto sobre la UTILIDAD de contribución (productos costeados).
 * Responde: ¿qué % de productos genera el 80% de la ganancia?
 */
export function computeParetoCurve(
  products: { name: string; contribution: number | null }[],
): { points: ParetoPoint[]; top80Count: number; top80SharePct: number; totalCount: number } {
  const costed = products
    .filter((p) => p.contribution !== null && p.contribution! > 0)
    .sort((a, b) => b.contribution! - a.contribution!);
  const total = costed.reduce((s, p) => s + p.contribution!, 0);
  if (total <= 0 || costed.length === 0) {
    return { points: [], top80Count: 0, top80SharePct: 0, totalCount: 0 };
  }
  let acc = 0;
  let top80Count = 0;
  let reached = false;
  const points: ParetoPoint[] = costed.map((p) => {
    acc += p.contribution!;
    const cumulativePct = r1((acc / total) * 100);
    const inTop80 = !reached;
    if (!reached) {
      top80Count++;
      if (cumulativePct >= 80) reached = true;
    }
    return {
      name: p.name,
      contribution: r2(p.contribution!),
      share: r1((p.contribution! / total) * 100),
      cumulativePct,
      inTop80,
    };
  });
  return {
    points,
    top80Count,
    top80SharePct: r1((top80Count / costed.length) * 100),
    totalCount: costed.length,
  };
}
