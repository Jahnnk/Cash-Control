/**
 * PIC · Motor de inteligencia del portafolio (Fase 1 — lógica PURA).
 *
 * Pipeline anti-contradicción (docs/PIC-ARQUITECTURA.md):
 *   métricas base (una vez) → metodologías emiten SEÑALES y
 *   clasificaciones → síntesis = UN Veredicto Estratégico por producto →
 *   recomendaciones ≤5 → Health Score auditable.
 *
 * Honestidad estructural:
 * - Producto sin costo → no entra al Menu Engineering ni a márgenes;
 *   veredicto "observar" con el motivo; su venta SÍ cuenta en ABC y
 *   concentración (la venta es real aunque el costo no se conozca).
 * - Metodologías que requieren historia (BCG interna, crecimiento,
 *   tendencias) se declaran INACTIVAS con motivo — Fase 2, con 3 meses.
 * - Componentes del Health Score sin datos → null (gris) y el score se
 *   re-pondera sobre lo medible.
 */

import type {
  PortfolioFacts,
  PortfolioIntelligence,
  ProductIntel,
  Signal,
  HealthComponent,
  PortfolioHealth,
  Recommendation,
  MenuEngQuadrant,
  AbcClass,
  Verdict,
  DataQuality,
} from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const fmt = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

// ═════════════════════════════════════════════════════════════════
// MÉTRICAS BASE — se calculan UNA vez; todas las metodologías las leen.
// ═════════════════════════════════════════════════════════════════

type BaseMetrics = Omit<
  ProductIntel,
  "abcClass" | "menuEng" | "menuEngReason" | "verdict" | "verdictReason" | "drivers"
>;

