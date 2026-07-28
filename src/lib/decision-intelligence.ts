/**
 * Motor de Decision Intelligence del Centro de Comando.
 *
 * Función pura: recibe los HECHOS del negocio (BusinessFacts, que arma la
 * server action command-center.ts con las queries canónicas) y produce:
 *   - Business Health Score 0–100 (liquidez, rentabilidad, crecimiento,
 *     cobranza, ejecución presupuestal), con desglose.
 *   - Insights priorizados por impacto en soles: qué cambió, por qué,
 *     impacto esperado y acción concreta recomendada (con link).
 *   - Executive Brief en lenguaje natural: estado del negocio, los 3 temas
 *     del día y las oportunidades.
 *
 * TODO ES DE REGLAS AUDITABLES: cada frase sale de un cálculo rastreable.
 * Nada de cajas negras — si un número sorprende, se puede seguir su origen.
 */

// ─────────────────────────────────────────────────────────────────
// Tipos de entrada (hechos)
// ─────────────────────────────────────────────────────────────────

export type CategoryTrend = {
  category: string;
  /** Gasto operativo del mes al corte (porción del negocio). */
  monthToDate: number;
  /** Gasto esperado al corte según el promedio diario de las 8 semanas previas al mes. */
  expectedToDate: number;
  /** Promedio diario de esas 8 semanas (para proyectar). */
  dailyAvg8w: number;
  /** Los movimientos del mes que más pesan en la categoría (top 3). */
  topMovements: { concept: string; amount: number; date: string }[];
};

export type BudgetStatus = {
  category: string;
  /** Presupuesto del mes en soles (según % del ingreso del mes). */
  budgetSoles: number;
  spent: number;
  color: "green" | "yellow" | "red";
};

import type { MonthComparison } from "@/lib/kpis/month-compare";

/**
 * Base ÚNICA para "vs el mes pasado". Con `comparison` (dashboard en
 * vivo) usa los días emparejados —los que tienen dato en AMBOS meses—
 * porque comparar 24 días contra 27 mentía. Sin él (reporte EIRS de un
 * mes ya CERRADO, donde ambos lados están completos) usa los totales,
 * que ahí sí son comparables.
 */
function growthBase(f: BusinessFacts): {
  current: number; previous: number; pct: number | null; daysCompared: number; paired: boolean;
} {
  const sd = f.sales.comparison?.sameDay;
  if (sd) {
    return { current: sd.current, previous: sd.previous, pct: sd.pct, daysCompared: sd.daysCompared, paired: true };
  }
  const prev = f.sales.prevMonthSameCut;
  return {
    current: f.sales.monthToDate,
    previous: prev,
    pct: prev > 0 ? ((f.sales.monthToDate - prev) / prev) * 100 : null,
    daysCompared: f.daysElapsed,
    paired: false,
  };
}

export type BusinessFacts = {
  businessName: string;
  today: string;         // YYYY-MM-DD (Lima)
  daysElapsed: number;   // día del mes al corte (>=1)
  daysInMonth: number;
  bank: {
    balance: number;
    hasDiscrepancy: boolean;
    discrepancyAmount: number | null; // registrado − esperado (puede ser negativo)
  };
  cash: number;
  sales: {
    monthToDate: number;
    prevMonthSameCut: number;
    /** Comparativo EMPAREJADO (solo días con dato en ambos meses) —
     * la única base honesta para el % vs el mes pasado. */
    comparison?: MonthComparison | null;
  };
  /** Gastos OPERATIVOS (porción del negocio, sin categorías excluidas del EBITDA). */
  opExpenses: { monthToDate: number; prevMonthSameCut: number };
  /** Promedio diario de gasto operativo de las últimas 8 semanas. */
  avgDailyExpense8w: number;
  receivables: {
    totalPending: number;
    overdueAmount: number;   // pendiente con más de OVERDUE_DAYS días
    overdueCount: number;
    oldestDays: number;
    byDebtor: { name: string; pending: number }[];
  };
  partnerLoanPending: number;
  budgets: BudgetStatus[];   // solo categorías con semáforo activo
  categoryTrends: CategoryTrend[];
};

// ─────────────────────────────────────────────────────────────────
// Tipos de salida
// ─────────────────────────────────────────────────────────────────

