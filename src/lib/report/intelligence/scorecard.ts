/**
 * EIRS · Inteligencia — Scorecard de KPIs.
 * Puro: UnitFacts → KPI[] (valor, semáforo, variación, driver). Sin prosa.
 */

import type { UnitFacts, KPI, Trend } from "../types";

const r2 = (n: number) => Math.round(n * 100) / 100;

function deltaPct(now: number, prev: number | null): number | null {
  if (prev === null || prev === 0) return null;
  return r2(((now - prev) / Math.abs(prev)) * 100);
}

function trendOf(now: number, prev: number | null, tolerance = 0.5): Trend {
  if (prev === null) return "estable";
  const pct = deltaPct(now, prev);
  if (pct === null || Math.abs(pct) <= tolerance) return "estable";
  return pct > 0 ? "sube" : "baja";
}

export function buildScorecard(f: UnitFacts): KPI[] {
  const prev = f.history.length > 0 ? f.history[f.history.length - 1] : null;
  const kpis: KPI[] = [];
  const margin = f.current.sales > 0 ? (f.current.ebitda / f.current.sales) * 100 : null;
  const prevMargin = prev && prev.sales > 0 ? (prev.ebitda / prev.sales) * 100 : null;
  const runwayDays = f.liquidity.avgDailyExpense > 0
    ? (f.liquidity.bankEnd + Math.max(0, f.liquidity.cashEnd)) / f.liquidity.avgDailyExpense
    : null;

  // Ingresos
  const salesDelta = deltaPct(f.current.sales, prev?.sales ?? null);
  kpis.push({
    id: "ingresos", label: "Ingresos", value: r2(f.current.sales), unitSuffix: "S/",
    prev: prev ? r2(prev.sales) : null, deltaPct: salesDelta,
    trend: trendOf(f.current.sales, prev?.sales ?? null),
    traffic: salesDelta === null ? "verde" : salesDelta >= 0 ? "verde" : salesDelta >= -10 ? "ambar" : "rojo",
    driver: prev ? `vs ${prev.month}` : null,
  });

  // EBITDA
  kpis.push({
    id: "ebitda", label: "EBITDA", value: r2(f.current.ebitda), unitSuffix: "S/",
    prev: prev ? r2(prev.ebitda) : null, deltaPct: deltaPct(f.current.ebitda, prev?.ebitda ?? null),
    trend: trendOf(f.current.ebitda, prev?.ebitda ?? null),
    traffic: f.current.ebitda <= 0 ? "rojo" : prev && f.current.ebitda < prev.ebitda ? "ambar" : "verde",
    // Guion ASCII, no "−" (U+2212): jsPDF/helvetica no tiene ese glifo y
    // lo dibuja garabateado (mismo bug que fmtSoles, ver design-system.ts).
    driver: `ventas ${r2(f.current.sales)} - gastos op. ${r2(f.current.opExpenses)}`,
  });

  // Margen EBITDA
  if (margin !== null) {
    kpis.push({
      id: "margen", label: "Margen EBITDA", value: r2(margin), unitSuffix: "%",
      prev: prevMargin !== null ? r2(prevMargin) : null,
      deltaPct: prevMargin !== null ? r2(margin - prevMargin) : null, // puntos, no %
      trend: trendOf(margin, prevMargin),
      traffic: margin >= 15 ? "verde" : margin >= 0 ? "ambar" : "rojo",
      driver: prevMargin !== null ? `variación en puntos vs mes previo` : null,
    });
  }

  // Flujo de caja del mes (variación de liquidez real)
  if (f.liquidity.startOfMonth !== null) {
    const flow = r2(f.liquidity.bankEnd + f.liquidity.cashEnd - f.liquidity.startOfMonth);
    const flowShare = f.liquidity.startOfMonth > 0 ? Math.abs(flow) / f.liquidity.startOfMonth : 0;
    kpis.push({
      id: "flujo", label: "Flujo de caja del mes", value: flow, unitSuffix: "S/",
      prev: null, deltaPct: null, trend: flow > 0.5 ? "sube" : flow < -0.5 ? "baja" : "estable",
      traffic: flow >= 0 ? "verde" : flowShare > 0.25 ? "rojo" : "ambar",
      // "->" ASCII, no "→" (U+2192): mismo bug de glifo faltante en helvetica.
      driver: `liquidez inicio ${r2(f.liquidity.startOfMonth)} -> cierre ${r2(f.liquidity.bankEnd + f.liquidity.cashEnd)}`,
    });
  }

  // Liquidez (cierre)
  const liquid = r2(f.liquidity.bankEnd + f.liquidity.cashEnd);
  kpis.push({
    id: "liquidez", label: "Liquidez (cierre)", value: liquid, unitSuffix: "S/",
    prev: f.liquidity.startOfMonth !== null ? r2(f.liquidity.startOfMonth) : null,
    deltaPct: deltaPct(liquid, f.liquidity.startOfMonth),
    trend: trendOf(liquid, f.liquidity.startOfMonth),
    traffic: runwayDays === null ? "ambar" : runwayDays >= 15 ? "verde" : runwayDays >= 7 ? "ambar" : "rojo",
    driver: runwayDays !== null ? `~${Math.floor(runwayDays)} días de cobertura` : "sin gasto histórico",
  });

  // Banco / Caja (informativos; caja negativa = dato roto)
  kpis.push({
    id: "banco", label: "Banco (cierre)", value: r2(f.liquidity.bankEnd), unitSuffix: "S/",
    prev: null, deltaPct: null, trend: "estable",
    traffic: f.liquidity.bankEnd >= 0 ? "verde" : "rojo", driver: null,
  });
  kpis.push({
    id: "caja", label: "Caja (cierre)", value: r2(f.liquidity.cashEnd), unitSuffix: "S/",
    prev: null, deltaPct: null, trend: "estable",
    traffic: f.liquidity.cashEnd >= 0 ? "verde" : "rojo",
    driver: f.liquidity.cashEnd < 0 ? "caja negativa: error de registro" : null,
  });

  // Presupuesto (si la unidad lo tiene)
  if (f.capabilities.budgets && f.budget.length > 0) {
    const reds = f.budget.filter((b) => b.color === "red").length;
    const yellows = f.budget.filter((b) => b.color === "yellow").length;
    kpis.push({
      id: "presupuesto", label: "Presupuesto", value: f.budget.length - reds - yellows, unitSuffix: "pts",
      prev: null, deltaPct: null, trend: "estable",
      traffic: reds > 0 ? "rojo" : yellows > 0 ? "ambar" : "verde",
      driver: `${f.budget.length - reds - yellows}/${f.budget.length} categorías en verde`,
    });
  }

  // Por cobrar (si la unidad lo tiene)
  if (f.capabilities.receivables && f.receivables) {
    const rc = f.receivables;
    kpis.push({
      id: "por-cobrar", label: "Por cobrar", value: r2(rc.totalPending), unitSuffix: "S/",
      prev: null, deltaPct: null, trend: "estable",
      traffic: rc.overdueAmount === 0 ? "verde" : rc.overdueAmount > rc.totalPending * 0.5 ? "rojo" : "ambar",
      driver: rc.overdueAmount > 0 ? `${r2(rc.overdueAmount)} vencido (${rc.oldestDays} días lo más antiguo)` : "todo en plazo",
    });
  }

  return kpis;
}
