/**
 * PIC · Renderer PDF — el Reporte Comercial para LEER (renderer tonto).
 * Solo lee el PortfolioStory. Marca Yayi's del design system compartido.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { PortfolioStory, Verdict } from "../types";
import { BRAND, PDF, fmtSoles } from "../../report/renderers/design-system";

const VERDICT_LABEL: Record<Verdict, string> = {
  proteger: "Proteger",
  ajustar_precio: "Ajustar precio",
  impulsar: "Impulsar",
  experimentar: "Experimentar",
  revisar: "Revisión estratégica",
  observar: "Observar",
};
const VERDICT_ORDER: Verdict[] = ["proteger", "ajustar_precio", "impulsar", "experimentar", "revisar", "observar"];

function header(doc: jsPDF, story: PortfolioStory, section: string): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(BRAND.primary);
  doc.rect(0, 0, w, PDF.headerH, "F");
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor("#FFFFFF");
  doc.text(`Yayi's · ${story.meta.title}`, PDF.margin, 9);
  doc.setFont("helvetica", "normal");
  doc.text(`${section} · ${story.meta.monthLabel}`, w - PDF.margin, 9, { align: "right" });
  return PDF.headerH + 8;
}

function footer(doc: jsPDF, page: number): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(BRAND.grayLight);
  doc.line(PDF.margin, h - PDF.footerH, w - PDF.margin, h - PDF.footerH);
  doc.setFont("helvetica", "normal").setFontSize(PDF.small).setTextColor(BRAND.gray);
  doc.text("CONFIDENCIAL — solo para uso interno y directorio", PDF.margin, h - 6);
  doc.text(`Reporte Comercial · pág. ${page}`, w - PDF.margin, h - 6, { align: "right" });
}

function title(doc: jsPDF, y: number, text: string): number {
  doc.setFont("helvetica", "bold").setFontSize(PDF.h2).setTextColor(BRAND.primary);
  doc.text(text, PDF.margin, y);
  doc.setDrawColor(BRAND.primaryLight).setLineWidth(0.6);
  doc.line(PDF.margin, y + 2, PDF.margin + 42, y + 2);
  doc.setLineWidth(0.2);
  return y + 9;
}

function paragraphs(doc: jsPDF, y: number, texts: string[], maxW: number): number {
  doc.setFont("helvetica", "normal").setFontSize(PDF.body).setTextColor(BRAND.ink);
  for (const t of texts) {
    const lines = doc.splitTextToSize(t, maxW);
    doc.text(lines, PDF.margin, y);
    y += lines.length * PDF.lineGap + 3;
  }
  return y;
}

export function renderPortfolioPdf(story: PortfolioStory): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const maxW = w - PDF.margin * 2;
  const i = story.intelligence;
  let page = 1;

  // ── Portada ──
  doc.setFillColor(BRAND.primary);
  doc.rect(0, 0, w, doc.internal.pageSize.getHeight(), "F");
  doc.setTextColor("#FFFFFF");
  doc.setFont("helvetica", "normal").setFontSize(11);
  doc.text("YAYI'S — PRODUCT INTELLIGENCE CENTER", w / 2, 80, { align: "center" });
  doc.setFont("helvetica", "bold").setFontSize(30);
  doc.text(story.meta.title, w / 2, 105, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(15);
  doc.text(`Reporte Comercial · ${story.meta.monthLabel}`, w / 2, 118, { align: "center" });
  doc.setFontSize(11);
  doc.text(`Portafolio ${i.health.level} · ${i.health.total}/100`, w / 2, 132, { align: "center" });
  doc.setFontSize(8);
  doc.text("CONFIDENCIAL", w / 2, 270, { align: "center" });

  // ── Página CEO ──
  doc.addPage();
  page++;
  let y = header(doc, story, "Resumen para decidir");
  doc.setFont("helvetica", "bold").setFontSize(34);
  doc.setTextColor(i.health.total >= 55 ? BRAND.primaryLight : BRAND.traffic.ambar);
  doc.text(`${i.health.total}`, PDF.margin, y + 12);
  doc.setFontSize(10).setTextColor(BRAND.ink);
  doc.text(`/100 · portafolio ${i.health.level}`, PDF.margin + 22, y + 12);
  y += 20;
  y = paragraphs(doc, y, [story.narrative.headline], maxW);
  autoTable(doc, {
    startY: y,
    margin: { left: PDF.margin, right: PDF.margin },
    head: [["Componente del score", "Puntos", "Fórmula (auditable)"]],
    body: i.health.components.map((c) => [
      c.label,
      c.score === null ? "—" : String(Math.round(c.score)),
      c.score === null ? (c.unavailableReason ?? "") : c.formula,
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: BRAND.primary },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  y = title(doc, y, "Las decisiones del mes");
  y = paragraphs(doc, y, i.boardDecisions.map((d, n) => `${n + 1}. ${d.decision} (~${fmtSoles(d.impact)}/mes)`), maxW);
  footer(doc, page);

  // ── Resumen del Director Comercial ──
  doc.addPage();
  page++;
  y = header(doc, story, "1 · Cómo está el portafolio");
  y = title(doc, y, "Resumen del Director Comercial");
  y = paragraphs(doc, y, story.narrative.executiveSummary.map((p) => p.text), maxW);
  if (story.narrative.dataCaveat) {
    doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(BRAND.tone.atencion);
    const lines = doc.splitTextToSize(story.narrative.dataCaveat.text, maxW);
    doc.text(lines, PDF.margin, y);
    y += lines.length * 4 + 6;
  }
  y = title(doc, y, "Qué hacer este mes");
  autoTable(doc, {
    startY: y,
    margin: { left: PDF.margin, right: PDF.margin },
    head: [["#", "Acción", "Beneficio/mes", "Costo de no actuar", "Plazo", "Confianza"]],
    body: i.recommendations.map((r) => [
      String(r.priority), r.action, fmtSoles(r.expectedBenefit), r.inactionCost, r.timeframe, r.confidence,
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: BRAND.primary },
    columnStyles: { 1: { cellWidth: 55 }, 3: { cellWidth: 45 } },
  });
  footer(doc, page);

  // ── Veredictos ──
  doc.addPage();
  page++;
  y = header(doc, story, "2 · Veredicto por producto");
  for (const v of VERDICT_ORDER) {
    const group = i.products.filter((p) => p.verdict === v);
    if (group.length === 0) continue;
    if (y > 230) {
      footer(doc, page);
      doc.addPage(); page++;
      y = header(doc, story, "2 · Veredicto por producto");
    }
    y = title(doc, y, `${VERDICT_LABEL[v]} (${group.length})`);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(BRAND.gray);
    const introLines = doc.splitTextToSize(story.narrative.verdictIntro[v], maxW);
    doc.text(introLines, PDF.margin, y);
    y += introLines.length * 3.4 + 2;
    autoTable(doc, {
      startY: y,
      margin: { left: PDF.margin, right: PDF.margin },
      head: [["Producto", "Und", "Venta", "Margen", "ME", "ABC"]],
      body: group.slice(0, 15).map((p) => [
        p.name,
        String(p.units),
        fmtSoles(p.revenue),
        p.marginPct === null ? "s/costo" : `${p.marginPct}%`,
        p.menuEng ?? "—",
        p.abcClass,
      ]),
      styles: { fontSize: 7, cellPadding: 1.2 },
      headStyles: { fillColor: BRAND.primary },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    if (group.length > 15) {
      doc.setFont("helvetica", "italic").setFontSize(7).setTextColor(BRAND.gray);
      doc.text(`… y ${group.length - 15} más (detalle completo en el Excel).`, PDF.margin, y);
      y += 6;
    }
  }
  footer(doc, page);

  // ── Evidencia + calidad de datos ──
  doc.addPage();
  page++;
  y = header(doc, story, "3 · Evidencia y calidad de datos");
  y = title(doc, y, "Evidencia metodológica");
  y = paragraphs(doc, y, [
    `Menu Engineering: ${i.menuEngSummary.stars} stars · ${i.menuEngSummary.plowHorses} plow horses · ${i.menuEngSummary.puzzles} puzzles · ${i.menuEngSummary.dogs} dogs` +
      (i.menuEngSummary.healthyContributionShare !== null ? ` · ${i.menuEngSummary.healthyContributionShare}% de la utilidad viene de productos populares.` : "."),
    `Pareto: ${i.abcSummary.aCount} productos clase A concentran ${i.abcSummary.aRevenueShare}% de la venta (B: ${i.abcSummary.bCount} · C: ${i.abcSummary.cCount}).`,
    `Concentración: top-1 ${i.concentration.top1Share}% · top-3 ${i.concentration.top3Share}%` +
      (i.concentration.topCategory ? ` · categoría líder "${i.concentration.topCategory.name}" (${i.concentration.topCategory.share}%)` : "") +
      ` · riesgo ${i.concentration.severity}.`,
    ...(i.inactiveMethodologies.length > 0
      ? [`Análisis aún inactivos (honestidad): ${i.inactiveMethodologies.map((m) => `${m.id} — ${m.reason}`).join("; ")}.`]
      : []),
  ], maxW);
  y = title(doc, y, "Calidad de datos");
  y = paragraphs(doc, y, [
    `Cobertura de costos: ${i.dataQuality.costCoveragePct}% de la venta (${i.dataQuality.productsWithCost}/${i.dataQuality.productsTotal} productos). ` +
      `${fmtSoles(i.dataQuality.uncostedRevenue)}/mes sin costo conocido.`,
  ], maxW);
  if (i.dataQuality.topUncosted.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: PDF.margin, right: PDF.margin },
      head: [["Producto sin costo (vincular o costear)", "Venta/mes"]],
      body: i.dataQuality.topUncosted.map((u) => [u.name, fmtSoles(u.revenue)]),
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: BRAND.primary },
    });
  }
  footer(doc, page);

  // ── Para Decisión del Directorio ──
  doc.addPage();
  page++;
  y = header(doc, story, "Cierre · Para decisión");
  y = title(doc, y, "Para Decisión del Directorio");
  y = paragraphs(doc, y, i.boardDecisions.map((d, n) => `${n + 1}. ${d.decision} (~${fmtSoles(d.impact)}/mes)`), maxW);
  if (i.boardQuestions.length > 0) {
    y = title(doc, y, "Las preguntas que esta reunión debe resolver");
    y = paragraphs(doc, y, i.boardQuestions.map((q) => `¿${q.question.replace(/^¿/, "")} — ${q.context}`), maxW);
  }
  y = title(doc, y, "Qué esperamos");
  y = paragraphs(doc, y, [story.narrative.boardClose.expectedOutcome.text, story.narrative.boardClose.inactionRisk.text], maxW);
  footer(doc, page);

  const filename = `Yayis-${story.meta.title.replace(/[^a-zA-Z0-9]+/g, "-")}-${story.meta.month}-Reporte-Comercial.pdf`;
  return { blob: doc.output("blob"), filename };
}