export type HealthComponent = {
  key: "liquidez" | "rentabilidad" | "crecimiento" | "cobranza" | "presupuesto";
  label: string;
  score: number;      // 0–100
  weight: number;     // fracción del total
  detail: string;     // explicación corta del puntaje
  /** Fórmula auditable: el dato de entrada y la escala que produjo el puntaje. */
  formula: string;
};

export type HealthScore = {
  total: number;      // 0–100
  level: "sano" | "estable" | "atencion" | "critico";
  levelLabel: string;
  components: HealthComponent[];
};

export type InsightSeverity = "critico" | "aviso" | "info" | "oportunidad";

export type Insight = {
  id: string;
  severity: InsightSeverity;
  /** Impacto estimado en soles (para priorizar). Siempre >= 0. */
  impact: number;
  title: string;
  /** Qué cambió (hecho). */
  what: string;
  /** Por qué / de dónde viene (atribución). */
  why: string | null;
  /** Impacto esperado si continúa (proyección simple). */
  consequence: string | null;
  /** Acción concreta recomendada. */
  action: { label: string; href: string } | null;
  /** Beneficio esperado de actuar (cuantificado cuando se puede). */
  benefit: string | null;
  /** Costo de NO actuar. */
  inactionCost: string | null;
};

export type Recommendation = {
  label: string;
  href: string | null; // null = consejo de conducta (ej. "evita gastos extraordinarios")
  /** Beneficio esperado de ejecutarla (cuantificado cuando se puede). */
  benefit: string | null;
  /** Costo de no actuar. */
  inactionCost: string | null;
};

export type ExecutiveBrief = {
  headline: string;      // una frase: el estado del negocio
  summary: string;       // 2-3 oraciones de contexto con números
  topIssues: Insight[];  // los 3 temas del día (criticos/avisos)
  opportunities: Insight[]; // hasta 2
  /** "Hoy te recomiendo": hasta 3 acciones concretas derivadas de los insights. */
  recommendations: Recommendation[];
  /** Por qué la primera recomendación es la #1 (criterio de priorización, auditable). */
  topActionReason: string | null;
};

export type CommandCenterIntel = {
  health: HealthScore;
  insights: Insight[];   // TODOS, ordenados por severidad e impacto
  brief: ExecutiveBrief;
};

// ─────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────

