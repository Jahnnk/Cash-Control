/**
 * EIRS · Inteligencia — Proyecciones a 3 escenarios para el mes siguiente.
 * Regla auditable: los escenarios salen de los flujos netos mensuales REALES
 * de los últimos meses (peor / promedio / mejor). Nunca certeza: siempre
 * con nivel de confianza y supuestos declarados.
 */

import type { UnitFacts, ProjectionSet, Projection } from "../types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildProjections(f: UnitFacts): ProjectionSet {
  const liquidEnd = r2(f.liquidity.bankEnd + f.liquidity.cashEnd);

  // Flujos netos mensuales observados: cierre_i − cierre_{i-1}, incluyendo
  // el mes del reporte. Solo meses con liquidez registrada.
  const closes: { month: string; value: number }[] = [];
  for (const h of f.history) {
    if (h.liquidityEnd !== null) closes.push({ month: h.month, value: h.liquidityEnd });
  }
  closes.push({ month: f.month, value: liquidEnd });

  const flows: { month: string; value: number }[] = [];
  for (let i = 1; i < closes.length; i++) {
    flows.push({ month: closes[i].month, value: r2(closes[i].value - closes[i - 1].value) });
  }

  if (flows.length === 0) {
    // Sin historial: no se inventa un ritmo — escenarios planos, confianza baja.
    const flat: Projection[] = (["conservador", "esperado", "optimista"] as const).map((scenario) => ({
      scenario, liquidityEndNextMonth: liquidEnd, monthlyNetFlow: 0,
      basis: "sin historial de liquidez suficiente: se asume flujo neto 0",
    }));
    return { scenarios: flat, confidence: "baja", confidenceBasis: "no hay meses previos con liquidez registrada" };
  }

  const values = flows.map((x) => x.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = r2(values.reduce((s, v) => s + v, 0) / values.length);
  const monthsUsed = flows.map((x) => x.month).join(", ");

  const scenarios: Projection[] = [
    { scenario: "conservador", liquidityEndNextMonth: r2(liquidEnd + min), monthlyNetFlow: min, basis: `peor flujo neto mensual observado (${monthsUsed})` },
    { scenario: "esperado", liquidityEndNextMonth: r2(liquidEnd + avg), monthlyNetFlow: avg, basis: `flujo neto mensual promedio (${monthsUsed})` },
    { scenario: "optimista", liquidityEndNextMonth: r2(liquidEnd + max), monthlyNetFlow: max, basis: `mejor flujo neto mensual observado (${monthsUsed})` },
  ];

  // Confianza: consistencia de los flujos observados.
  let confidence: ProjectionSet["confidence"];
  let confidenceBasis: string;
  const allSameSign = values.every((v) => v >= 0) || values.every((v) => v <= 0);
  const spread = max - min;
  if (flows.length < 2) {
    confidence = "baja";
    confidenceBasis = "solo un mes de flujo observado";
  } else if (allSameSign && spread <= Math.max(Math.abs(avg), 100)) {
    confidence = "alta";
    confidenceBasis = "los flujos mensuales van en la misma dirección y con magnitud similar";
  } else if (allSameSign) {
    confidence = "media";
    confidenceBasis = "misma dirección pero magnitudes dispares entre meses";
  } else {
    confidence = "baja";
    confidenceBasis = "los flujos mensuales alternan de signo: el próximo mes puede ir en cualquier dirección";
  }

  return { scenarios, confidence, confidenceBasis };
}
