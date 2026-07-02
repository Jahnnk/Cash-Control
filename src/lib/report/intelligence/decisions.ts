/**
 * EIRS · Inteligencia — Plan de acción: ≤5 decisiones, ordenadas por
 * impacto, cada una trazable al hallazgo que la origina.
 * Puro. La redacción "qué/por qué" vive en la narrativa; aquí van la
 * acción imperativa corta, el impacto, el responsable sugerido y el plazo.
 */

import type { Risk, Opportunity, Decision } from "../types";

/** Acción imperativa + responsable/plazo por tipo de mitigación u oportunidad. */
const ACTION_CATALOG: Record<string, { action: string; owner: string; timeframe: string }> = {
  // mitigaciones de riesgos
  "cobrar-y-frenar": { action: "Cobrar pendientes y congelar gastos no esenciales", owner: "Gerencia", timeframe: "esta semana" },
  "recortar-variable": { action: "Recortar gasto variable hasta recuperar margen", owner: "Gerencia", timeframe: "este mes" },
  "cobrar-cxc": { action: "Cobrar las cuentas vencidas", owner: "Administración", timeframe: "esta semana" },
  "conciliar": { action: "Resolver la diferencia con el banco", owner: "Administración", timeframe: "antes del cierre" },
  "frenar-categorias": { action: "Frenar las categorías sobre presupuesto", owner: "Gerencia", timeframe: "este mes" },
  "evaluar-concentracion": { action: "Evaluar alternativas para el costo dominante", owner: "Gerencia", timeframe: "trimestre" },
  "corregir-registro": { action: "Corregir el registro de caja", owner: "Administración", timeframe: "esta semana" },
  // oportunidades (por prefijo de id)
  "op-cobrar": { action: "Cobrar todas las cuentas pendientes", owner: "Administración", timeframe: "esta semana" },
  "op-reducir": { action: "Devolver la categoría a su nivel normal", owner: "Gerencia", timeframe: "este mes" },
  "op-presupuesto": { action: "Volver al presupuesto en las categorías excedidas", owner: "Gerencia", timeframe: "este mes" },
  "op-sostener": { action: "Sostener el ahorro logrado", owner: "Gerencia", timeframe: "este mes" },
  "op-evaluar": { action: "Evaluar renegociación del costo fijo mayor", owner: "Gerencia", timeframe: "trimestre" },
};

function catalogFor(id: string, mitigationId?: string): { action: string; owner: string; timeframe: string } {
  if (mitigationId && ACTION_CATALOG[mitigationId]) return ACTION_CATALOG[mitigationId];
  const prefix = Object.keys(ACTION_CATALOG).find((k) => id.startsWith(k));
  return prefix ? ACTION_CATALOG[prefix] : { action: "Revisar el hallazgo", owner: "Gerencia", timeframe: "este mes" };
}

export function buildDecisions(risks: Risk[], opportunities: Opportunity[]): Decision[] {
  const candidates: Decision[] = [];

  for (const r of risks) {
    const cat = catalogFor(r.id, r.mitigationId);
    candidates.push({
      id: `dec-${r.id}`, action: cat.action, impact: r.impact,
      owner: cat.owner, timeframe: cat.timeframe, sourceFindingId: r.id,
    });
  }
  for (const o of opportunities) {
    const cat = catalogFor(o.id);
    candidates.push({
      id: `dec-${o.id}`, action: cat.action, impact: o.impact,
      owner: cat.owner, timeframe: o.timeframe, sourceFindingId: o.id,
    });
  }

  // Dedup por acción (un riesgo y una oportunidad pueden apuntar a lo mismo,
  // ej. cobrar CxC): gana la de mayor impacto.
  const byAction = new Map<string, Decision>();
  for (const d of candidates) {
    const existing = byAction.get(d.action);
    if (!existing || d.impact > existing.impact) byAction.set(d.action, d);
  }

  return [...byAction.values()].sort((a, b) => b.impact - a.impact).slice(0, 5);
}