/** Días de cuenta por cobrar tras los cuales se considera vencida. */
export const OVERDUE_DAYS = 15;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Formato S/ para las frases del brief (es-PE). */
export function fmtS(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}S/${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Interpola un puntaje 0-100 sobre puntos de quiebre (x ascendente). */
function scoreByBreakpoints(x: number, points: [number, number][]): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

// ─────────────────────────────────────────────────────────────────
// 1. Business Health Score
// ─────────────────────────────────────────────────────────────────

export function computeHealthScore(f: BusinessFacts): HealthScore {
  const components: HealthComponent[] = [];

  // Liquidez (25%): días de cobertura = (banco + caja) / gasto diario 8w.
  const liquid = f.bank.balance + Math.max(0, f.cash);
  const coverageDays = f.avgDailyExpense8w > 0 ? liquid / f.avgDailyExpense8w : 90;
  const liquidezScore = scoreByBreakpoints(coverageDays, [
    [3, 10], [7, 35], [15, 60], [30, 85], [45, 100],
  ]);
  components.push({
    key: "liquidez", label: "Liquidez", weight: 0.25, score: Math.round(liquidezScore),
    detail: f.avgDailyExpense8w > 0
      ? `Cubres ~${Math.floor(coverageDays)} días de gasto operativo con lo que tienes (banco + caja).`
      : "Sin gasto histórico suficiente para medir cobertura.",
    formula: f.avgDailyExpense8w > 0
      ? `(${fmtS(f.bank.balance)} banco + ${fmtS(Math.max(0, f.cash))} caja) ÷ ${fmtS(f.avgDailyExpense8w)}/día = ${coverageDays.toFixed(1)} días → escala: 3d=10 · 7d=35 · 15d=60 · 30d=85 · 45d=100`
      : "Sin gasto histórico: puntaje por defecto.",
  });

  // Rentabilidad (25%): margen EBITDA aproximado del mes al corte.
  const ebitda = f.sales.monthToDate - f.opExpenses.monthToDate;
  const margin = f.sales.monthToDate > 0 ? (ebitda / f.sales.monthToDate) * 100 : (ebitda >= 0 ? 0 : -100);
  const rentScore = scoreByBreakpoints(margin, [
    [-15, 0], [0, 40], [10, 75], [20, 100],
  ]);
  components.push({
    key: "rentabilidad", label: "Rentabilidad", weight: 0.25, score: Math.round(rentScore),
    detail: f.sales.monthToDate > 0
      ? `Margen operativo del mes al corte: ${margin.toFixed(1)}% (${fmtS(ebitda)}).`
      : "Aún sin ventas registradas este mes.",
    formula: f.sales.monthToDate > 0
      ? `(${fmtS(f.sales.monthToDate)} ventas − ${fmtS(f.opExpenses.monthToDate)} gastos op.) ÷ ventas = ${margin.toFixed(1)}% → escala: −15%=0 · 0%=40 · 10%=75 · 20%=100`
      : "Sin ventas del mes: puntaje según signo del resultado.",
  });

  // Crecimiento (15%): ventas vs mes anterior al MISMO día (comparación justa).
  // Los días 1–2 del mes son ruido (aún no se registran las ventas del día
  // anterior): puntaje neutral para no alarmar en falso.
  // MISMA base emparejada que la alerta: días con dato en ambos meses.
  const gcmp = growthBase(f);
  const gPct = gcmp.pct;
  const tooEarly = f.daysElapsed < 3 || gcmp.daysCompared < 3;
  const growthPct: number = gPct !== null ? gPct : (f.sales.monthToDate > 0 ? 15 : 0);
  const growthScore = tooEarly
    ? 60
    : scoreByBreakpoints(growthPct, [
        [-25, 0], [-10, 30], [0, 60], [15, 100],
      ]);
  components.push({
    key: "crecimiento", label: "Crecimiento", weight: 0.15, score: Math.round(growthScore),
    detail: tooEarly
      ? "Muy temprano en el mes (pocos días comparables): puntaje neutral."
      : gPct !== null
        ? `Ventas ${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}% vs el mes pasado (${gcmp.daysCompared} días${gcmp.paired ? " con dato en ambos" : ""}).`
        : "Sin mes anterior comparable.",
    formula: tooEarly
      ? "Día 1–2 del mes o menos de 3 días comparables: puntaje neutral (60) para no alarmar en falso."
      : gPct !== null
        ? `(${fmtS(gcmp.current)} − ${fmtS(gcmp.previous)}) ÷ ${fmtS(gcmp.previous)} = ${growthPct.toFixed(1)}% sobre ${gcmp.daysCompared} días${gcmp.paired ? " emparejados" : ""} → escala: −25%=0 · −10%=30 · 0%=60 · +15%=100`
        : "Sin base de comparación: puntaje neutral.",
  });

  // Cobranza (15%): proporción vencida y antigüedad.
  let cobranzaScore = 100;
  let cobranzaDetail = "Sin cuentas por cobrar vencidas.";
  if (f.receivables.totalPending > 0) {
    const overdueShare = f.receivables.overdueAmount / f.receivables.totalPending;
    const shareScore = scoreByBreakpoints(overdueShare * 100, [[0, 100], [25, 75], [50, 45], [100, 15]]);
    const ageScore = scoreByBreakpoints(f.receivables.oldestDays, [[OVERDUE_DAYS, 100], [30, 60], [60, 20], [90, 0]]);
    cobranzaScore = Math.min(shareScore, ageScore);
    cobranzaDetail = f.receivables.overdueAmount > 0
      ? `${fmtS(f.receivables.overdueAmount)} vencido (>${OVERDUE_DAYS} días); lo más antiguo lleva ${f.receivables.oldestDays} días.`
      : `${fmtS(f.receivables.totalPending)} por cobrar, todo dentro de plazo.`;
  }
  components.push({
    key: "cobranza", label: "Cobranza", weight: 0.15, score: Math.round(cobranzaScore),
    detail: cobranzaDetail,
    formula: f.receivables.totalPending > 0
      ? `mín(puntaje %vencido [${((f.receivables.overdueAmount / f.receivables.totalPending) * 100).toFixed(0)}% → 0%=100 · 25%=75 · 50%=45], puntaje antigüedad [${f.receivables.oldestDays}d → ${OVERDUE_DAYS}d=100 · 30d=60 · 60d=20])`
      : "Sin cuentas por cobrar → 100.",
  });

  // Ejecución presupuestal (20%): semáforos del presupuesto.
  let presupuestoScore = 70; // neutral si no hay presupuesto configurado
  let presupuestoDetail = "Sin presupuesto con semáforo configurado.";
  if (f.budgets.length > 0) {
    const reds = f.budgets.filter((b) => b.color === "red").length;
    const yellows = f.budgets.filter((b) => b.color === "yellow").length;
    presupuestoScore = clamp(100 - reds * 30 - yellows * 10, 0, 100);
    presupuestoDetail =
      reds + yellows === 0
        ? `Las ${f.budgets.length} categorías presupuestadas están en verde.`
        : `${reds} categoría(s) en rojo y ${yellows} en amarillo de ${f.budgets.length} presupuestadas.`;
  }
  components.push({
    key: "presupuesto", label: "Presupuesto", weight: 0.2, score: Math.round(presupuestoScore),
    detail: presupuestoDetail,
    formula: f.budgets.length > 0
      ? `100 − rojas×30 − amarillas×10 = 100 − ${f.budgets.filter((b) => b.color === "red").length}×30 − ${f.budgets.filter((b) => b.color === "yellow").length}×10`
      : "Sin presupuesto configurado: puntaje neutral (70).",
  });

  const total = Math.round(components.reduce((s, c) => s + c.score * c.weight, 0));
  const level = total >= 80 ? "sano" : total >= 60 ? "estable" : total >= 40 ? "atencion" : "critico";
  const levelLabel =
    level === "sano" ? "Negocio sano"
    : level === "estable" ? "Estable, con avisos"
    : level === "atencion" ? "Requiere atención"
    : "Estado crítico";

  return { total, level, levelLabel, components };
}

// ─────────────────────────────────────────────────────────────────
// 2. Insights (qué cambió → por qué → impacto → acción)
// ─────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critico: 0, aviso: 1, info: 2, oportunidad: 3,
};

