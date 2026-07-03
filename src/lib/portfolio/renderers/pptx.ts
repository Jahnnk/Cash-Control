/**
 * PIC · Renderer PPTX — la presentación comercial para PRESENTAR.
 * Renderer tonto: solo lee el PortfolioStory. ≤8 slides, una pregunta
 * por slide (no es una copia del PDF).
 */

import PptxGenJS from "pptxgenjs";
import type { PortfolioStory } from "../types";
import { BRAND, fmtSoles } from "../../report/renderers/design-system";

const PRIMARY = BRAND.primary.replace("#", "");
const INK = BRAND.ink.replace("#", "");
const GRAY = BRAND.gray.replace("#", "");

function baseSlide(pptx: PptxGenJS, story: PortfolioStory, question: string) {
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape("rect", { x: 0, y: 0, w: 10, h: 0.5, fill: { color: PRIMARY } });
  s.addText(`Yayi's · ${story.meta.title} · Comercial · ${story.meta.monthLabel}`, {
    x: 0.2, y: 0.02, w: 7, h: 0.45, fontSize: 10, color: "FFFFFF", bold: true,
  });
  s.addText("CONFIDENCIAL", { x: 7.8, y: 0.02, w: 2, h: 0.45, fontSize: 9, color: "FFFFFF", align: "right" });
  s.addText(question, { x: 0.4, y: 0.65, w: 9.2, h: 0.6, fontSize: 24, bold: true, color: PRIMARY });
  return s;
}

function productLines(
  s: PptxGenJS.Slide,
  items: { name: string; detail: string }[],
  startY: number,
) {
  items.forEach((it, idx) => {
    const y = startY + idx * 0.62;
    s.addText(it.name, { x: 0.5, y, w: 5.4, h: 0.35, fontSize: 14, bold: true, color: INK });
    s.addText(it.detail, { x: 6.0, y, w: 3.6, h: 0.35, fontSize: 11, color: GRAY, align: "right" });
  });
}

