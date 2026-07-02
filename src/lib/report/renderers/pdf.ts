/**
 * EIRS · Renderer PDF — el Reporte Ejecutivo (Board Report).
 *
 * RENDERER TONTO: recibe SOLO el ReportStory y maqueta. No calcula, no
 * consulta, no interpreta — toda la inteligencia y la prosa vienen del
 * cerebro (un test de imports lo vigila).
 *
 * Estructura: Portada · Executive Summary · Scorecard · Análisis del mes ·
 * Fortalezas · Riesgos · Rentabilidad · Presupuesto · Oportunidades ·
 * Proyecciones · Plan de acción · Anexos.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReportStory, Paragraph, UnitIntelligence } from "../types";
import { BRAND, PDF, fmtSoles, pageHeader, pageFooter, sectionTitle, trafficLabel } from "./design-system";
import { lineChart, barChart } from "./charts";

type Doc = jsPDF;

function lastY(doc: Doc): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
}

/** Escribe párrafos con salto de página automático. Devuelve el y final. */
function writeParagraphs(doc: Doc, story: ReportStory, section: string, y: number, paragraphs: Paragraph[], bullet = "•"): number {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const maxW = w - PDF.margin * 2 - 5;
  doc.setFontSize(PDF.body);
  for (const p of paragraphs) {
    const lines = doc.splitTextToSize(p.text, maxW) as string[];
    const blockH = lines.length * PDF.lineGap + 4;
    if (y + blockH > h - PDF.footerH - 6) {
      doc.addPage();
      y = pageHeader(doc, story, section);
    }
    doc.setFont("helvetica", "normal").setTextColor(BRAND.tone[p.tone] ?? BRAND.ink);
    doc.text(bullet, PDF.margin, y);
    doc.text(lines, PDF.margin + 5, y);
    y += blockH;
  }
  return y;
}

function coverPage(doc: Doc, story: ReportStory, intel: UnitIntelligence): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFillColor(BRAND.primary);
  doc.rect(0, 0, w, h, "F");
  doc.setFillColor(BRAND.primaryLight);
  doc.rect(0, h - 26, w, 26, "F");

  doc.setFont("helvetica", "bold").setTextColor("#FFFFFF");
  doc.setFontSize(11);
  doc.text("YAYI'S — EXECUTIVE INTELLIGENCE REPORT", w / 2, 48, { align: "center" });
  doc.setFontSize(30);
  doc.text(story.meta.title, w / 2, 78, { align: "center" });
  doc.setFontSize(17);
  doc.setFont("helvetica", "normal");
  doc.text(`Reporte Ejecutivo · ${story.meta.monthLabel}`, w / 2, 92, { align: "center" });

  // Score central
  doc.setFontSize(52).setFont("helvetica", "bold");
  doc.text(String(intel.healthScore.total), w / 2, 140, { align: "center" });
  doc.setFontSize(11).setFont("helvetica", "normal");
  doc.text("Salud del negocio / 100", w / 2, 150, { align: "center" });
  doc.setFontSize(12);
  doc.text(story.narrative.cover.statusLine, w / 2, 164, { align: "center" });

  doc.setFontSize(9);
  const gen = new Date(story.meta.generatedAt).toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" });
  doc.text(`Generado automáticamente el ${gen}`, w / 2, h - 40, { align: "center" });
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("CONFIDENCIAL", w / 2, h - 15, { align: "center" });
}

function labeledBlock(doc: Doc, story: ReportStory, section: string, y: number, label: string, p: Paragraph | null): number {
  if (!p) return y;
  const h = doc.internal.pageSize.getHeight();
  if (y > h - PDF.footerH - 30) {
    doc.addPage();
    y = pageHeader(doc, story, section);
  }
  doc.setFont("helvetica", "bold").setFontSize(PDF.body).setTextColor(BRAND.primary);
  doc.text(label.toUpperCase(), PDF.margin, y);
  y += 5;
  return writeParagraphs(doc, story, section, y, [p], " ") + 2;
}

