/**
 * EIRS · Inteligencia — Hallazgos: logros, problemas, sorpresas y vigilancia.
 * Puro: UnitFacts → Finding[]. Sin prosa (la prosa vive en narrative.ts).
 * Cada hallazgo lleva `source` = de qué regla/datos salió (auditoría).
 */

import type { UnitFacts, Finding } from "../types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function detectStrengths(f: UnitFacts): Finding[] {
  const out: Finding[] = [];
  const prev = f.history.at(-1) ?? null;

  if (prev && prev.sales > 0 && f.current.sales >= prev.sales * 1.05) {
    out.push({
      id: "logro-ventas", kind: "logro", impact: r2(f.current.sales - prev.sales),
      metric: "Ventas vs mes anterior", valueNow: r2(f.current.sales), valueRef: r2(prev.sales),
      source: `ventas ${f.month} vs ${prev.month} (+5% mínimo)`,
    });
  }
  if (prev && f.current.ebitda > prev.ebitda && f.current.ebitda > 0) {
    out.push({
      id: "logro-ebitda", kind: "logro", impact: r2(f.current.ebitda - prev.ebitda),
      metric: "EBITDA vs mes anterior", valueNow: r2(f.current.ebitda), valueRef: r2(prev.ebitda),
      source: "ebitda mensual comparado",
    });
  }
  // Categorías con ahorro real vs su promedio de 3 meses
  for (const c of f.categories) {
    if (c.avg3m >= 200 && c.amount <= c.avg3m * 0.75) {
      out.push({
        id: `logro-ahorro-${c.category}`, kind: "logro", impact: r2(c.avg3m - c.amount),
        metric: `${c.category} vs promedio 3m`, valueNow: c.amount, valueRef: c.avg3m,
        source: "gasto por categoría ≤75% de su promedio de 3 meses",
      });
    }
  }
  if (f.capabilities.budgets && f.budget.length > 0 && f.budget.every((b) => b.color === "green")) {
    out.push({
      id: "logro-presupuesto", kind: "logro", impact: 0,
      metric: "Presupuesto", valueNow: f.budget.length, valueRef: f.budget.length,
      source: "todas las categorías presupuestadas en verde",
    });
  }
  if (f.liquidity.startOfMonth !== null) {
    const flow = f.liquidity.bankEnd + f.liquidity.cashEnd - f.liquidity.startOfMonth;
    if (flow > 0) {
      out.push({
        id: "logro-caja", kind: "logro", impact: r2(flow),
        metric: "Variación de liquidez del mes", valueNow: r2(f.liquidity.bankEnd + f.liquidity.cashEnd), valueRef: r2(f.liquidity.startOfMonth),
        source: "liquidez cierre vs inicio de mes",
      });
    }
  }
  return out.sort((a, b) => b.impact - a.impact);
}

export function detectProblems(f: UnitFacts): Finding[] {
  const out: Finding[] = [];
  const prev = f.history.at(-1) ?? null;

  if (prev && prev.sales > 0 && f.current.sales <= prev.sales * 0.9) {
    out.push({
      id: "problema-ventas", kind: "problema", impact: r2(prev.sales - f.current.sales),
      metric: "Ventas vs mes anterior", valueNow: r2(f.current.sales), valueRef: r2(prev.sales),
      source: "caída de ventas ≥10% vs mes anterior",
    });
  }
  if (f.current.sales > 0 && f.current.ebitda < 0) {
    out.push({
      id: "problema-perdida", kind: "problema", impact: r2(Math.abs(f.current.ebitda)),
      metric: "EBITDA del mes", valueNow: r2(f.current.ebitda), valueRef: 0,
      source: "gastos operativos superan las ventas",
    });
  }
  for (const c of f.categories) {
    const delta = c.amount - c.avg3m;
    if (c.avg3m > 0 && delta >= Math.max(100, c.avg3m * 0.25)) {
      out.push({
        id: `problema-categoria-${c.category}`, kind: "problema", impact: r2(delta),
        metric: `${c.category} vs promedio 3m`, valueNow: c.amount, valueRef: c.avg3m,
        source: "gasto por categoría ≥25% (y ≥S/100) sobre su promedio de 3 meses",
      });
    }
  }
  if (f.liquidity.cashEnd < -0.01) {
    out.push({
      id: "problema-caja-negativa", kind: "problema", impact: r2(Math.abs(f.liquidity.cashEnd)),
      metric: "Caja física", valueNow: r2(f.liquidity.cashEnd), valueRef: 0,
      source: "caja negativa = error de registro (físicamente imposible)",
    });
  }
  return out.sort((a, b) => b.impact - a.impact);
}

export function detectSurprises(f: UnitFacts): Finding[] {
  const out: Finding[] = [];
  // Gasto significativo en una categoría que venía sin actividad
  for (const c of f.categories) {
    if (c.avg3m < 50 && c.amount >= 300) {
      out.push({
        id: `sorpresa-nueva-${c.category}`, kind: "sorpresa", impact: r2(c.amount),
        metric: `${c.category} (sin historial)`, valueNow: c.amount, valueRef: c.avg3m,
        source: "categoría con promedio 3m < S/50 y gasto del mes ≥ S/300",
      });
    }
  }
  // Un solo movimiento que pesa ≥15% del gasto operativo del mes
  if (f.current.opExpenses > 0) {
    for (const c of f.categories) {
      const top = c.topMovements[0];
      if (top && top.amount >= f.current.opExpenses * 0.15) {
        out.push({
          id: `sorpresa-movimiento-${c.category}`, kind: "sorpresa", impact: r2(top.amount),
          metric: `"${top.concept}" (${c.category})`, valueNow: top.amount, valueRef: r2(f.current.opExpenses),
          source: "movimiento único ≥15% del gasto operativo del mes",
        });
      }
    }
  }
  return out.sort((a, b) => b.impact - a.impact).slice(0, 3);
}

export function detectWatchlist(f: UnitFacts): Finding[] {
  const out: Finding[] = [];
  for (const b of f.budget.filter((x) => x.color === "yellow")) {
    out.push({
      id: `vigilar-presupuesto-${b.category}`, kind: "vigilar", impact: r2(Math.max(0, b.spent - b.budgetSoles)),
      metric: `${b.category} (presupuesto en amarillo)`, valueNow: b.spent, valueRef: b.budgetSoles,
      source: "semáforo de presupuesto en amarillo",
    });
  }
  if (f.receivables && f.receivables.oldestDays > 30) {
    out.push({
      id: "vigilar-cxc-antigua", kind: "vigilar", impact: r2(f.receivables.overdueAmount),
      metric: "Antigüedad de cuentas por cobrar", valueNow: f.receivables.oldestDays, valueRef: 30, valueUnit: "días",
      source: "cuenta por cobrar con más de 30 días",
    });
  }
  return out.sort((a, b) => b.impact - a.impact);
}