export async function renderPortfolioPptx(story: PortfolioStory): Promise<{ blob: Blob; filename: string }> {
  const i = story.intelligence;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 10, height: 5.625 });
  pptx.layout = "WIDE";

  // 1 · Portada
  const cover = pptx.addSlide();
  cover.background = { color: PRIMARY };
  cover.addText("YAYI'S — REUNIÓN COMERCIAL", { x: 0.5, y: 1.2, w: 9, h: 0.5, fontSize: 14, color: "FFFFFF", align: "center", charSpacing: 3 });
  cover.addText(story.meta.title, { x: 0.5, y: 1.8, w: 9, h: 0.9, fontSize: 40, bold: true, color: "FFFFFF", align: "center" });
  cover.addText(`Portafolio de productos · ${story.meta.monthLabel}`, { x: 0.5, y: 2.8, w: 9, h: 0.5, fontSize: 18, color: "FFFFFF", align: "center" });
  cover.addText(`${i.health.total}/100 · ${i.health.level}`, { x: 0.5, y: 3.5, w: 9, h: 0.5, fontSize: 16, bold: true, color: "FFFFFF", align: "center" });

  // 2 · ¿Cómo está el portafolio?
  const s2 = baseSlide(pptx, story, "¿Cómo está el portafolio?");
  s2.addText(String(i.health.total), { x: 0.4, y: 1.5, w: 2.2, h: 1.2, fontSize: 60, bold: true, color: PRIMARY });
  s2.addText(`/100 · ${i.health.level}`, { x: 2.0, y: 2.15, w: 3, h: 0.5, fontSize: 14, color: GRAY });
  const first = story.narrative.executiveSummary[0]?.text ?? "";
  s2.addText(first, { x: 0.4, y: 3.0, w: 9.2, h: 1.6, fontSize: 14, color: INK, valign: "top" });
  s2.addText(`Cobertura de costos: ${i.health.costCoveragePct}% de la venta`, { x: 0.4, y: 4.9, w: 9.2, h: 0.4, fontSize: 10, italic: true, color: GRAY });

  // 3 · ¿Qué sostiene el negocio?
  const s3 = baseSlide(pptx, story, "¿Qué productos sostienen el negocio?");
  const stars = i.products.filter((p) => p.verdict === "proteger").slice(0, 6);
  if (stars.length === 0) {
    s3.addText("Este mes ningún producto es popular y rentable a la vez — primera alarma.", { x: 0.4, y: 2, w: 9.2, h: 0.6, fontSize: 15, color: INK });
  } else {
    productLines(s3, stars.map((p) => ({
      name: `⭐ ${p.name}`,
      detail: `${p.units} und · ${fmtSoles(p.contribution ?? 0)} utilidad · ${p.marginPct}%`,
    })), 1.5);
    s3.addText("Veredicto: PROTEGER — no tocar precio; cuidar calidad, stock y visibilidad.", { x: 0.4, y: 5.0, w: 9.2, h: 0.4, fontSize: 11, bold: true, color: PRIMARY });
  }

  // 4 · ¿Dónde hay plata dormida?
  const s4 = baseSlide(pptx, story, "¿Dónde hay plata dormida?");
  const puzzles = i.products.filter((p) => p.verdict === "impulsar").slice(0, 6);
  if (puzzles.length === 0) {
    s4.addText("Sin joyas dormidas detectadas este mes.", { x: 0.4, y: 2, w: 9.2, h: 0.6, fontSize: 14, color: GRAY });
  } else {
    productLines(s4, puzzles.map((p) => ({
      name: `🧩 ${p.name}`,
      detail: `solo ${p.units} und · S/${p.unitContribution?.toFixed(2)}/und de contribución`,
    })), 1.5);
    s4.addText("Veredicto: IMPULSAR — vitrina, carta o combos. Cada unidad extra deja más que el promedio.", { x: 0.4, y: 5.0, w: 9.2, h: 0.4, fontSize: 11, bold: true, color: PRIMARY });
  }

  // 5 · ¿Qué precios revisamos?
  const s5 = baseSlide(pptx, story, "¿Qué precios revisamos?");
  const price = i.products.filter((p) => p.verdict === "ajustar_precio").slice(0, 6);
  if (price.length === 0) {
    s5.addText("Sin candidatos de precio este mes.", { x: 0.4, y: 2, w: 9.2, h: 0.6, fontSize: 14, color: GRAY });
  } else {
    productLines(s5, price.map((p) => ({
      name: `🏷 ${p.name}`,
      detail: `${p.units} und · margen ${p.marginPct}%${p.targetMarginPct ? ` (objetivo ${Math.round(p.targetMarginPct * 100)}%)` : ""}`,
    })), 1.5);
    s5.addText("El volumen ya está — falta el precio. El simulador muestra escenarios de volumen antes de decidir.", { x: 0.4, y: 5.0, w: 9.2, h: 0.4, fontSize: 11, bold: true, color: PRIMARY });
  }

  // 6 · ¿Qué nos falta medir?
  const s6 = baseSlide(pptx, story, "¿Qué nos falta medir?");
  s6.addText(
    `Conocemos el costo del ${i.dataQuality.costCoveragePct}% de la venta. ${fmtSoles(i.dataQuality.uncostedRevenue)}/mes sin costo conocido:`,
    { x: 0.4, y: 1.5, w: 9.2, h: 0.5, fontSize: 13, color: INK },
  );
  productLines(s6, i.dataQuality.topUncosted.slice(0, 5).map((u) => ({
    name: u.name,
    detail: `${fmtSoles(u.revenue)}/mes`,
  })), 2.2);
  s6.addText("Vincular (alias) o costear en el pricing-engine — la tarea que más afina este reporte.", { x: 0.4, y: 5.0, w: 9.2, h: 0.4, fontSize: 11, italic: true, color: GRAY });

  // 7 · ¿Qué haremos?
  const s7 = baseSlide(pptx, story, "¿Qué haremos este mes?");
  i.recommendations.slice(0, 4).forEach((r, idx) => {
    const y = 1.4 + idx * 0.95;
    s7.addText(String(r.priority), { x: 0.4, y, w: 0.6, h: 0.6, fontSize: 26, bold: true, color: PRIMARY });
    s7.addText(r.action, { x: 1.1, y, w: 8.3, h: 0.45, fontSize: 14, bold: true, color: INK });
    s7.addText(`~${fmtSoles(r.expectedBenefit)}/mes · ${r.timeframe} · confianza ${r.confidence}`, { x: 1.1, y: y + 0.42, w: 8.3, h: 0.35, fontSize: 10, color: GRAY });
  });

  // 8 · Para decisión
  const s8 = baseSlide(pptx, story, "¿Qué debe resolver esta reunión?");
  i.boardQuestions.forEach((q, idx) => {
    const y = 1.4 + idx * 1.1;
    s8.addText(`${idx + 1}. ${q.question}`, { x: 0.4, y, w: 9.2, h: 0.5, fontSize: 15, bold: true, color: INK });
    s8.addText(q.context, { x: 0.7, y: y + 0.5, w: 8.9, h: 0.45, fontSize: 10.5, color: GRAY, valign: "top" });
  });
  s8.addText(story.narrative.boardClose.expectedOutcome.text, { x: 0.4, y: 4.6, w: 9.2, h: 0.8, fontSize: 11, italic: true, color: GRAY, valign: "top" });

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  const filename = `Yayis-${story.meta.title.replace(/[^a-zA-Z0-9]+/g, "-")}-${story.meta.month}-Comercial-Presentacion.pptx`;
  return { blob, filename };
}
