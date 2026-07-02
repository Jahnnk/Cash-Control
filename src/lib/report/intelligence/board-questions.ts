/**
 * EIRS · Inteligencia — Las 3 preguntas que el directorio debe RESOLVER.
 *
 * Diferencia con las decisiones: una decisión es operativa (la ejecuta
 * gerencia); una pregunta de directorio requiere acuerdo entre socios
 * (cambiar presupuesto, aprobar congelamientos, iniciar renegociaciones,
 * definir calendarios de devolución). Derivadas SOLO de hallazgos, con
 * trazabilidad. Máximo 3, ordenadas por el impacto del hallazgo origen.
 */

import type { UnitFacts, UnitIntelligence, BoardQuestion } from "../types";

const fmt = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

export function buildBoardQuestions(
  f: UnitFacts,
  intel: Pick<UnitIntelligence, "risks" | "opportunities" | "projections" | "budgetSummary">,
): BoardQuestion[] {
  const out: (BoardQuestion & { impact: number })[] = [];

  // 1) Presupuesto estructural: re-presupuestar o rediseñar el gasto.
  const bs = intel.budgetSummary;
  if (bs && bs.structuralReds.length > 0) {
    out.push({
      id: "q-presupuesto-estructural",
      question: `¿Re-presupuestamos ${bs.structuralReds.join(", ")} a su nivel real, o exigimos reducir el gasto al presupuesto actual?`,
      context: `El gasto de esta(s) categoría(s) es su norma histórica, no un pico: el presupuesto está desalineado (exceso ${fmt(bs.excessSoles)}).`,
      sourceFindingId: "riesgo-presupuesto",
      impact: bs.excessSoles,
    });
  }

  // 2) Liquidez / proyección bajo el objetivo: aprobar régimen de gasto.
  const esperado = intel.projections.scenarios.find((s) => s.scenario === "esperado");
  const liquidezRisk = intel.risks.find((r) => r.id === "riesgo-liquidez");
  if (liquidezRisk) {
    out.push({
      id: "q-regimen-gasto",
      question: "¿Aprobamos congelar gastos extraordinarios hasta recuperar 15 días de cobertura?",
      context: `Cobertura actual ~${liquidezRisk.valueNow} día(s)${esperado ? `; cierre esperado del próximo mes ${fmt(esperado.liquidityEndNextMonth)}` : ""}.`,
      sourceFindingId: liquidezRisk.id,
      impact: liquidezRisk.impact,
    });
  }

  // 3) Renegociación del costo fijo mayor (requiere acuerdo, no gerencia).
  const evaluar = intel.opportunities.find((o) => o.id.startsWith("op-evaluar-"));
  if (evaluar) {
    const category = evaluar.id.replace("op-evaluar-", "");
    out.push({
      id: "q-renegociacion",
      question: `¿Autorizamos evaluar la renegociación de ${category} (el mayor costo fijo)?`,
      context: `Ahorro estimado conservador ${fmt(evaluar.impact)}/mes; requiere decisión de socios, no de gerencia.`,
      sourceFindingId: evaluar.id,
      impact: evaluar.impact,
    });
  }

  // 4) Deuda con el socio sin calendario.
  if ((f.partnerLoanPending ?? 0) > 0) {
    out.push({
      id: "q-deuda-socio",
      question: `¿Definimos un calendario de devolución de los ${fmt(f.partnerLoanPending!)} adeudados al socio?`,
      context: "La deuda no tiene plazo pactado; formalizarla evita tensiones y ordena el flujo.",
      sourceFindingId: "deuda-socio",
      impact: f.partnerLoanPending!,
    });
  }

  // 5) CxC vencidas recurrentes: política de plazos entre unidades.
  const cxc = intel.risks.find((r) => r.id === "riesgo-cxc");
  if (cxc) {
    out.push({
      id: "q-politica-cobros",
      question: "¿Fijamos un plazo máximo formal (ej. 15 días) para los cobros entre unidades?",
      context: `Hay ${fmt(cxc.impact)} vencidos; sin política, el patrón se repite cada mes.`,
      sourceFindingId: cxc.id,
      impact: cxc.impact,
    });
  }

  return out
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3)
    .map((q) => ({ id: q.id, question: q.question, context: q.context, sourceFindingId: q.sourceFindingId }));
}