export function computeBaseMetrics(f: PortfolioFacts): BaseMetrics[] {
  const totalRevenue = f.products.reduce((s, p) => s + p.revenue, 0) || 1;
  return f.products
    .map((p) => {
      const hasCost = p.unitCogs !== null && p.unitCogs > 0;
      const unitContribution = hasCost ? r2(p.avgPrice - p.unitCogs!) : null;
      const contribution = hasCost ? r2((p.avgPrice - p.unitCogs!) * p.units) : null;
      const marginPct = hasCost && p.revenue > 0 ? r1(((p.avgPrice - p.unitCogs!) / p.avgPrice) * 100) : null;
      return {
        key: p.key,
        productId: p.productId,
        name: p.name,
        category: p.category,
        units: p.units,
        revenue: p.revenue,
        avgPrice: p.avgPrice,
        revenueShare: r1((p.revenue / totalRevenue) * 100),
        hasCost,
        unitCogs: p.unitCogs,
        unitContribution,
        contribution,
        marginPct,
        targetMarginPct: p.targetMarginPct,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ═════════════════════════════════════════════════════════════════
// METODOLOGÍA · ABC (Pareto sobre la VENTA — incluye sin-costo)
// ═════════════════════════════════════════════════════════════════

export function classifyAbc(metrics: BaseMetrics[]): Map<string, AbcClass> {
  const sorted = [...metrics].sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((s, p) => s + p.revenue, 0) || 1;
  const out = new Map<string, AbcClass>();
  let acc = 0;
  for (const p of sorted) {
    acc += p.revenue;
    out.set(p.key, acc / total <= 0.8 ? "A" : acc / total <= 0.95 ? "B" : "C");
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════
// METODOLOGÍA · Menu Engineering (Kasavana-Smith, solo costeados)
// Popularidad: cuota de unidades ≥ 70% de la cuota promedio (1/N).
// Margen: contribución unitaria ≥ contribución unitaria promedio ponderada.
// ═════════════════════════════════════════════════════════════════

export function classifyMenuEng(
  metrics: BaseMetrics[],
): { quadrants: Map<string, { q: MenuEngQuadrant; reason: string }>; avgUnitContribution: number | null } {
  const costed = metrics.filter((m) => m.hasCost && m.units > 0);
  const quadrants = new Map<string, { q: MenuEngQuadrant; reason: string }>();
  if (costed.length < 3) return { quadrants, avgUnitContribution: null }; // muestra insuficiente

  const totalUnits = costed.reduce((s, m) => s + m.units, 0);
  const totalContribution = costed.reduce((s, m) => s + m.contribution!, 0);
  const avgUnitContribution = totalContribution / totalUnits;
  const popularityThreshold = (1 / costed.length) * 0.7; // regla clásica 70%

  for (const m of costed) {
    const unitShare = m.units / totalUnits;
    const popular = unitShare >= popularityThreshold;
    const profitable = m.unitContribution! >= avgUnitContribution;
    const q: MenuEngQuadrant = popular
      ? profitable ? "star" : "plow_horse"
      : profitable ? "puzzle" : "dog";
    quadrants.set(m.key, {
      q,
      reason:
        `${popular ? "popular" : "poca rotación"} (${(unitShare * 100).toFixed(1)}% de unidades vs umbral ${(popularityThreshold * 100).toFixed(1)}%) · ` +
        `contribución S/${m.unitContribution!.toFixed(2)}/und vs promedio S/${avgUnitContribution.toFixed(2)}`,
    });
  }
  return { quadrants, avgUnitContribution: r2(avgUnitContribution) };
}

// ═════════════════════════════════════════════════════════════════
// SEÑALES (las metodologías hablan aquí — nunca directo al usuario)
// ═════════════════════════════════════════════════════════════════

export function emitSignals(
  metrics: BaseMetrics[],
  abc: Map<string, AbcClass>,
  me: Map<string, { q: MenuEngQuadrant; reason: string }>,
): Signal[] {
  const signals: Signal[] = [];
  const totalRevenue = metrics.reduce((s, m) => s + m.revenue, 0) || 1;

  // — Concentración (portafolio) —
  const sorted = [...metrics].sort((a, b) => b.revenue - a.revenue);
  const top3Share = (sorted.slice(0, 3).reduce((s, m) => s + m.revenue, 0) / totalRevenue) * 100;
  if (top3Share >= 45) {
    signals.push({
      id: "sig-concentracion",
      methodology: "concentracion",
      productKey: null,
      kind: top3Share >= 60 ? "riesgo" : "vigilar",
      impact: r2((top3Share / 100) * totalRevenue * 0.1),
      metric: "Venta concentrada en el top-3 de productos",
      valueNow: r1(top3Share),
      valueRef: 45,
      valueUnit: "%",
      source: `concentracion: top3=${sorted.slice(0, 3).map((m) => m.name).join(", ")}`,
      confidence: "alta",
    });
  }

  for (const m of metrics) {
    const quad = me.get(m.key)?.q ?? null;

    // — Precio: popular con margen bajo el objetivo (solo con objetivo real) —
    if (quad === "plow_horse" && m.targetMarginPct !== null && m.marginPct !== null) {
      const targetPct = m.targetMarginPct * 100;
      if (m.marginPct < targetPct - 5) {
        const priceForTarget = m.unitCogs! / (1 - m.targetMarginPct);
        const upliftMonthly = r2((priceForTarget - m.avgPrice) * m.units);
        if (upliftMonthly > 20) {
          signals.push({
            id: `sig-precio-${m.key}`,
            methodology: "precio",
            productKey: m.key,
            kind: "oportunidad",
            impact: upliftMonthly,
            metric: `${m.name}: margen real vs objetivo`,
            valueNow: m.marginPct,
            valueRef: r1(targetPct),
            valueUnit: "%",
            source: `precio: llevarlo al margen objetivo (S/${priceForTarget.toFixed(2)}) × ${m.units} und/mes`,
            confidence: "media", // asume que el volumen no cae — el simulador (Fase 2) mostrará escenarios
          });
        }
      }
    }

    // — Puzzles: margen alto, rotación baja → potencial si rota como el promedio —
    if (quad === "puzzle") {
      const costed = metrics.filter((x) => x.hasCost && x.units > 0);
      const medianUnits = [...costed].sort((a, b) => a.units - b.units)[Math.floor(costed.length / 2)].units;
      const upside = r2(Math.max(0, medianUnits - m.units) * m.unitContribution! * 0.5); // conservador: 50%
      if (upside > 30) {
        signals.push({
          id: `sig-impulsar-${m.key}`,
          methodology: "menu-engineering",
          productKey: m.key,
          kind: "oportunidad",
          impact: upside,
          metric: `${m.name}: alta contribución con poca rotación`,
          valueNow: m.units,
          valueRef: medianUnits,
          valueUnit: "und",
          source: `menu-engineering: puzzle; si rotara como la mediana (${medianUnits} und), +50% conservador`,
          confidence: "media",
        });
      }
    }

    // — Dogs de cola: candidatos a revisión estratégica —
    if (quad === "dog" && abc.get(m.key) === "C") {
      signals.push({
        id: `sig-revisar-${m.key}`,
        methodology: "menu-engineering",
        productKey: m.key,
        kind: "vigilar",
        impact: r2(Math.abs(m.contribution ?? 0)),
        metric: `${m.name}: baja rotación y baja contribución`,
        valueNow: m.units,
        valueRef: null,
        valueUnit: "und",
        source: "menu-engineering: dog + clase C (Pareto)",
        confidence: "alta",
      });
    }

    // — Estrellas clase A: lo que sostiene el negocio —
    if (quad === "star" && abc.get(m.key) === "A") {
      signals.push({
        id: `sig-estrella-${m.key}`,
        methodology: "menu-engineering",
        productKey: m.key,
        kind: "fortaleza",
        impact: m.contribution ?? 0,
        metric: `${m.name}: estrella del portafolio`,
        valueNow: m.contribution ?? 0,
        valueRef: null,
        valueUnit: "S/",
        source: "menu-engineering: star + clase A",
        confidence: "alta",
      });
    }

    // — Calidad de datos: venta grande sin costo —
    if (!m.hasCost && m.revenueShare >= 2) {
      signals.push({
        id: `sig-sincosto-${m.key}`,
        methodology: "calidad-datos",
        productKey: m.key,
        kind: "urgente",
        impact: r2(m.revenue * 0.3), // proxy: ~30% de su venta es margen no gestionado
        metric: `${m.name}: vende fuerte sin costo conocido`,
        valueNow: m.revenue,
        valueRef: null,
        valueUnit: "S/",
        source: "calidad-datos: sin receta en pricing-engine o sin alias de catálogo",
        confidence: "alta",
      });
    }
  }

  return signals.sort((a, b) => b.impact - a.impact);
}

// ═════════════════════════════════════════════════════════════════
// SÍNTESIS · UN Veredicto Estratégico por producto (reglas en orden)
// ═════════════════════════════════════════════════════════════════

export function synthesizeVerdicts(
  metrics: BaseMetrics[],
  abc: Map<string, AbcClass>,
  me: Map<string, { q: MenuEngQuadrant; reason: string }>,
  signals: Signal[],
): ProductIntel[] {
  return metrics.map((m) => {
    const quad = me.get(m.key)?.q ?? null;
    const cls = abc.get(m.key) ?? "C";
    const mySignals = signals.filter((s) => s.productKey === m.key).map((s) => s.id);

    let verdict: Verdict;
    let reason: string;
    if (!m.hasCost) {
      verdict = "observar";
      reason = `Vende ${fmt(m.revenue)}/mes pero no conocemos su costo — completar receta o alias antes de decidir.`;
    } else if (signals.some((s) => s.id === `sig-precio-${m.key}`)) {
      verdict = "ajustar_precio";
      reason = `Popular pero con margen ${m.marginPct}% bajo su objetivo ${r1((m.targetMarginPct ?? 0) * 100)}% — hay plata sobre la mesa.`;
    } else if (quad === "star") {
      verdict = "proteger";
      reason = `Estrella: popular y rentable (${m.marginPct}% de margen, ${fmt(m.contribution!)} de utilidad/mes). No tocar precio; cuidar calidad y visibilidad.`;
    } else if (quad === "puzzle") {
      verdict = "impulsar";
      reason = `Margen alto (${m.marginPct}%) con poca rotación (${m.units} und/mes) — candidato a visibilidad, marketing o combos.`;
    } else if (quad === "plow_horse") {
      verdict = "ajustar_precio";
      reason = `Muy vendido (${m.units} und/mes) pero deja poco por unidad (S/${m.unitContribution!.toFixed(2)}) — revisar precio o costo de receta.`;
    } else if (quad === "dog" && cls !== "C") {
      verdict = "experimentar";
      reason = `Aporta venta (clase ${cls}) pero con mala contribución relativa — reposicionar antes que retirar.`;
    } else if (quad === "dog") {
      verdict = "revisar";
      reason = `Baja rotación y baja contribución (clase C). Candidato a revisión estratégica — puede quedarse por imagen, experiencia o cross-selling: lo decides tú.`;
    } else {
      verdict = "observar";
      reason = `Sin señal fuerte este mes (clase ${cls}).`;
    }

    return {
      ...m,
      abcClass: cls,
      menuEng: quad,
      menuEngReason: me.get(m.key)?.reason ?? null,
      verdict,
      verdictReason: reason,
      drivers: mySignals,
    };
  });
}

// ═════════════════════════════════════════════════════════════════
// HEALTH SCORE (componentes auditables; sin datos → gris y re-pondera)
// ═════════════════════════════════════════════════════════════════

export function computeHealth(products: ProductIntel[], historyMonths: string[]): PortfolioHealth {
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0) || 1;
  const costed = products.filter((p) => p.hasCost);
  const costedRevenue = costed.reduce((s, p) => s + p.revenue, 0);
  const costCoveragePct = r1((costedRevenue / totalRevenue) * 100);
  const totalContribution = costed.reduce((s, p) => s + (p.contribution ?? 0), 0);

  const components: HealthComponent[] = [];

  // 1) Rentabilidad (25): margen ponderado vs 60% (estándar del rubro que
  //    usa el pricing-engine con sus multiplicadores) o vs objetivo real.
  const weightedMargin = costedRevenue > 0 ? (totalContribution / costedRevenue) * 100 : null;
  components.push({
    id: "rentabilidad",
    label: "Rentabilidad",
    weight: 25,
    score: weightedMargin === null ? null : clamp((weightedMargin / 60) * 100),
    formula:
      weightedMargin === null
        ? "sin productos costeados"
        : `margen de contribución ponderado ${r1(weightedMargin)}% ÷ 60% saludable (estándar del pricing-engine) × 100`,
    unavailableReason: weightedMargin === null ? "ningún producto con costo este mes" : null,
  });

  // 2) Concentración (20): % de venta del top-3 (≤35% sano, ≥70% crítico).
  const sorted = [...products].sort((a, b) => b.revenue - a.revenue);
  const top3 = (sorted.slice(0, 3).reduce((s, p) => s + p.revenue, 0) / totalRevenue) * 100;
  components.push({
    id: "concentracion",
    label: "Diversificación",
    weight: 20,
    score: clamp(100 - ((top3 - 35) / 35) * 100),
    formula: `top-3 concentra ${r1(top3)}% de la venta; 35% = 100 pts, 70% = 0 pts (lineal)`,
    unavailableReason: null,
  });

  // 3) Balance del menú (20): % de la utilidad en cuadrantes populares
  //    (stars + plow horses) — la carta "trabaja" si lo popular contribuye.
  const meProducts = products.filter((p) => p.menuEng !== null);
  let balanceScore: number | null = null;
  let balanceFormula = "requiere ≥3 productos costeados con venta";
  if (meProducts.length >= 3 && totalContribution > 0) {
    const healthyShare =
      (meProducts
        .filter((p) => p.menuEng === "star" || p.menuEng === "plow_horse")
        .reduce((s, p) => s + (p.contribution ?? 0), 0) /
        totalContribution) * 100;
    balanceScore = clamp((healthyShare / 70) * 100);
    balanceFormula = `${r1(healthyShare)}% de la utilidad viene de productos populares (stars + plow horses); 70% = 100 pts`;
  }
  components.push({
    id: "balance",
    label: "Balance del menú",
    weight: 20,
    score: balanceScore,
    formula: balanceFormula,
    unavailableReason: balanceScore === null ? "muestra costeada insuficiente" : null,
  });

  // 4) Cola improductiva (10): % de productos que aportan <0.5% de venta.
  const cola = products.filter((p) => p.revenueShare < 0.5).length;
  const colaPct = (cola / (products.length || 1)) * 100;
  components.push({
    id: "cola",
    label: "Cola improductiva",
    weight: 10,
    score: clamp(100 - ((colaPct - 20) / 40) * 100),
    formula: `${cola} de ${products.length} productos (${r1(colaPct)}%) aportan <0.5% de la venta c/u; 20% = 100 pts, 60% = 0 pts`,
    unavailableReason: null,
  });

  // 5) Crecimiento (15) y 6) Vitalidad (10): requieren historia — Fase 2.
  const needHistory = historyMonths.length >= 3 ? null : `se activa con 3 meses de historia (hay ${historyMonths.length})`;
  components.push({
    id: "crecimiento", label: "Crecimiento", weight: 15, score: null,
    formula: "% de la utilidad en productos con demanda creciente (3m)",
    unavailableReason: needHistory ?? "pendiente Fase 2",
  });
  components.push({
    id: "vitalidad", label: "Vitalidad", weight: 10, score: null,
    formula: "% de la utilidad de productos introducidos en ≤6 meses",
    unavailableReason: needHistory ?? "pendiente Fase 2",
  });

  // Re-ponderación sobre lo medible.
  const measurable = components.filter((c) => c.score !== null);
  const weightSum = measurable.reduce((s, c) => s + c.weight, 0) || 1;
  const total = Math.round(measurable.reduce((s, c) => s + (c.score! * c.weight) / weightSum, 0));
  const level = total >= 75 ? "saludable" : total >= 55 ? "estable" : total >= 35 ? "fragil" : "critico";

  return { total, level, components, costCoveragePct };
}

// ═════════════════════════════════════════════════════════════════
// RECOMENDACIONES (≤5, por impacto; consumen SEÑALES, no metodologías)
// ═════════════════════════════════════════════════════════════════

export function buildRecommendations(products: ProductIntel[], signals: Signal[]): Recommendation[] {
  const recs: Recommendation[] = [];

  // 1) Ajustes de precio cuantificados (suma de señales de precio).
  const priceSignals = signals.filter((s) => s.methodology === "precio");
  if (priceSignals.length > 0) {
    const total = r2(priceSignals.reduce((s, x) => s + x.impact, 0));
    const names = priceSignals.slice(0, 3).map((s) => s.metric.split(":")[0]);
    recs.push({
      id: "rec-precios",
      action: `Revisar el precio de ${names.join(", ")}${priceSignals.length > 3 ? ` y ${priceSignals.length - 3} más` : ""}`,
      why: "Productos populares vendiendo bajo su margen objetivo — el volumen ya está, falta el precio.",
      expectedBenefit: total,
      inactionCost: `${fmt(total)} de margen no capturado cada mes`,
      priority: 0, timeframe: "este mes", confidence: "media",
      sourceSignalIds: priceSignals.map((s) => s.id),
    });
  }

  // 2) Costear la venta sin costo (calidad de datos = decisiones a ciegas).
  const uncosted = signals.filter((s) => s.methodology === "calidad-datos");
  if (uncosted.length > 0) {
    const revenue = r2(uncosted.reduce((s, x) => s + x.valueNow, 0));
    recs.push({
      id: "rec-costear",
      action: `Costear en el pricing-engine los ${uncosted.length} productos grandes sin receta`,
      why: `${fmt(revenue)}/mes de venta sin costo conocido: no podemos gestionar el margen de lo que no medimos.`,
      expectedBenefit: r2(revenue * 0.05),
      inactionCost: "el análisis de margen seguirá ciego en esa parte de la carta",
      priority: 0, timeframe: "esta semana", confidence: "alta",
      sourceSignalIds: uncosted.map((s) => s.id),
    });
  }

  // 3) Impulsar puzzles (visibilidad/combos).
  const pushSignals = signals.filter((s) => s.id.startsWith("sig-impulsar-"));
  if (pushSignals.length > 0) {
    const total = r2(pushSignals.reduce((s, x) => s + x.impact, 0));
    const names = pushSignals.slice(0, 3).map((s) => s.metric.split(":")[0]);
    recs.push({
      id: "rec-impulsar",
      action: `Dar visibilidad (carta/vitrina/combos) a ${names.join(", ")}`,
      why: "Margen alto con poca rotación: cada unidad extra deja más que el promedio del menú.",
      expectedBenefit: total,
      inactionCost: `~${fmt(total)}/mes de utilidad potencial dormida`,
      priority: 0, timeframe: "este mes", confidence: "media",
      sourceSignalIds: pushSignals.map((s) => s.id),
    });
  }

  // 4) Revisión estratégica de la cola (dogs clase C).
  const dogs = products.filter((p) => p.verdict === "revisar");
  if (dogs.length >= 3) {
    recs.push({
      id: "rec-revisar",
      action: `Revisar estratégicamente ${dogs.length} productos de baja rotación y baja contribución`,
      why: "Simplificar la carta reduce mermas y carga operativa; conservar solo los que cumplen un rol (imagen, experiencia, cross-selling).",
      expectedBenefit: r2(dogs.reduce((s, d) => s + Math.max(0, -(d.contribution ?? 0)), 0) + dogs.length * 15),
      inactionCost: "complejidad operativa y vitrina ocupada por productos que no trabajan",
      priority: 0, timeframe: "trimestre", confidence: "baja",
      sourceSignalIds: dogs.flatMap((d) => d.drivers),
    });
  }

  // 5) Riesgo de concentración (si existe).
  const conc = signals.find((s) => s.id === "sig-concentracion");
  if (conc) {
    recs.push({
      id: "rec-concentracion",
      action: "Desarrollar la segunda línea de productos para bajar la dependencia del top-3",
      why: `El ${conc.valueNow}% de la venta depende de 3 productos: un tropiezo de uno golpea todo el mes.`,
      expectedBenefit: conc.impact,
      inactionCost: "fragilidad ante quiebre de stock, alza de insumo o cambio de gusto",
      priority: 0, timeframe: "trimestre", confidence: "media",
      sourceSignalIds: [conc.id],
    });
  }

  return recs
    .sort((a, b) => b.expectedBenefit - a.expectedBenefit)
    .slice(0, 5)
    .map((r, i) => ({ ...r, priority: i + 1 }));
}

// ═════════════════════════════════════════════════════════════════
// COMPILADOR de la capa de inteligencia
// ═════════════════════════════════════════════════════════════════

export function compilePortfolioIntelligence(f: PortfolioFacts): PortfolioIntelligence {
  const metrics = computeBaseMetrics(f);
  const abc = classifyAbc(metrics);
  const { quadrants: me } = classifyMenuEng(metrics);
  const signals = emitSignals(metrics, abc, me);
  const products = synthesizeVerdicts(metrics, abc, me, signals);
  const health = computeHealth(products, f.historyMonths);
  const recommendations = buildRecommendations(products, signals);

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0) || 1;
  const sorted = [...products].sort((a, b) => b.revenue - a.revenue);
  const top1Share = r1((sorted[0]?.revenue ?? 0) / totalRevenue * 100);
  const top3Share = r1(sorted.slice(0, 3).reduce((s, p) => s + p.revenue, 0) / totalRevenue * 100);
  const byCategory = new Map<string, number>();
  for (const p of products) {
    if (p.category) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + p.revenue);
  }
  const topCat = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  const abcCounts = { A: 0, B: 0, C: 0 } as Record<AbcClass, number>;
  for (const p of products) abcCounts[p.abcClass] += 1;
  const aRevenueShare = r1(products.filter((p) => p.abcClass === "A").reduce((s, p) => s + p.revenue, 0) / totalRevenue * 100);

  const meCounts = { star: 0, plow_horse: 0, puzzle: 0, dog: 0 } as Record<MenuEngQuadrant, number>;
  for (const p of products) if (p.menuEng) meCounts[p.menuEng] += 1;
  const totalContribution = products.reduce((s, p) => s + (p.contribution ?? 0), 0);
  const healthyContributionShare =
    totalContribution > 0
      ? r1(products.filter((p) => p.menuEng === "star" || p.menuEng === "plow_horse").reduce((s, p) => s + (p.contribution ?? 0), 0) / totalContribution * 100)
      : null;

  const uncostedProducts = products.filter((p) => !p.hasCost);
  const dataQuality: DataQuality = {
    costCoveragePct: health.costCoveragePct,
    productsWithCost: products.length - uncostedProducts.length,
    productsTotal: products.length,
    topUncosted: uncostedProducts.slice(0, 8).map((p) => ({ name: p.name, revenue: p.revenue })),
    uncostedRevenue: r2(uncostedProducts.reduce((s, p) => s + p.revenue, 0)),
  };

  // Board: decisiones = top-3 recomendaciones; preguntas para socios.
  const boardDecisions = recommendations.slice(0, 3).map((r, i) => ({
    id: `dec-${i + 1}`,
    decision: r.action,
    impact: r.expectedBenefit,
    sourceRecommendationId: r.id,
  }));
  const boardQuestions: PortfolioIntelligence["boardQuestions"] = [];
  const priceRec = recommendations.find((r) => r.id === "rec-precios");
  if (priceRec) {
    boardQuestions.push({
      id: "q-precios",
      question: "¿Aprobamos la revisión de precios de los productos populares bajo su margen objetivo?",
      context: `Impacto estimado ${fmt(priceRec.expectedBenefit)}/mes; el simulador de la Fase 2 mostrará escenarios de volumen.`,
    });
  }
  const dogsCount = products.filter((p) => p.verdict === "revisar").length;
  if (dogsCount > 0) {
    boardQuestions.push({
      id: "q-revision",
      question: `¿Cuáles de los ${dogsCount} candidatos a revisión estratégica cumplen un rol de imagen/experiencia y se quedan?`,
      context: "Esa información vive en el dueño, no en los datos — el sistema no recomienda eliminar por vender poco.",
    });
  }
  if (dataQuality.costCoveragePct < 80) {
    boardQuestions.push({
      id: "q-datos",
      question: "¿Quién y cuándo costea las recetas faltantes en el pricing-engine?",
      context: `Cobertura de costos ${dataQuality.costCoveragePct}% de la venta — el análisis de margen está ciego en el resto.`,
    });
  }

  return {
    products,
    signals,
    health,
    recommendations,
    concentration: {
      top1Share,
      top3Share,
      topCategory: topCat ? { name: topCat[0], share: r1((topCat[1] / totalRevenue) * 100) } : null,
      severity: top3Share >= 60 ? "alta" : top3Share >= 45 ? "media" : "baja",
    },
    abcSummary: { aCount: abcCounts.A, bCount: abcCounts.B, cCount: abcCounts.C, aRevenueShare },
    menuEngSummary: { stars: meCounts.star, plowHorses: meCounts.plow_horse, puzzles: meCounts.puzzle, dogs: meCounts.dog, healthyContributionShare },
    dataQuality,
    boardDecisions,
    boardQuestions: boardQuestions.slice(0, 3),
    inactiveMethodologies:
      f.historyMonths.length >= 3
        ? []
        : [
            { id: "bcg-interna", reason: `requiere 3 meses de historia (hay ${f.historyMonths.length}) — Fase 2` },
            { id: "crecimiento", reason: `requiere 3 meses de historia (hay ${f.historyMonths.length}) — Fase 2` },
          ],
  };
}
