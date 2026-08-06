/**
 * EIRS · CAPA NARRATIVA.
 *
 * PRINCIPIO (aprobado por Jahnn): la narrativa se construye EXCLUSIVAMENTE a
 * partir de la inteligencia. Esta función recibe UnitIntelligence y nada más
 * — no puede ver ReportFacts ni la BD, así que es imposible que "invente"
 * cifras que la capa de inteligencia no haya calculado y auditado.
 *
 * Cada Paragraph lleva `derivedFrom` (ids de KPIs/hallazgos) → trazabilidad.
 * Prosa por reglas: determinista, sin LLM (Fase A). La Fase B (pulido con
 * IA) reemplazaría solo este archivo, con verificación anti-alucinación.
 */

import type {
  UnitIntelligence,
  ReportNarrative,
  Paragraph,
  KPI,
  Finding,
  Risk,
  Opportunity,
  Decision,
} from "./types";

const fmt = (n: number) =>
  `S/${Math.abs(n) >= 1000
    ? Math.round(n).toLocaleString("es-PE")
    : n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function kpi(intel: UnitIntelligence, id: string): KPI | undefined {
  return intel.kpis.find((k) => k.id === id);
}

/** Catálogo de mitigaciones (texto por mitigationId de los riesgos). */
const MITIGATIONS: Record<string, string> = {
  "cobrar-y-frenar": "Cobrar los pendientes esta semana y congelar todo gasto no esencial hasta recuperar cobertura.",
  "recortar-variable": "Recortar el gasto variable (empezando por las categorías sobre su promedio) hasta devolver el margen a positivo.",
  "cobrar-cxc": "Programar el cobro de inmediato; cada semana de atraso hace la deuda más difícil de conciliar.",
  "conciliar": "Ubicar la diferencia contra el extracto del banco antes del cierre; hasta entonces, tratar las cifras con cautela.",
  "frenar-categorias": "Congelar compras de las categorías excedidas el resto del mes y revisar el presupuesto si el exceso es estructural.",
  "evaluar-concentracion": "Evaluar alternativas de proveedor o de estructura para el costo dominante (decisión de gerencia, no urgente).",
  "corregir-registro": "Auditar los movimientos de efectivo del mes y corregir el registro faltante o duplicado.",
};

// ─────────────────────────────────────────────────────────────────

function closingParagraph(intel: UnitIntelligence, monthLabel: string): Paragraph {
  const ventas = kpi(intel, "ingresos");
  const ebitda = kpi(intel, "ebitda");
  const margen = kpi(intel, "margen");
  const flujo = kpi(intel, "flujo");
  const derived = ["ingresos", "ebitda", "margen", "flujo", "health"];

  const parts: string[] = [];
  if (ventas) {
    const varTxt = ventas.deltaPct !== null ? ` (${pct(ventas.deltaPct)} vs el mes anterior)` : "";
    parts.push(`${monthLabel} cerró con ventas de ${fmt(ventas.value)}${varTxt}`);
  }
  if (ebitda && margen) {
    const signo = ebitda.value >= 0 ? "un resultado operativo de" : "una pérdida operativa de";
    parts.push(`${signo} ${fmt(ebitda.value)} (margen ${margen.value.toFixed(1)}%)`);
  } else if (ebitda) {
    parts.push(`${ebitda.value >= 0 ? "resultado operativo" : "pérdida operativa"} de ${fmt(ebitda.value)}`);
  }
  if (flujo) {
    parts.push(flujo.value >= 0 ? `la caja creció ${fmt(flujo.value)} en el mes` : `la caja se redujo ${fmt(Math.abs(flujo.value))} en el mes`);
  }
  const score = `Salud del negocio: ${intel.healthScore.total}/100 (${intel.healthScore.level}).`;

  // El resultado operativo (EBITDA) mide lo VENDIDO según Byte; el cambio de
  // caja es lo que YA se movió en el banco y la caja. No tienen por qué
  // coincidir peso a peso: el cobro de una venta tarda días en llegar al
  // banco (a veces cruza de mes) — es la razón de ser de esta app. Sin esta
  // frase, dos cifras del mismo párrafo que no cuadran leen como un error.
  const bridge = ebitda && flujo
    ? ` El resultado operativo y el cambio de caja no tienen por qué coincidir: el primero mide lo vendido según Byte, el segundo es el dinero que ya se movió en el banco y la caja, y el cobro de una venta puede tardar varios días en llegar al banco.`
    : "";

  const tone: Paragraph["tone"] =
    (ebitda?.value ?? 0) < 0 || intel.healthScore.total < 40 ? "riesgo"
    : intel.healthScore.total < 60 ? "atencion"
    : (flujo?.value ?? 0) < 0 ? "neutro" : "positivo";

  return { text: `${parts.join(", ")}.${bridge} ${score}`, tone, derivedFrom: derived };
}

/** Formatea el valor de un hallazgo según su unidad (default soles). */
function fmtVal(v: number, unit?: Finding["valueUnit"]): string {
  if (unit === "días") return `${Number.isInteger(v) ? v : v.toFixed(1)} días`;
  if (unit === "%") return `${v.toFixed(1)}%`;
  return fmt(v);
}

function findingParagraph(x: Finding, lead: string, tone: Paragraph["tone"]): Paragraph {
  const ref = x.valueRef !== null
    ? ` (${fmtVal(x.valueNow, x.valueUnit)} vs ${fmtVal(x.valueRef, x.valueUnit)} de referencia)`
    : ` (${fmtVal(x.valueNow, x.valueUnit)})`;
  const impacto = x.impact > 0 ? ` Impacto: ${fmt(x.impact)}.` : "";
  return {
    text: `${lead} ${x.metric.toLowerCase()}${ref}.${impacto}`,
    tone,
    derivedFrom: [x.id],
  };
}

function riskParagraph(r: Risk): Paragraph {
  const grav = r.severity === "alta" ? "Gravedad alta" : r.severity === "media" ? "Gravedad media" : "Gravedad baja";
  const cons = r.consequenceSoles !== null ? ` Consecuencia estimada si no se actúa: ${fmt(r.consequenceSoles)}.` : "";
  return {
    text: `${grav} — ${r.metric} (${fmtVal(r.valueNow, r.valueUnit)}${r.valueRef !== null ? ` vs ${fmtVal(r.valueRef, r.valueUnit)} de referencia` : ""}). Origen: ${r.source}.${cons}`,
    tone: r.severity === "alta" ? "riesgo" : "atencion",
    derivedFrom: [r.id],
  };
}

function opportunityParagraph(o: Opportunity): Paragraph {
  // Voz de asesor: recomendación clara y accionable, no descripción.
  return {
    text: `Recomendamos (prioridad ${o.priority}): ${o.metric} — impacto esperado ${fmt(o.impact)}, dificultad ${o.ease}, plazo ${o.timeframe}.`,
    tone: "positivo",
    derivedFrom: [o.id],
  };
}

function decisionParagraph(d: Decision, i: number): Paragraph {
  return {
    text: `${i + 1}. ${d.action} — impacto ${fmt(d.impact)} · responsable sugerido: ${d.owner} · plazo: ${d.timeframe}.`,
    tone: "neutro",
    derivedFrom: [d.sourceFindingId],
  };
}

function kpiComment(k: KPI): string {
  const varTxt = k.deltaPct !== null
    ? (k.unitSuffix === "%" ? `${k.deltaPct >= 0 ? "+" : ""}${k.deltaPct.toFixed(1)} pts vs mes previo` : `${pct(k.deltaPct)} vs mes previo`)
    : null;
  const driver = k.driver ? k.driver : null;
  const state = k.traffic === "verde" ? "En orden" : k.traffic === "ambar" ? "Vigilar" : "Atender";
  return [state, varTxt, driver].filter(Boolean).join(" · ");
}

// ─────────────────────────────────────────────────────────────────

export function buildNarrative(
  intel: UnitIntelligence,
  meta: { monthLabel: string; title: string },
): ReportNarrative {
  const { monthLabel } = meta;
  const closing = closingParagraph(intel, monthLabel);
  const topStrength = intel.strengths[0] ?? null;
  const topProblem = intel.problems[0] ?? null;
  const topRisk = intel.risks[0] ?? null;
  const topOpp = intel.opportunities[0] ?? null;

  // ── Análisis del mes: qué pasó → por qué → sorpresas → vigilar ──
  const analysis: Paragraph[] = [];
  const ventas = kpi(intel, "ingresos");
  const margen = kpi(intel, "margen");
  if (ventas) {
    const dir = ventas.trend === "sube" ? "crecieron" : ventas.trend === "baja" ? "cayeron" : "se mantuvieron";
    const varTxt = ventas.deltaPct !== null ? ` ${pct(ventas.deltaPct)}` : "";
    analysis.push({
      text: `Las ventas ${dir}${varTxt} respecto al mes anterior${margen ? `, con un margen operativo de ${margen.value.toFixed(1)}%${margen.deltaPct !== null ? ` (${margen.deltaPct >= 0 ? "+" : ""}${margen.deltaPct.toFixed(1)} pts)` : ""}` : ""}.`,
      tone: ventas.trend === "baja" ? "atencion" : "neutro",
      derivedFrom: ["ingresos", "margen"],
    });
  }
  // Por qué: los problemas de categoría explican el gasto; los logros, el ahorro.
  const catProblems = intel.problems.filter((p) => p.id.startsWith("problema-categoria-")).slice(0, 3);
  if (catProblems.length > 0) {
    const list = catProblems.map((p) => `${p.metric.replace(" vs promedio 3m", "")} (+${fmt(p.impact)} sobre su promedio)`).join(", ");
    analysis.push({
      text: `El mayor empuje del gasto vino de: ${list}. Recomendamos devolver estas categorías a su nivel normal el próximo mes — es la palanca de margen más directa disponible.`,
      tone: "atencion",
      derivedFrom: catProblems.map((p) => p.id),
    });
  }
  for (const s of intel.surprises.slice(0, 2)) {
    const p = findingParagraph(s, "Sorpresa del mes:", "atencion");
    analysis.push({ ...p, text: `${p.text} Recomendamos confirmar si es un gasto único o el inicio de uno recurrente.` });
  }
  for (const w of intel.watchlist.slice(0, 2)) {
    analysis.push(findingParagraph(w, "A vigilar:", "neutro"));
  }
  if (analysis.length === 0) {
    analysis.push({ text: "Mes sin desviaciones relevantes frente a su comportamiento histórico.", tone: "positivo", derivedFrom: [] });
  }

  // ── Rentabilidad: tendencia de 4 meses ──
  const profitability: Paragraph[] = [];
  const m = intel.series.margin;
  if (m.length >= 2) {
    const dir = m[m.length - 1] > m[0] + 0.5 ? "mejorando" : m[m.length - 1] < m[0] - 0.5 ? "deteriorándose" : "estable";
    profitability.push({
      text: `El margen operativo viene ${dir} en la ventana de ${m.length} meses (${m.map((x) => `${x.toFixed(1)}%`).join(" -> ")}).`,
      tone: dir === "deteriorándose" ? "atencion" : dir === "mejorando" ? "positivo" : "neutro",
      derivedFrom: ["margen"],
    });
  }
  const ebitdaK = kpi(intel, "ebitda");
  if (ebitdaK) {
    profitability.push({
      text: ebitdaK.value >= 0
        ? `El mes aporta ${fmt(ebitdaK.value)} de resultado operativo${ebitdaK.prev !== null ? ` (mes previo: ${fmt(ebitdaK.prev)})` : ""}.`
        : `El mes consume ${fmt(Math.abs(ebitdaK.value))} de caja a nivel operativo${ebitdaK.prev !== null ? ` (mes previo: ${fmt(ebitdaK.prev)})` : ""}: cada semana sin corregirlo profundiza la pérdida.`,
      tone: ebitdaK.value >= 0 ? "neutro" : "riesgo",
      derivedFrom: ["ebitda"],
    });
  }

  // ── Presupuesto: puntual vs estructural ──
  const budgetP: Paragraph[] = [];
  const bs = intel.budgetSummary;
  if (bs) {
    if (bs.reds === 0 && bs.yellows === 0) {
      budgetP.push({ text: `Ejecución presupuestal limpia: las ${bs.greens} categorías con semáforo cerraron en verde.`, tone: "positivo", derivedFrom: ["presupuesto"] });
    } else {
      budgetP.push({
        text: `${bs.reds} categoría(s) en rojo y ${bs.yellows} en amarillo; exceso total de ${fmt(bs.excessSoles)} sobre presupuesto.`,
        tone: bs.reds > 0 ? "riesgo" : "atencion",
        derivedFrom: ["presupuesto"],
      });
      if (bs.structuralReds.length > 0) {
        budgetP.push({
          text: `Exceso ESTRUCTURAL en ${bs.structuralReds.join(", ")}: el gasto del mes es similar a su promedio histórico, así que el presupuesto está desalineado con la realidad — corresponde re-presupuestar o rediseñar el gasto, no solo "aguantar".`,
          tone: "atencion",
          derivedFrom: ["presupuesto"],
        });
      }
      if (bs.punctualReds.length > 0) {
        budgetP.push({
          text: `Exceso PUNTUAL en ${bs.punctualReds.join(", ")}: fue un pico del mes, no la norma — basta con frenar el resto del mes siguiente.`,
          tone: "neutro",
          derivedFrom: ["presupuesto"],
        });
      }
    }
  }

  // ── Proyecciones ──
  const projP: Paragraph[] = [];
  const ps = intel.projections;
  const byScen = Object.fromEntries(ps.scenarios.map((s) => [s.scenario, s]));
  projP.push({
    text: `Cierre de liquidez proyectado para el próximo mes — conservador: ${fmt(byScen["conservador"].liquidityEndNextMonth)} · esperado: ${fmt(byScen["esperado"].liquidityEndNextMonth)} · optimista: ${fmt(byScen["optimista"].liquidityEndNextMonth)}. Confianza ${ps.confidence}: ${ps.confidenceBasis}. Supuesto del escenario esperado: ${byScen["esperado"].basis}. Esto es una proyección por ritmo real, no una certeza.`,
    tone: byScen["esperado"].liquidityEndNextMonth < 0 ? "riesgo" : "neutro",
    derivedFrom: ["liquidez"],
  });
  // Voz de asesor: cómo usar la proyección según su confianza.
  if (ps.confidence !== "alta") {
    projP.push({
      text: `Con confianza ${ps.confidence}, recomendamos planificar los compromisos del próximo mes con el escenario CONSERVADOR (${fmt(byScen["conservador"].liquidityEndNextMonth)}) y tratar los otros dos como techo, no como base.`,
      tone: "neutro",
      derivedFrom: ["liquidez"],
    });
  }

  // ── Cierre para el directorio: qué esperamos si ejecutamos el plan ──
  const totalDecisionImpact = intel.decisions.reduce((s, d) => s + d.impact, 0);
  const esperado = intel.projections.scenarios.find((s) => s.scenario === "esperado");
  const expectedOutcome: Paragraph = intel.decisions.length > 0
    ? {
        text: `Si ejecutamos el plan de acción, el impacto combinado estimado es ~${fmt(totalDecisionImpact)} (los impactos no son perfectamente aditivos — algunos se traslapan)${esperado ? `; sin actuar, el cierre esperado del próximo mes es ${fmt(esperado.liquidityEndNextMonth)}` : ""}. La diferencia entre actuar y no actuar es la decisión de esta reunión.`,
        tone: "neutro",
        derivedFrom: intel.decisions.map((d) => d.sourceFindingId),
      }
    : {
        text: "Sin acciones urgentes este mes: el plan es sostener el rumbo y vigilar las señales de la lista de vigilancia.",
        tone: "positivo",
        derivedFrom: [],
      };
  const questionParagraphs: Paragraph[] = intel.boardQuestions.map((q, i) => ({
    text: `${i + 1}. ${q.question} — Contexto: ${q.context}`,
    tone: "neutro",
    derivedFrom: [q.sourceFindingId],
  }));

  return {
    cover: {
      statusLine: `${intel.healthScore.level} · ${intel.healthScore.total}/100${topRisk ? ` · riesgo principal: ${topRisk.metric.toLowerCase()}` : " · sin riesgos relevantes"}`,
    },
    executiveSummary: {
      closing,
      achievement: topStrength ? findingParagraph(topStrength, "El mayor logro del mes:", "positivo") : null,
      problem: topProblem ? findingParagraph(topProblem, "El mayor problema:", "riesgo") : null,
      risk: topRisk ? riskParagraph(topRisk) : null,
      opportunity: topOpp ? opportunityParagraph(topOpp) : null,
      keyDecisions: intel.decisions.slice(0, 3).map(decisionParagraph),
    },
    sections: {
      "executive-summary": [closing],
      "month-analysis": analysis,
      strengths: intel.strengths.slice(0, 4).map((s) => findingParagraph(s, "Logro:", "positivo")),
      risks: intel.risks.map(riskParagraph),
      profitability,
      budget: budgetP,
      opportunities: intel.opportunities.map(opportunityParagraph),
      projections: projP,
      "action-plan": intel.decisions.map(decisionParagraph),
    },
    boardClose: {
      expectedOutcome,
      questions: questionParagraphs,
    },
    kpiComments: Object.fromEntries(
      intel.kpis.map((k) => [
        k.id,
        k.id === "flujo"
          ? `${kpiComment(k)} · no es lo mismo que EBITDA: el cobro de una venta de Byte tarda días en llegar al banco`
          : kpiComment(k),
      ]),
    ),
    mitigations: Object.fromEntries(
      intel.risks.map((r) => [r.mitigationId, MITIGATIONS[r.mitigationId] ?? "Revisar con gerencia."]),
    ),
  };
}
