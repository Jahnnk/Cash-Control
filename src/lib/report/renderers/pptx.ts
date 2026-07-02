/**
 * EIRS · Renderer PPTX — la presentación para PRESENTAR (no copia el PDF).
 *
 * RENDERER TONTO: solo lee el ReportStory. Máximo 10 diapositivas, muy
 * visuales, poco texto: cada una responde UNA pregunta del directorio.
 *   1 Portada · 2 ¿Cómo terminó el mes? · 3 ¿Qué cambió? · 4 ¿Qué nos
 *   preocupa? · 5 ¿Qué oportunidades hay? · 6 ¿Qué haremos? · 7 ¿Qué
 *   esperamos? · 8 ¿Qué debe resolver el directorio? · 9 Conclusiones.
 */

import PptxGenJS from "pptxgenjs";
import type { ReportStory, UnitIntelligence } from "../types";
import { BRAND, fmtSoles } from "./design-system";
import { lineChart, barChart } from "./charts";

const INK = BRAND.ink.replace("#", "");
const GRAY = BRAND.gray.replace("#", "");
const PRIMARY = BRAND.primary.replace("#", "");
const PRIMARY_LIGHT = BRAND.primaryLight.replace("#", "");
const c = (hex: string) => hex.replace("#", "");

function baseSlide(pptx: PptxGenJS, story: ReportStory, question: string) {
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape("rect", { x: 0, y: 0, w: 10, h: 0.5, fill: { color: PRIMARY } });
  s.addText(`Yayi's · ${story.meta.title} · ${story.meta.monthLabel}`, {
    x: 0.2, y: 0.02, w: 6, h: 0.45, fontSize: 10, color: "FFFFFF", bold: true,
  });
  s.addText("CONFIDENCIAL", { x: 7.8, y: 0.02, w: 2, h: 0.45, fontSize: 9, color: "FFFFFF", align: "right" });
  s.addText(question, { x: 0.4, y: 0.65, w: 9.2, h: 0.6, fontSize: 24, bold: true, color: PRIMARY });
  return s;
}