export function buildInsights(f: BusinessFacts): Insight[] {
  const out: Insight[] = [];
  const ebitda = f.sales.monthToDate - f.opExpenses.monthToDate;
  const projSales = f.daysElapsed > 0 ? (f.sales.monthToDate / f.daysElapsed) * f.daysInMonth : 0;

  // — Descuadre con el banco (dato en el que se apoya todo lo demás)
  if (f.bank.hasDiscrepancy && f.bank.discrepancyAmount !== null && Math.abs(f.bank.discrepancyAmount) >= 5) {
    const d = f.bank.discrepancyAmount;
    out.push({
      id: "descuadre-banco",
      severity: "critico",
      impact: Math.abs(d),
      title: `Descuadre con el banco de ${fmtS(Math.abs(d))}`,
      what: `El saldo del sistema difiere del banco real en ${fmtS(d)}.`,
      why: d > 0
        ? "Suele ser un ingreso registrado de más o un egreso que falta registrar."
        : "Suele ser un ingreso que falta registrar o un egreso duplicado.",
      consequence: "Mientras no cuadre, las demás cifras del tablero heredan este error.",
      action: { label: "Investigar el cuadre", href: "reportes?tab=conciliacion" },
      benefit: `Recuperas confianza total en tus cifras (hoy hay ${fmtS(Math.abs(d))} sin explicar).`,
      inactionCost: "Cierras el mes con información financiera inconsistente y cada decisión hereda el error.",
    });
  }

  // — Caja efectivo negativa (imposible físicamente → error de registro)
  if (f.cash < -0.01) {
    out.push({
      id: "caja-negativa",
      severity: "critico",
      impact: Math.abs(f.cash),
      title: `Caja en efectivo negativa (${fmtS(f.cash)})`,
      what: "El sistema calcula menos que cero en la caja física — eso es imposible en la realidad.",
      why: "Casi siempre: se registró un egreso en efectivo sin su ingreso, o se borró un ingreso que financiaba gastos.",
      consequence: "El saldo de efectivo del tablero no es confiable hasta corregirlo.",
      action: { label: "Revisar movimientos en efectivo", href: "registro" },
      benefit: "La caja vuelve a reflejar la realidad y el resto del tablero deja de arrastrar el error.",
      inactionCost: `Sigues decidiendo con una caja irreal (${fmtS(f.cash)} es físicamente imposible).`,
    });
  }

  // — EBITDA negativo al corte
  if (f.sales.monthToDate > 0 && ebitda < 0) {
    out.push({
      id: "ebitda-negativo",
      severity: "critico",
      impact: Math.abs(ebitda),
      title: `El mes va en pérdida operativa: ${fmtS(ebitda)}`,
      what: `Al día ${f.daysElapsed}, los gastos operativos (${fmtS(f.opExpenses.monthToDate)}) superan las ventas (${fmtS(f.sales.monthToDate)}).`,
      why: null,
      consequence: projSales > 0
        ? `Si el ritmo sigue igual, el mes cerraría en ~${fmtS((ebitda / f.daysElapsed) * f.daysInMonth)}.`
        : null,
      action: { label: "Ver estado de resultados", href: "reportes" },
      benefit: "Identificar hoy qué gasto recortar puede voltear el resultado antes del cierre.",
      inactionCost: `El mes cierra en pérdida (~${fmtS((ebitda / Math.max(1, f.daysElapsed)) * f.daysInMonth)} al ritmo actual).`,
    });
  }

  // — Cobertura de caja corta
  const liquid = f.bank.balance + Math.max(0, f.cash);
  if (f.avgDailyExpense8w > 0) {
    const days = liquid / f.avgDailyExpense8w;
    if (days < 15) {
      out.push({
        id: "cobertura-corta",
        severity: days < 7 ? "critico" : "aviso",
        impact: f.avgDailyExpense8w * (15 - days),
        title: `Liquidez para ~${Math.floor(days)} días`,
        what: `Entre banco (${fmtS(f.bank.balance)}) y caja (${fmtS(Math.max(0, f.cash))}) cubres ~${Math.floor(days)} días de gasto operativo.`,
        why: `Tu gasto operativo promedia ${fmtS(f.avgDailyExpense8w)}/día (últimas 8 semanas).`,
        consequence: "Por debajo de 15 días, un imprevisto o una semana floja de cobros te aprieta.",
        action: f.receivables.totalPending > 0
          ? { label: `Cobrar ${fmtS(f.receivables.totalPending)} pendientes`, href: "fonavi" }
          : { label: "Revisar gastos del mes", href: "reportes" },
        benefit: f.receivables.totalPending > 0 && f.avgDailyExpense8w > 0
          ? `Cobrar los pendientes suma ${fmtS(f.receivables.totalPending)} (~${(f.receivables.totalPending / f.avgDailyExpense8w).toFixed(1)} días más de cobertura).`
          : "Cada gasto evitado hoy extiende directamente tu cobertura.",
        inactionCost: `Al ritmo actual (${fmtS(f.avgDailyExpense8w)}/día) la caja se agota en ~${Math.floor(days)} días si no entran ventas.`,
      });
    }
  }

  // — Cuentas por cobrar vencidas
  if (f.receivables.overdueAmount > 0) {
    const worst = f.receivables.byDebtor.slice().sort((a, b) => b.pending - a.pending)[0];
    out.push({
      id: "cxc-vencidas",
      severity: f.receivables.overdueAmount >= 500 ? "aviso" : "info",
      impact: f.receivables.overdueAmount,
      title: `${fmtS(f.receivables.overdueAmount)} por cobrar vencidos`,
      what: `${f.receivables.overdueCount} cuenta(s) llevan más de ${OVERDUE_DAYS} días sin cobrarse; la más antigua, ${f.receivables.oldestDays} días.`,
      why: worst ? `El mayor deudor es ${worst.name} (${fmtS(worst.pending)} pendientes en total).` : null,
      consequence: "Es plata tuya financiando a otro local sin fecha de retorno.",
      action: { label: "Ir a Por cobrar", href: "fonavi" },
      benefit: f.avgDailyExpense8w > 0
        ? `Cobrarlas hoy sube tu liquidez ${fmtS(f.receivables.overdueAmount)} (~${(f.receivables.overdueAmount / f.avgDailyExpense8w).toFixed(1)} días de cobertura).`
        : `Cobrarlas hoy sube tu liquidez ${fmtS(f.receivables.overdueAmount)}.`,
      inactionCost: "La deuda envejece y cada semana es más difícil de cobrar y de conciliar.",
    });
  }

  // — Presupuesto en rojo
  for (const b of f.budgets.filter((x) => x.color === "red")) {
    const over = Math.max(0, b.spent - b.budgetSoles);
    out.push({
      id: `presupuesto-${b.category}`,
      severity: "aviso",
      impact: over > 0 ? over : b.spent * 0.1,
      title: `${b.category} en rojo vs presupuesto`,
      what: over > 0
        ? `Ya gastaste ${fmtS(b.spent)} — ${fmtS(over)} por encima del presupuesto del mes (${fmtS(b.budgetSoles)}).`
        : `${b.category} está al límite del presupuesto del mes (${fmtS(b.budgetSoles)}).`,
      why: null,
      consequence: "Cada sol extra aquí sale directo del margen del mes.",
      action: { label: "Ver presupuesto", href: "presupuesto" },
      benefit: "Frenar esta categoría el resto del mes evita seguir comiéndote el margen.",
      inactionCost: over > 0
        ? `Ya vas ${fmtS(over)} sobre el presupuesto; si sigue, el exceso crece cada día.`
        : "La categoría está al límite: cualquier gasto extra la pone en exceso.",
    });
  }

  // — Categorías disparadas vs su promedio de 8 semanas (con atribución).
  //   Recién desde el día 5: antes, el "esperado al corte" es tan chico que
  //   cualquier compra normal parecería un disparo (falsas alarmas).
  for (const t of f.daysElapsed >= 5 ? f.categoryTrends : []) {
    const delta = t.monthToDate - t.expectedToDate;
    const threshold = Math.max(100, t.expectedToDate * 0.25);
    if (t.expectedToDate > 0 && delta >= threshold) {
      const projExtra = (delta / f.daysElapsed) * f.daysInMonth;
      const marginPts = projSales > 0 ? (projExtra / projSales) * 100 : null;
      const top = t.topMovements.slice(0, 3)
        .map((m) => `"${m.concept}" ${fmtS(m.amount)}`)
        .join(", ");
      out.push({
        id: `categoria-alta-${t.category}`,
        severity: "aviso",
        impact: delta,
        title: `${t.category}: ${fmtS(delta)} sobre tu ritmo normal`,
        what: `Llevas ${fmtS(t.monthToDate)} en ${t.category}; a este día del mes tu promedio de 8 semanas indicaría ~${fmtS(t.expectedToDate)}.`,
        why: top ? `Los movimientos que más pesaron: ${top}.` : null,
        consequence: marginPts !== null && marginPts >= 0.5
          ? `Si la tendencia continúa, el sobrecosto del mes sería ~${fmtS(projExtra)} — unos ${marginPts.toFixed(1)} puntos de margen.`
          : `Si continúa, el mes cerraría ~${fmtS(projExtra)} por encima de lo normal en esta categoría.`,
        action: { label: `Ver movimientos de ${t.category}`, href: "reportes?tab=movimientos" },
        benefit: `Volver al ritmo normal desde hoy recupera ~${fmtS(projExtra - delta)} de aquí al cierre.`,
        inactionCost: `El mes cierra ~${fmtS(projExtra)} más caro en ${t.category}.`,
      });
    }
    // — Oportunidad: categoría gastando bastante menos que su promedio
    if (t.expectedToDate >= 200 && t.monthToDate <= t.expectedToDate * 0.7) {
      const ahorro = t.expectedToDate - t.monthToDate;
      out.push({
        id: `categoria-baja-${t.category}`,
        severity: "oportunidad",
        impact: ahorro,
        title: `${t.category} viene ${fmtS(ahorro)} por debajo de lo normal`,
        what: `Llevas ${fmtS(t.monthToDate)} vs ~${fmtS(t.expectedToDate)} esperado a este día del mes.`,
        why: null,
        consequence: "Si es un ahorro real (y no gasto sin registrar), sostenlo: va directo al margen.",
        action: null,
        benefit: `Sostener este ritmo suma ~${fmtS(ahorro)} al margen del mes.`,
        inactionCost: null,
      });
    }
  }

  // — Ventas: caída o crecimiento fuerte vs mismo corte.
  //   Se omite los días 1–2 del mes (las ventas del día anterior suelen
  //   registrarse a la mañana siguiente → compararía contra casi nada).
  const cmp = f.sales.comparison ?? null;
  const gb = growthBase(f);
  if (gb.pct !== null && gb.daysCompared >= 3 && f.daysElapsed >= 3) {
    const sd = gb;
    const diff = sd.current - sd.previous;
    const pct = gb.pct;
    // Contexto que evita conclusiones apresuradas: cuántos días se
    // compararon de verdad, y la lectura alineada por día de semana
    // cuando los meses no arrancan el mismo día (en una cafetería un
    // sábado no se compara contra un martes).
    const base = gb.paired
      ? `Comparando los ${sd.daysCompared} días con datos en ambos meses: ${fmtS(sd.current)} vs ${fmtS(sd.previous)}.`
      : `Al día ${f.daysElapsed} llevas ${fmtS(sd.current)} vs ${fmtS(sd.previous)} del mes anterior al mismo día.`;
    const wk = cmp && cmp.weekdayShift !== 0 && cmp.weekdayAligned.pct !== null
      ? ` Alineado por día de semana (sábado con sábado): ${cmp.weekdayAligned.pct >= 0 ? "+" : ""}${cmp.weekdayAligned.pct.toFixed(1)}%.`
      : "";
    const cov = cmp?.lowCoverage
      ? ` ⚠ Solo ${sd.daysCompared} días comparables — falta cargar datos para que el % sea confiable.`
      : "";
    // Proyección de cierre sobre el ritmo POR DÍA comparado, no sobre
    // días de calendario (que incluían días sin datos).
    const proyect = (diff / sd.daysCompared) * f.daysInMonth;
    if (pct <= -10) {
      out.push({
        id: "ventas-cayendo",
        severity: cmp?.lowCoverage ? "info" : "aviso",
        impact: Math.abs(diff),
        title: `Ventas ${pct.toFixed(1)}% vs el mes pasado`,
        what: `${base}${wk}${cov}`,
        why: null,
        consequence: `Si el ritmo no cambia, el mes cerraría ~${fmtS(proyect)} por debajo del anterior.`,
        action: { label: "Ver ventas por día", href: "reportes" },
        benefit: "Detectar hoy qué producto/cliente/día cayó permite reaccionar dentro del mismo mes.",
        inactionCost: `El mes cierra ~${fmtS(Math.abs(proyect))} por debajo del anterior.`,
      });
    } else if (pct >= 10) {
      out.push({
        id: "ventas-subiendo",
        severity: cmp?.lowCoverage ? "info" : "oportunidad",
        impact: diff,
        title: `Ventas +${pct.toFixed(1)}% vs el mes pasado`,
        what: `${base}${wk}${cov}`,
        why: null,
        consequence: "Identifica qué lo está impulsando (producto, cliente, día) para repetirlo.",
        action: { label: "Ver ventas por día", href: "reportes" },
        benefit: `Entender qué impulsa el +${pct.toFixed(1)}% permite repetirlo (vale ~${fmtS(diff)} en los días comparados).`,
        inactionCost: null,
      });
    }
  }

  // — Dinero cobrable (oportunidad permanente si hay CxC)
  if (f.receivables.totalPending > 0 && f.receivables.overdueAmount === 0) {
    out.push({
      id: "cxc-cobrable",
      severity: "oportunidad",
      impact: f.receivables.totalPending,
      title: `${fmtS(f.receivables.totalPending)} cobrables a los locales`,
      what: `Tienes cuentas por cobrar al día (${f.receivables.byDebtor.map((d) => `${d.name}: ${fmtS(d.pending)}`).join(" · ")}).`,
      why: null,
      consequence: "Cobrarlas mejora tu caja sin costo alguno.",
      action: { label: "Ir a Por cobrar", href: "fonavi" },
      benefit: f.avgDailyExpense8w > 0
        ? `+${fmtS(f.receivables.totalPending)} de liquidez inmediata (~${(f.receivables.totalPending / f.avgDailyExpense8w).toFixed(1)} días de cobertura).`
        : `+${fmtS(f.receivables.totalPending)} de liquidez inmediata.`,
      inactionCost: null,
    });
  }

  // — Deuda con el socio (recordatorio informativo)
  if (f.partnerLoanPending > 0) {
    out.push({
      id: "deuda-socio",
      severity: "info",
      impact: f.partnerLoanPending,
      title: `Debes ${fmtS(f.partnerLoanPending)} al socio`,
      what: `Préstamos del socio pendientes de devolver: ${fmtS(f.partnerLoanPending)}.`,
      why: null,
      consequence: null,
      action: { label: "Ver préstamos del socio", href: "prestamos-socio" },
      benefit: null,
      inactionCost: null,
    });
  }

  return out.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.impact - a.impact,
  );
}

