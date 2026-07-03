/**
 * PIC · Capa narrativa (Fase 1) — la voz del DIRECTOR COMERCIAL.
 *
 * REGLA ESTRUCTURAL: esta capa solo puede leer la INTELIGENCIA (la firma
 * lo fuerza y un test guardián revisa los imports). Nunca inventa cifras:
 * cada párrafo lleva derivedFrom con las señales/recomendaciones de origen.
 * Estilo asesor: "Recomendamos…", nunca descripciones impersonales.
 */

import type {
  PortfolioIntelligence,
  PortfolioNarrative,
  PicParagraph,
  Verdict,
} from "./types";

const fmt = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

export function buildPortfolioNarrative(intel: PortfolioIntelligence): PortfolioNarrative {
  const paragraphs: PicParagraph[] = [];
  const h = intel.health;

  // — Cómo está el portafolio —
  const stars = intel.products.filter((p) => p.verdict === "proteger");
  const totalRevenue = intel.products.reduce((s, p) => s + p.revenue, 0);
  const totalContribution = intel.products.reduce((s, p) => s + (p.contribution ?? 0), 0);
  paragraphs.push({
    text:
      `El portafolio está ${h.level} (${h.total}/100). Vendió ${fmt(totalRevenue)} en ${intel.products.length} productos ` +
      `y la parte costeada dejó ${fmt(totalContribution)} de utilidad de contribución. ` +
      (stars.length > 0
        ? `Lo sostienen ${stars.slice(0, 3).map((p) => p.name).join(", ")}${stars.length > 3 ? ` y ${stars.length - 3} más` : ""}: populares y rentables a la vez.`
        : "Este mes no hay productos que sean populares y rentables a la vez — esa es la primera alarma."),
    tone: h.total >= 55 ? "positivo" : "atencion",
    derivedFrom: stars.slice(0, 3).flatMap((p) => p.drivers),
  });

  // — Concentración —
  const conc = intel.concentration;
  if (conc.severity !== "baja") {
    paragraphs.push({
      text:
        `Atención con la dependencia: el top-3 concentra el ${conc.top3Share}% de la venta` +
        (conc.topCategory ? ` y la categoría "${conc.topCategory.name}" pesa ${conc.topCategory.share}%` : "") +
        `. Recomendamos desarrollar la segunda línea antes de que un quiebre de stock o un alza de insumo golpee el mes entero.`,
      tone: conc.severity === "alta" ? "riesgo" : "atencion",
      derivedFrom: ["sig-concentracion"],
    });
  }

  // — La oportunidad #1 —
  const rec1 = intel.recommendations[0];
  if (rec1) {
    paragraphs.push({
      text: `La jugada del mes: ${rec1.action.toLowerCase()}. ${rec1.why} Beneficio estimado ${fmt(rec1.expectedBenefit)}/mes; no actuar cuesta ${rec1.inactionCost}.`,
      tone: "neutro",
      derivedFrom: [rec1.id, ...rec1.sourceSignalIds],
    });
  }

  // — Honestidad de datos —
  const dq = intel.dataQuality;
  const dataCaveat: PicParagraph | null =
    dq.costCoveragePct < 90
      ? {
          text:
            `Transparencia: conocemos el costo del ${dq.costCoveragePct}% de la venta (${dq.productsWithCost}/${dq.productsTotal} productos). ` +
            `${fmt(dq.uncostedRevenue)} se analizan solo por venta — sus veredictos quedan en "observar" hasta costearlos. ` +
            `Ningún número de margen de este reporte está inventado.`,
          tone: "atencion",
          derivedFrom: intel.signals.filter((s) => s.methodology === "calidad-datos").map((s) => s.id),
        }
      : null;

  const headline =
    `Portafolio ${h.level} (${h.total}/100) · ` +
    (rec1 ? `prioridad: ${rec1.action.toLowerCase()}` : "sin acciones urgentes este mes");

  const verdictIntro: Record<Verdict, string> = {
    proteger: "Las estrellas: populares y rentables. No les toques el precio; cuida calidad, stock y visibilidad.",
    impulsar: "Margen alto con poca rotación: cada unidad extra deja más que el promedio. Dales vitrina, carta o combo.",
    ajustar_precio: "Populares que dejan poco: el volumen ya está — recomendamos revisar precio (o costo de receta).",
    experimentar: "Venden plata con mala contribución relativa: reposicionar (presentación, porción, combo) antes que retirar.",
    revisar: "Candidatos a revisión estratégica. Nunca recomendamos eliminar por vender poco: pueden quedarse por imagen, experiencia o cross-selling — esa decisión es tuya.",
    observar: "Sin señal fuerte o sin costo conocido todavía — se analizan por venta mientras se completa el dato.",
  };

  const totalBenefit = intel.recommendations.reduce((s, r) => s + r.expectedBenefit, 0);
  return {
    headline,
    executiveSummary: paragraphs,
    dataCaveat,
    verdictIntro,
    boardClose: {
      expectedOutcome: {
        text:
          intel.recommendations.length > 0
            ? `Si ejecutamos el plan completo, el beneficio estimado combinado es ~${fmt(totalBenefit)}/mes (los impactos no son perfectamente aditivos). La diferencia entre actuar y no actuar es la decisión de esta reunión.`
            : "Sin acciones cuantificadas este mes: mantener el rumbo y alimentar el sistema con el siguiente mes de ventas.",
        tone: "neutro",
        derivedFrom: intel.recommendations.map((r) => r.id),
      },
      inactionRisk: {
        text:
          intel.concentration.severity !== "baja"
            ? `El mayor riesgo de no actuar: la dependencia del top-3 (${intel.concentration.top3Share}% de la venta) sigue creciendo sin segunda línea desarrollada.`
            : `El mayor costo de no actuar: el margen no capturado en productos populares y la utilidad dormida en los de alta contribución.`,
        tone: "riesgo",
        derivedFrom: ["sig-concentracion"],
      },
    },
  };
}
