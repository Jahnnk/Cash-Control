/**
 * EIRS · Inteligencia — Riesgos: ordenados por impacto, con gravedad,
 * consecuencia estimada y mitigación (id del catálogo narrativo).
 * Puro. Sin prosa.
 */

import type { UnitFacts, Risk } from "../types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function detectRisks(f: UnitFacts): Risk[] {
  const out: Risk[] = [];
  const liquid = f.liquidity.bankEnd + Math.max(0, f.liquidity.cashEnd);
  const daily = f.liquidity.avgDailyExpense;

  // Liquidez corta
  if (daily > 0) {
    const days = liquid / daily;
    if (days < 15) {
      out.push({
        id: "riesgo-liquidez", kind: "riesgo",
        severity: days < 7 ? "alta" : "media",
        impact: r2(daily * (15 - days)),
        consequenceSoles: r2(daily * (15 - days)),
        metric: "Días de cobertura al cierre", valueNow: r2(days), valueRef: 15, valueUnit: "días",
        source: "liquidez cierre ÷ gasto operativo diario del mes",
        mitigationId: "cobrar-y-frenar",
      });
    }
  }
  // Pérdida operativa
  if (f.current.sales > 0 && f.current.ebitda < 0) {
    out.push({
      id: "riesgo-perdida", kind: "riesgo", severity: "alta",
      impact: r2(Math.abs(f.current.ebitda)),
      consequenceSoles: r2(Math.abs(f.current.ebitda)), // otro mes igual
      metric: "EBITDA del mes", valueNow: r2(f.current.ebitda), valueRef: 0,
      source: "resultado operativo negativo; consecuencia = repetirlo un mes más",
      mitigationId: "recortar-variable",
    });
  }
  // CxC vencidas
  if (f.receivables && f.receivables.overdueAmount > 0) {
    out.push({
      id: "riesgo-cxc", kind: "riesgo",
      severity: f.receivables.overdueAmount >= 500 ? "alta" : "media",
      impact: r2(f.receivables.overdueAmount),
      consequenceSoles: r2(f.receivables.overdueAmount),
      metric: "Cuentas por cobrar vencidas", valueNow: r2(f.receivables.overdueAmount), valueRef: 0,
      source: `pendientes con más de 15 días (la más antigua: ${f.receivables.oldestDays} días)`,
      mitigationId: "cobrar-cxc",
    });
  }
  // Información no confiable (descuadre)
  const diff = f.reconciliation.lastCheckDiff;
  if (f.reconciliation.hasDiscrepancy || (diff !== null && Math.abs(diff) > 50)) {
    out.push({
      id: "riesgo-conciliacion", kind: "riesgo", severity: "media",
      impact: r2(Math.abs(diff ?? 0)),
      consequenceSoles: null,
      metric: "Diferencia con el banco real", valueNow: r2(Math.abs(diff ?? 0)), valueRef: 0,
      source: f.reconciliation.hasDiscrepancy
        ? "inconsistencia interna en la cadena de saldos"
        : "último cuadre con diferencia > S/50",
      mitigationId: "conciliar",
    });
  }
  // Presupuesto en rojo
  const reds = f.budget.filter((b) => b.color === "red");
  if (reds.length > 0) {
    const excess = r2(reds.reduce((s, b) => s + Math.max(0, b.spent - b.budgetSoles), 0));
    out.push({
      id: "riesgo-presupuesto", kind: "riesgo", severity: excess >= 500 ? "alta" : "media",
      impact: excess, consequenceSoles: excess,
      metric: `${reds.length} categoría(s) sobre presupuesto`, valueNow: excess, valueRef: 0,
      source: `semáforos en rojo: ${reds.map((b) => b.category).join(", ")}`,
      mitigationId: "frenar-categorias",
    });
  }
  // Concentración del gasto (estructural)
  if (f.current.opExpenses > 0 && f.categories.length > 1) {
    const top = [...f.categories].sort((a, b) => b.amount - a.amount)[0];
    const share = top.amount / f.current.opExpenses;
    if (share > 0.5) {
      out.push({
        id: "riesgo-concentracion", kind: "riesgo", severity: "baja",
        impact: r2(top.amount), consequenceSoles: null,
        metric: `${top.category} concentra el ${Math.round(share * 100)}% del gasto operativo`,
        valueNow: r2(top.amount), valueRef: r2(f.current.opExpenses),
        source: "categoría dominante >50% del gasto del mes",
        mitigationId: "evaluar-concentracion",
      });
    }
  }
  // Caja negativa (dato roto)
  if (f.liquidity.cashEnd < -0.01) {
    out.push({
      id: "riesgo-caja-negativa", kind: "riesgo", severity: "alta",
      impact: r2(Math.abs(f.liquidity.cashEnd)), consequenceSoles: null,
      metric: "Caja física negativa", valueNow: r2(f.liquidity.cashEnd), valueRef: 0,
      source: "error de registro: la caja no puede ser negativa",
      mitigationId: "corregir-registro",
    });
  }

  const sevOrder = { alta: 0, media: 1, baja: 2 } as const;
  return out.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.impact - a.impact);
}
