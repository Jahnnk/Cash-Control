/**
 * EIRS · Inteligencia — Oportunidades: impacto en soles, prioridad,
 * facilidad y plazo. Honestidad con los datos: solo se propone lo que los
 * datos sustentan; lo que requiere juicio externo (ej. renegociar un
 * contrato) se marca como "a evaluar" con impacto estimado y fuente clara.
 */

import type { UnitFacts, Opportunity } from "../types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function detectOpportunities(f: UnitFacts): Opportunity[] {
  const out: Opportunity[] = [];

  // 1) Cobrar pendientes (impacto directo e inmediato)
  if (f.receivables && f.receivables.totalPending > 0) {
    out.push({
      id: "op-cobrar", kind: "oportunidad",
      impact: r2(f.receivables.totalPending),
      priority: f.receivables.overdueAmount > 0 ? 1 : 2,
      ease: "fácil", timeframe: "inmediato",
      metric: "Cuentas por cobrar pendientes",
      valueNow: r2(f.receivables.totalPending), valueRef: 0,
      source: "saldo pendiente de CxC al cierre",
    });
  }

  // 2) Reducir categorías infladas vs su promedio (top 3 por exceso)
  const inflated = f.categories
    .map((c) => ({ c, delta: c.amount - c.avg3m }))
    .filter(({ c, delta }) => c.avg3m > 0 && delta >= Math.max(100, c.avg3m * 0.25))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  for (const { c, delta } of inflated) {
    out.push({
      id: `op-reducir-${c.category}`, kind: "oportunidad",
      impact: r2(delta), priority: 2, ease: "media", timeframe: "este mes",
      metric: `${c.category}: volver a su promedio de 3 meses`,
      valueNow: c.amount, valueRef: c.avg3m,
      source: "exceso del mes vs promedio 3m; volver al promedio recupera el exceso",
    });
  }

  // 3) Frenar categorías sobre presupuesto
  const reds = f.budget.filter((b) => b.color === "red" && b.spent > b.budgetSoles);
  const excess = r2(reds.reduce((s, b) => s + (b.spent - b.budgetSoles), 0));
  if (excess > 0) {
    out.push({
      id: "op-presupuesto", kind: "oportunidad",
      impact: excess, priority: 2, ease: "media", timeframe: "este mes",
      metric: `Volver al presupuesto en ${reds.map((b) => b.category).join(", ")}`,
      valueNow: excess, valueRef: 0,
      source: "suma de excesos sobre presupuesto en categorías rojas",
    });
  }

  // 4) Sostener ahorros ya logrados
  for (const c of f.categories) {
    if (c.avg3m >= 200 && c.amount <= c.avg3m * 0.7) {
      out.push({
        id: `op-sostener-${c.category}`, kind: "oportunidad",
        impact: r2(c.avg3m - c.amount), priority: 3, ease: "fácil", timeframe: "este mes",
        metric: `Sostener el ahorro en ${c.category}`,
        valueNow: c.amount, valueRef: c.avg3m,
        source: "gasto del mes ≤70% de su promedio de 3m: mantenerlo consolida el ahorro",
      });
    }
  }

  // 5) A EVALUAR: renegociación del mayor costo fijo (requiere juicio externo;
  //    el impacto es un estimado conservador del 5% y se declara como tal).
  const topFixed = f.categories
    .filter((c) => c.costGroup === "fijo" && c.amount > 0)
    .sort((a, b) => b.amount - a.amount)[0];
  if (topFixed && f.current.opExpenses > 0 && topFixed.amount >= f.current.opExpenses * 0.15) {
    out.push({
      id: `op-evaluar-${topFixed.category}`, kind: "oportunidad",
      impact: r2(topFixed.amount * 0.05), priority: 3, ease: "difícil", timeframe: "trimestre",
      metric: `A evaluar: renegociar ${topFixed.category} (mayor costo fijo)`,
      valueNow: topFixed.amount, valueRef: r2(f.current.opExpenses),
      source: "estimado conservador (5%) sobre el mayor costo fijo; requiere evaluación del contrato — el sistema no lo conoce",
    });
  }

  const prioOrder = (o: Opportunity) => o.priority * 1_000_000 - o.impact;
  return out.sort((a, b) => prioOrder(a) - prioOrder(b));
}