export function renderPdf(story: ReportStory): { blob: Blob; filename: string } {
  const intel = story.intelligence.consolidated ?? story.intelligence.units[0];
  const n = story.narrative;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  // ── Portada ──
  coverPage(doc, story, intel);

  // ── 1 · Executive Summary ──
  doc.addPage();
  let y = pageHeader(doc, story, "Executive Summary");
  y = sectionTitle(doc, y, "Executive Summary");
  y = writeParagraphs(doc, story, "Executive Summary", y, [n.executiveSummary.closing], " ") + 3;
  y = labeledBlock(doc, story, "Executive Summary", y, "Mayor logro", n.executiveSummary.achievement);
  y = labeledBlock(doc, story, "Executive Summary", y, "Mayor problema", n.executiveSummary.problem);
  y = labeledBlock(doc, story, "Executive Summary", y, "Principal riesgo", n.executiveSummary.risk);
  y = labeledBlock(doc, story, "Executive Summary", y, "Principal oportunidad", n.executiveSummary.opportunity);
  if (n.executiveSummary.keyDecisions.length > 0) {
    doc.setFont("helvetica", "bold").setFontSize(PDF.body).setTextColor(BRAND.primary);
    doc.text("LAS DECISIONES DEL PRÓXIMO MES", PDF.margin, y);
    y += 5;
    y = writeParagraphs(doc, story, "Executive Summary", y, n.executiveSummary.keyDecisions, " ");
  }

  // ── 2 · Scorecard ──
  doc.addPage();
  y = pageHeader(doc, story, "Scorecard Ejecutivo");
  y = sectionTitle(doc, y, "Scorecard Ejecutivo");
  autoTable(doc, {
    startY: y,
    head: [["KPI", "Valor", "Variación", "Estado", "Lectura"]],
    body: intel.kpis.map((k) => [
      k.label,
      k.unitSuffix === "S/" ? fmtSoles(k.value) : `${k.value.toLocaleString("es-PE")} ${k.unitSuffix}`,
      k.deltaPct !== null ? `${k.deltaPct >= 0 ? "+" : ""}${k.deltaPct.toFixed(1)}${k.unitSuffix === "%" ? " pts" : "%"}` : "—",
      trafficLabel(k.traffic),
      n.kpiComments[k.id] ?? "",
    ]),
    margin: { left: PDF.margin, right: PDF.margin },
    headStyles: { fillColor: BRAND.primary },
    styles: { fontSize: 8.5 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const k = intel.kpis[data.row.index];
        data.cell.styles.textColor = BRAND.traffic[k.traffic];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ── 3 · Análisis del mes ──
  doc.addPage();
  y = pageHeader(doc, story, "Análisis del Mes");
  y = sectionTitle(doc, y, "Análisis del Mes");
  y = writeParagraphs(doc, story, "Análisis del Mes", y, n.sections["month-analysis"]);

  // ── 4 · Fortalezas ──
  doc.addPage();
  y = pageHeader(doc, story, "Fortalezas");
  y = sectionTitle(doc, y, "Fortalezas del Mes");
  y = n.sections.strengths.length > 0
    ? writeParagraphs(doc, story, "Fortalezas", y, n.sections.strengths)
    : writeParagraphs(doc, story, "Fortalezas", y, [{ text: "Sin logros destacables frente al mes anterior.", tone: "neutro", derivedFrom: [] }]);

  // ── 5 · Riesgos (con mitigación) ──
  doc.addPage();
  y = pageHeader(doc, story, "Riesgos");
  y = sectionTitle(doc, y, "Riesgos (ordenados por gravedad e impacto)");
  if (intel.risks.length === 0) {
    y = writeParagraphs(doc, story, "Riesgos", y, [{ text: "Sin riesgos relevantes detectados este mes.", tone: "positivo", derivedFrom: [] }]);
  } else {
    intel.risks.forEach((r, i) => {
      const p = n.sections.risks[i];
      if (p) y = writeParagraphs(doc, story, "Riesgos", y, [p]);
      const mit = n.mitigations[r.mitigationId];
      if (mit) {
        y = writeParagraphs(doc, story, "Riesgos", y, [{ text: `Mitigación recomendada: ${mit}`, tone: "neutro", derivedFrom: [r.id] }], "→") + 1;
      }
    });
  }

  // ── 6 · Rentabilidad (con gráfico de tendencia) ──
  doc.addPage();
  y = pageHeader(doc, story, "Rentabilidad");
  y = sectionTitle(doc, y, "Análisis de Rentabilidad");
  const trendImg = lineChart(intel.series.months, [
    { name: "Ventas", values: intel.series.sales, color: BRAND.primaryLight },
    { name: "EBITDA", values: intel.series.ebitda, color: BRAND.primary },
  ]);
  if (trendImg) {
    doc.addImage(trendImg, "PNG", PDF.margin, y, w - PDF.margin * 2, 62);
    y += 68;
  }
  y = writeParagraphs(doc, story, "Rentabilidad", y, n.sections.profitability);
  autoTable(doc, {
    startY: y + 2,
    head: [["Mes", "Ventas", "Gastos operativos", "EBITDA", "Margen"]],
    body: intel.series.months.map((m, i) => [
      m,
      fmtSoles(intel.series.sales[i]),
      fmtSoles(intel.series.sales[i] - intel.series.ebitda[i]),
      fmtSoles(intel.series.ebitda[i]),
      `${intel.series.margin[i].toFixed(1)}%`,
    ]),
    margin: { left: PDF.margin, right: PDF.margin },
    headStyles: { fillColor: BRAND.primary },
    styles: { fontSize: 8.5 },
  });

  // ── 7 · Presupuesto ──
  const unitWithBudget = story.facts.units.find((u) => u.budget.length > 0);
  doc.addPage();
  y = pageHeader(doc, story, "Presupuesto");
  y = sectionTitle(doc, y, "Ejecución Presupuestal");
  y = n.sections.budget.length > 0
    ? writeParagraphs(doc, story, "Presupuesto", y, n.sections.budget)
    : writeParagraphs(doc, story, "Presupuesto", y, [{ text: "Esta unidad no tiene presupuesto con semáforo configurado.", tone: "neutro", derivedFrom: [] }]);
  if (unitWithBudget && story.meta.scopeKind === "unit") {
    autoTable(doc, {
      startY: y + 2,
      head: [["Categoría", "Presupuesto", "Gastado", "Estado"]],
      body: unitWithBudget.budget.map((b) => [
        b.category, fmtSoles(b.budgetSoles), fmtSoles(b.spent),
        trafficLabel(b.color === "red" ? "rojo" : b.color === "yellow" ? "ambar" : "verde"),
      ]),
      margin: { left: PDF.margin, right: PDF.margin },
      headStyles: { fillColor: BRAND.primary },
      styles: { fontSize: 8.5 },
    });
  }

  // ── 8 · Oportunidades ──
  doc.addPage();
  y = pageHeader(doc, story, "Oportunidades");
  y = sectionTitle(doc, y, "Top Oportunidades");
  if (intel.opportunities.length === 0) {
    y = writeParagraphs(doc, story, "Oportunidades", y, [{ text: "Sin oportunidades detectadas con los datos del mes.", tone: "neutro", derivedFrom: [] }]);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Oportunidad", "Impacto", "Prioridad", "Dificultad", "Plazo"]],
      body: intel.opportunities.map((o) => [o.metric, fmtSoles(o.impact), `P${o.priority}`, o.ease, o.timeframe]),
      margin: { left: PDF.margin, right: PDF.margin },
      headStyles: { fillColor: BRAND.primary },
      styles: { fontSize: 8.5 },
    });
    y = lastY(doc) + 8;
    y = writeParagraphs(doc, story, "Oportunidades", y, n.sections.opportunities);
  }

  // ── 9 · Proyecciones ──
  doc.addPage();
  y = pageHeader(doc, story, "Proyecciones");
  y = sectionTitle(doc, y, "Proyecciones del Próximo Mes");
  const projImg = barChart(
    intel.projections.scenarios.map((s) => ({
      label: s.scenario,
      value: s.liquidityEndNextMonth,
      color: s.scenario === "esperado" ? BRAND.primaryLight : s.scenario === "conservador" ? BRAND.traffic.ambar : BRAND.gray,
    })),
  );
  if (projImg) {
    doc.addImage(projImg, "PNG", PDF.margin, y, w - PDF.margin * 2, 58);
    y += 64;
  }
  y = writeParagraphs(doc, story, "Proyecciones", y, n.sections.projections);
  autoTable(doc, {
    startY: y + 2,
    head: [["Escenario", "Liquidez proyectada", "Flujo supuesto", "Base del supuesto"]],
    body: intel.projections.scenarios.map((s) => [s.scenario, fmtSoles(s.liquidityEndNextMonth), fmtSoles(s.monthlyNetFlow), s.basis]),
    margin: { left: PDF.margin, right: PDF.margin },
    headStyles: { fillColor: BRAND.primary },
    styles: { fontSize: 8 },
  });

  // ── 10 · Plan de acción ──
  doc.addPage();
  y = pageHeader(doc, story, "Plan de Acción");
  y = sectionTitle(doc, y, "Plan de Acción (máx. 5, por impacto)");
  autoTable(doc, {
    startY: y,
    head: [["#", "Acción", "Impacto", "Responsable", "Plazo"]],
    body: intel.decisions.map((d, i) => [String(i + 1), d.action, fmtSoles(d.impact), d.owner, d.timeframe]),
    margin: { left: PDF.margin, right: PDF.margin },
    headStyles: { fillColor: BRAND.primary },
    styles: { fontSize: 9 },
  });
  y = lastY(doc) + 8;
  y = writeParagraphs(doc, story, "Plan de Acción", y, n.sections["action-plan"]);

  // ── 11+ · Anexos ──
  for (const u of story.facts.units) {
    doc.addPage();
    y = pageHeader(doc, story, `Anexo · ${u.unit.name}`);
    y = sectionTitle(doc, y, `Anexo — ${u.unit.name}`);
    doc.setFont("helvetica", "normal").setFontSize(PDF.small).setTextColor(BRAND.gray);
    doc.text(
      `Movimientos del mes: ${u.annex.movementCounts.incomes} ingresos · ${u.annex.movementCounts.expenses} egresos. Todo dato de este reporte es rastreable a estos registros.`,
      PDF.margin, y,
    );
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Gasto por categoría", "Monto", "% del gasto op."]],
      body: u.annex.expensesByCategory.map((c) => [c.category, fmtSoles(c.amount), `${c.share.toFixed(1)}%`]),
      margin: { left: PDF.margin, right: PDF.margin },
      headStyles: { fillColor: BRAND.primary },
      styles: { fontSize: 8 },
    });
    autoTable(doc, {
      startY: lastY(doc) + 6,
      head: [["Top 20 gastos del mes", "Categoría", "Fecha", "Monto"]],
      body: u.annex.topExpenses.map((t) => [t.concept, t.category, t.date, fmtSoles(t.amount)]),
      margin: { left: PDF.margin, right: PDF.margin },
      headStyles: { fillColor: BRAND.primary },
      styles: { fontSize: 8 },
    });
  }

  // ── Pies de página ──
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    pageFooter(doc, p, `${story.meta.title} · ${story.meta.monthLabel}`);
  }

  const filename = `Yayis-${story.meta.title.replace(/[^a-zA-Z0-9]+/g, "-")}-${story.meta.month}-Reporte-Ejecutivo.pdf`;
  return { blob: doc.output("blob"), filename };
}