// ─────────────────────────────────────────────────────────────────
// 3. Executive Brief
// ─────────────────────────────────────────────────────────────────

export function buildExecutiveBrief(
  f: BusinessFacts,
  health: HealthScore,
  insights: Insight[],
): ExecutiveBrief {
  const issues = insights.filter((i) => i.severity === "critico" || i.severity === "aviso");
  const opportunities = insights.filter((i) => i.severity === "oportunidad").slice(0, 2);
  const ebitda = f.sales.monthToDate - f.opExpenses.monthToDate;
  const margin = f.sales.monthToDate > 0 ? (ebitda / f.sales.monthToDate) * 100 : 0;

  const headline =
    health.level === "sano"
      ? `${f.businessName} está sano (${health.total}/100).`
      : health.level === "estable"
        ? `${f.businessName} está estable (${health.total}/100), con ${issues.length} tema(s) que vigilar.`
        : health.level === "atencion"
          ? `${f.businessName} requiere atención (${health.total}/100): ${issues.length} tema(s) abiertos.`
          : `${f.businessName} está en estado crítico (${health.total}/100) — actúa hoy.`;

  // Una sola frase con lo que NO está en otra parte de la pantalla: el
  // P&L del mes al corte. (La liquidez vive en su tarjeta; el tema #1
  // vive en "La acción de hoy" — no se repite aquí.)
  const parts: string[] = [];
  if (f.sales.monthToDate > 0) {
    parts.push(
      `Día ${f.daysElapsed}: ventas ${fmtS(f.sales.monthToDate)}, gastos ${fmtS(f.opExpenses.monthToDate)} → margen ${margin.toFixed(1)}% (${fmtS(ebitda)}).`,
    );
  } else {
    parts.push(`Sin ventas registradas aún este mes; gastos al corte: ${fmtS(f.opExpenses.monthToDate)}.`);
  }
  if (issues.length === 0) {
    parts.push("Sin temas urgentes hoy.");
  }

  // "Hoy te recomiendo": hasta 3 acciones únicas, en orden de prioridad.
  // 1) Las acciones de los temas críticos/avisos. 2) Si la liquidez está
  // corta, un consejo de conducta. 3) Si sobra espacio, cobrar pendientes.
  const recommendations: Recommendation[] = [];
  const seenLabels = new Set<string>();
  const push = (rec: Recommendation) => {
    if (recommendations.length >= 3 || seenLabels.has(rec.label)) return;
    seenLabels.add(rec.label);
    recommendations.push(rec);
  };
  for (const i of issues) {
    if (i.action) {
      push({
        label: i.action.label,
        href: i.action.href,
        benefit: i.benefit,
        inactionCost: i.inactionCost,
      });
    }
  }
  if (issues.some((i) => i.id === "cobertura-corta" || i.id === "ebitda-negativo")) {
    push({
      label: "Evita gastos extraordinarios hoy",
      href: null,
      benefit: "Cada gasto evitado = días de operación.",
      inactionCost: null,
    });
  }
  const cobrable = insights.find((i) => i.id === "cxc-cobrable");
  if (cobrable?.action) {
    push({
      label: cobrable.action.label,
      href: cobrable.action.href,
      benefit: cobrable.benefit,
      inactionCost: cobrable.inactionCost,
    });
  }

  // ¿Por qué la #1 es la #1? Criterio explícito y auditable: es la acción
  // del tema más grave del día con el mayor impacto en soles.
  let topActionReason: string | null = null;
  if (recommendations.length > 0) {
    const top = issues.find((i) => i.action?.label === recommendations[0].label);
    topActionReason = top
      ? `#1 por impacto: ${fmtS(top.impact)} en juego.`
      : "#1: lo único accionable hoy.";
  }

  return {
    headline,
    summary: parts.join(" "),
    topIssues: issues.slice(0, 3),
    opportunities,
    recommendations,
    topActionReason,
  };
}

/** Punto de entrada único del motor. */
export function computeIntel(f: BusinessFacts): CommandCenterIntel {
  const health = computeHealthScore(f);
  const insights = buildInsights(f);
  const brief = buildExecutiveBrief(f, health, insights);
  return { health, insights, brief };
}