export async function renderPptx(story: ReportStory): Promise<{ blob: Blob; filename: string }> {
  const intel: UnitIntelligence = story.intelligence.consolidated ?? story.intelligence.units[0];
  const n = story.narrative;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 10, height: 5.625 });
  pptx.layout = "WIDE";

  // ── 1 · Portada ──
  const cover = pptx.addSlide();
  cover.background = { color: PRIMARY };
  cover.addText("YAYI'S — BOARD MEETING", { x: 0.5, y: 1.2, w: 9, h: 0.5, fontSize: 14, color: "FFFFFF", align: "center", charSpacing: 3 });
  cover.addText(story.meta.title, { x: 0.5, y: 1.8, w: 9, h: 0.9, fontSize: 40, bold: true, color: "FFFFFF", align: "center" });
  cover.addText(`Reporte Ejecutivo · ${story.meta.monthLabel}`, { x: 0.5, y: 2.8, w: 9, h: 0.5, fontSize: 18, color: "FFFFFF", align: "center" });
  cover.addText(`${intel.healthScore.total}/100 · ${intel.healthScore.level}`, { x: 0.5, y: 3.5, w: 9, h: 0.5, fontSize: 16, bold: true, color: "FFFFFF", align: "center" });
  cover.addText("CONFIDENCIAL", { x: 0.5, y: 5.0, w: 9, h: 0.4, fontSize: 10, color: "FFFFFF", align: "center" });

  // ── 2 · ¿Cómo terminó el mes? ──
  const s2 = baseSlide(pptx, story, "¿Cómo terminó el mes?");
  const core = ["ingresos", "ebitda", "margen", "liquidez"]
    .map((id) => intel.kpis.find((k) => k.id === id))
    .filter((k): k is NonNullable<typeof k> => Boolean(k));
  core.forEach((k, i) => {
    const x = 0.4 + i * 2.35;
    s2.addShape("roundRect", { x, y: 1.5, w: 2.2, h: 1.5, fill: { color: "F8FAF9" }, line: { color: c(BRAND.grayLight) }, rectRadius: 0.05 });
    s2.addShape("rect", { x, y: 1.5, w: 0.07, h: 1.5, fill: { color: c(BRAND.traffic[k.traffic]) } });
    s2.addText(k.label.toUpperCase(), { x: x + 0.15, y: 1.6, w: 2, h: 0.3, fontSize: 10, color: GRAY });
    s2.addText(k.unitSuffix === "S/" ? fmtSoles(k.value) : `${k.value.toLocaleString("es-PE")} ${k.unitSuffix}`, { x: x + 0.15, y: 1.95, w: 2, h: 0.45, fontSize: 17, bold: true, color: INK });
    if (k.deltaPct !== null) {
      s2.addText(`${k.deltaPct >= 0 ? "+" : ""}${k.deltaPct.toFixed(1)}${k.unitSuffix === "%" ? " pts" : "%"}`, {
        x: x + 0.15, y: 2.5, w: 2, h: 0.3, fontSize: 11, bold: true,
        color: c(k.deltaPct >= 0 ? BRAND.traffic.verde : BRAND.traffic.rojo),
      });
    }
  });
  s2.addText(n.executiveSummary.closing.text, { x: 0.4, y: 3.4, w: 9.2, h: 1.6, fontSize: 13, color: INK, valign: "top" });

  // ── 3 · ¿Qué cambió? ──
  const s3 = baseSlide(pptx, story, "¿Qué cambió?");
  const trend = lineChart(intel.series.months, [
    { name: "Ventas", values: intel.series.sales, color: BRAND.primaryLight },
    { name: "EBITDA", values: intel.series.ebitda, color: BRAND.primary },
  ], 1400, 520);
  if (trend) s3.addImage({ data: trend, x: 0.4, y: 1.4, w: 9.2, h: 3.0 });
  const changed = n.sections["month-analysis"][1] ?? n.sections["month-analysis"][0];
  if (changed) s3.addText(changed.text, { x: 0.4, y: 4.5, w: 9.2, h: 0.9, fontSize: 12, color: INK, valign: "top" });

  // ── 4 · ¿Qué nos preocupa? ──
  const s4 = baseSlide(pptx, story, "¿Qué nos preocupa?");
  if (intel.risks.length === 0) {
    s4.addText("Sin riesgos relevantes este mes.", { x: 0.4, y: 2, w: 9.2, h: 0.6, fontSize: 16, color: c(BRAND.traffic.verde), bold: true });
  } else {
    intel.risks.slice(0, 3).forEach((r, i) => {
      const y = 1.5 + i * 1.25;
      s4.addShape("roundRect", { x: 0.4, y, w: 9.2, h: 1.1, fill: { color: r.severity === "alta" ? "FEF2F2" : "FFFBEB" }, line: { color: r.severity === "alta" ? "FECACA" : "FDE68A" }, rectRadius: 0.05 });
      s4.addText(`${r.severity.toUpperCase()} · ${r.metric}`, { x: 0.6, y: y + 0.08, w: 8.8, h: 0.35, fontSize: 13, bold: true, color: c(r.severity === "alta" ? BRAND.traffic.rojo : BRAND.traffic.ambar) });
      s4.addText(`Impacto ${fmtSoles(r.impact)} · Mitigación: ${n.mitigations[r.mitigationId] ?? ""}`, { x: 0.6, y: y + 0.45, w: 8.8, h: 0.6, fontSize: 10.5, color: INK, valign: "top" });
    });
  }

  // ── 5 · ¿Qué oportunidades hay? ──
  const s5 = baseSlide(pptx, story, "¿Qué oportunidades hay?");
  if (intel.opportunities.length === 0) {
    s5.addText("Sin oportunidades detectadas con los datos del mes.", { x: 0.4, y: 2, w: 9.2, h: 0.6, fontSize: 14, color: GRAY });
  } else {
    const rows: PptxGenJS.TableRow[] = [
      [
        { text: "Oportunidad", options: { bold: true, color: "FFFFFF", fill: { color: PRIMARY } } },
        { text: "Impacto", options: { bold: true, color: "FFFFFF", fill: { color: PRIMARY } } },
        { text: "Prioridad", options: { bold: true, color: "FFFFFF", fill: { color: PRIMARY } } },
        { text: "Plazo", options: { bold: true, color: "FFFFFF", fill: { color: PRIMARY } } },
      ],
      ...intel.opportunities.slice(0, 5).map((o): PptxGenJS.TableRow => [
        { text: o.metric }, { text: fmtSoles(o.impact) }, { text: `P${o.priority}` }, { text: o.timeframe },
      ]),
    ];
    s5.addTable(rows, { x: 0.4, y: 1.5, w: 9.2, fontSize: 11, color: INK, border: { pt: 0.5, color: c(BRAND.grayLight) }, autoPage: false });
  }

  // ── 6 · ¿Qué haremos? ──
  const s6 = baseSlide(pptx, story, "¿Qué haremos?");
  intel.decisions.slice(0, 3).forEach((d, i) => {
    const y = 1.5 + i * 1.2;
    s6.addText(String(i + 1), { x: 0.4, y, w: 0.7, h: 0.7, fontSize: 28, bold: true, color: PRIMARY_LIGHT });
    s6.addText(d.action, { x: 1.2, y, w: 8.2, h: 0.5, fontSize: 16, bold: true, color: INK });
    s6.addText(`Impacto ${fmtSoles(d.impact)} · ${d.owner} · ${d.timeframe}`, { x: 1.2, y: y + 0.5, w: 8.2, h: 0.4, fontSize: 11, color: GRAY });
  });

  // ── 7 · ¿Qué esperamos? ──
  const s7 = baseSlide(pptx, story, "¿Qué esperamos del próximo mes?");
  const proj = barChart(intel.projections.scenarios.map((sc) => ({
    label: sc.scenario, value: sc.liquidityEndNextMonth,
    color: sc.scenario === "esperado" ? BRAND.primaryLight : sc.scenario === "conservador" ? BRAND.traffic.ambar : BRAND.gray,
  })), 1200, 460);
  if (proj) s7.addImage({ data: proj, x: 0.9, y: 1.4, w: 8.2, h: 2.9 });
  s7.addText(`Confianza ${intel.projections.confidence}: ${intel.projections.confidenceBasis}. Proyección por ritmo real, no una certeza.`, {
    x: 0.4, y: 4.5, w: 9.2, h: 0.8, fontSize: 12, color: GRAY, valign: "top",
  });

  // ── 8 · ¿Qué debe resolver el directorio? ──
  const s8 = baseSlide(pptx, story, "¿Qué debe resolver esta reunión?");
  if (intel.boardQuestions.length === 0) {
    s8.addText("Sin preguntas abiertas que requieran acuerdo de socios.", { x: 0.4, y: 2, w: 9.2, h: 0.6, fontSize: 14, color: c(BRAND.traffic.verde) });
  } else {
    intel.boardQuestions.forEach((q, i) => {
      const y = 1.5 + i * 1.25;
      s8.addText(`${i + 1}. ${q.question}`, { x: 0.4, y, w: 9.2, h: 0.55, fontSize: 15, bold: true, color: INK });
      s8.addText(q.context, { x: 0.7, y: y + 0.55, w: 8.9, h: 0.5, fontSize: 10.5, color: GRAY, valign: "top" });
    });
  }

  // ── 9 · Conclusiones ──
  const s9 = baseSlide(pptx, story, "Conclusiones");
  s9.addText(n.boardClose.expectedOutcome.text, { x: 0.4, y: 1.6, w: 9.2, h: 1.6, fontSize: 14, color: INK, valign: "top" });
  s9.addText("Todo dato de esta presentación es rastreable a los registros del sistema (ver Reporte Ejecutivo y Excel Gerencial).", {
    x: 0.4, y: 4.6, w: 9.2, h: 0.6, fontSize: 10, italic: true, color: GRAY,
  });

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  const filename = `Yayis-${story.meta.title.replace(/[^a-zA-Z0-9]+/g, "-")}-${story.meta.month}-Presentacion.pptx`;
  return { blob, filename };
}
