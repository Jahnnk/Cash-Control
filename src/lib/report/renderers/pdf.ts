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

/**
 * CEO DASHBOARD — el mes en UNA página: score, KPIs núcleo como tarjetas,
 * tendencia, riesgo y oportunidad #1, y las 3 decisiones. El directorio
 * que solo lea esta página ya puede discutir.
 */
function ceoDashboardPage(doc: Doc, story: ReportStory, intel: UnitIntelligence): void {
  const n = story.narrative;
  const w = doc.internal.pageSize.getWidth();
  doc.addPage();
  let y = pageHeader(doc, story, "El mes en una página");
  y = sectionTitle(doc, y, "CEO Dashboard");

  // Score + estado (izquierda) — grande, legible en 2 segundos
  doc.setFont("helvetica", "bold").setFontSize(34).setTextColor(
    intel.healthScore.total >= 60 ? BRAND.traffic.verde : intel.healthScore.total >= 40 ? BRAND.traffic.ambar : BRAND.traffic.rojo,
  );
  doc.text(String(intel.healthScore.total), PDF.margin, y + 12);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(BRAND.gray);
  doc.text("Salud del negocio /100", PDF.margin, y + 18);
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(BRAND.ink);
  const statusLines = doc.splitTextToSize(n.cover.statusLine, w - PDF.margin * 2 - 40) as string[];
  doc.text(statusLines, PDF.margin + 38, y + 8);
  y += 26;

  // Tarjetas KPI (los 5 núcleo), con acento de semáforo
  const core = ["ingresos", "ebitda", "margen", "flujo", "liquidez"]
    .map((id) => intel.kpis.find((k) => k.id === id))
    .filter((k): k is NonNullable<typeof k> => Boolean(k));
  const gap = 4;
  const cardW = (w - PDF.margin * 2 - gap * (core.length - 1)) / core.length;
  const cardH = 24;
  core.forEach((k, i) => {
    const x = PDF.margin + i * (cardW + gap);
    doc.setFillColor("#FFFFFF");
    doc.setDrawColor(BRAND.grayLight);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, "FD");
    doc.setFillColor(BRAND.traffic[k.traffic]);
    doc.rect(x, y, 1.6, cardH, "F");
    doc.setFont("helvetica", "normal").setFontSize(6.8).setTextColor(BRAND.gray);
    doc.text(k.label.toUpperCase(), x + 4, y + 5.5);
    doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(BRAND.ink);
    const valTxt = k.unitSuffix === "S/" ? fmtSoles(k.value) : `${k.value.toLocaleString("es-PE")} ${k.unitSuffix}`;
    doc.text(valTxt, x + 4, y + 13);
    if (k.deltaPct !== null) {
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(k.deltaPct >= 0 ? BRAND.traffic.verde : BRAND.traffic.rojo);
      doc.text(`${k.deltaPct >= 0 ? "+" : ""}${k.deltaPct.toFixed(1)}${k.unitSuffix === "%" ? " pts" : "%"}`, x + 4, y + 19.5);
    }
  });
  y += cardH + 8;

  // Tendencia (ventas/EBITDA 4 meses)
  const img = lineChart(intel.series.months, [
    { name: "Ventas", values: intel.series.sales, color: BRAND.primaryLight },
    { name: "EBITDA", values: intel.series.ebitda, color: BRAND.primary },
  ], 900, 300);
  if (img) {
    doc.addImage(img, "PNG", PDF.margin, y, w - PDF.margin * 2, 52);
    y += 58;
  }

  // Riesgo #1 y Oportunidad #1 (una línea cada uno)
  const topRisk = intel.risks[0];
  const topOpp = intel.opportunities[0];
  doc.setFontSize(PDF.body);
  if (topRisk) {
    doc.setFont("helvetica", "bold").setTextColor(BRAND.traffic.rojo);
    doc.text("RIESGO #1", PDF.margin, y);
    doc.setFont("helvetica", "normal").setTextColor(BRAND.ink);
    doc.text(doc.splitTextToSize(`${topRisk.metric} (impacto ${fmtSoles(topRisk.impact)})`, w - PDF.margin * 2 - 30) as string[], PDF.margin + 28, y);
    y += 7;
  }
  if (topOpp) {
    doc.setFont("helvetica", "bold").setTextColor(BRAND.traffic.verde);
    doc.text("OPORT. #1", PDF.margin, y);
    doc.setFont("helvetica", "normal").setTextColor(BRAND.ink);
    doc.text(doc.splitTextToSize(`${topOpp.metric} (impacto ${fmtSoles(topOpp.impact)})`, w - PDF.margin * 2 - 30) as string[], PDF.margin + 28, y);
    y += 9;
  }

  // Las 3 decisiones (compactas)
  doc.setFont("helvetica", "bold").setFontSize(PDF.body).setTextColor(BRAND.primary);
  doc.text("LAS 3 DECISIONES DEL PRÓXIMO MES", PDF.margin, y);
  y += 5.5;
  doc.setFont("helvetica", "normal").setTextColor(BRAND.ink);
  intel.decisions.slice(0, 3).forEach((d, i) => {
    doc.text(doc.splitTextToSize(`${i + 1}. ${d.action} — ${fmtSoles(d.impact)} · ${d.owner} · ${d.timeframe}`, w - PDF.margin * 2) as string[], PDF.margin, y);
    y += 6;
  });
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

  // ── CEO Dashboard: el mes en UNA página ──
  ceoDashboardPage(doc, story, intel);

  // ── 1 · Executive Summary (¿Qué pasó?) ──
  doc.addPage();
  let y = pageHeader(doc, story, "1 · ¿Qué pasó?");
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
  y = pageHeader(doc, story, "1 · ¿Qué pasó?");
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

  // ── 3 · Análisis del mes (¿Por qué pasó?) — incluye "lo que funcionó"
  //      para no repetir una página entera de fortalezas ──
  doc.addPage();
  y = pageHeader(doc, story, "2 · ¿Por qué pasó?");
  y = sectionTitle(doc, y, "Análisis del Mes");
  y = writeParagraphs(doc, story, "2 · ¿Por qué pasó?", y, n.sections["month-analysis"]);
  if (n.sections.strengths.length > 0) {
    y += 3;
    doc.setFont("helvetica", "bold").setFontSize(PDF.body).setTextColor(BRAND.traffic.verde);
    doc.text("LO QUE FUNCIONÓ", PDF.margin, y);
    y += 5;
    y = writeParagraphs(doc, story, "2 · ¿Por qué pasó?", y, n.sections.strengths);
  }

  // ── 5 · Riesgos (¿Qué significa?) ──
  doc.addPage();
  y = pageHeader(doc, story, "3 · ¿Qué significa?");
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
  y = pageHeader(doc, story, "3 · ¿Qué significa?");
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
  y = pageHeader(doc, story, "3 · ¿Qué significa?");
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
  y = pageHeader(doc, story, "4 · ¿Qué haremos?");
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
  y = pageHeader(doc, story, "5 · ¿Qué esperamos?");
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
  y = pageHeader(doc, story, "4 · ¿Qué haremos?");
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

  // ── 11 · CIERRE: Para decisión del directorio ──
  doc.addPage();
  y = pageHeader(doc, story, "Cierre · Para decisión");
  y = sectionTitle(doc, y, "Para Decisión del Directorio");
  autoTable(doc, {
    startY: y,
    head: [["Las 3 decisiones", "Impacto", "Responsable", "Plazo"]],
    body: intel.decisions.slice(0, 3).map((d) => [d.action, fmtSoles(d.impact), d.owner, d.timeframe]),
    margin: { left: PDF.margin, right: PDF.margin },
    headStyles: { fillColor: BRAND.primary },
    styles: { fontSize: 9 },
  });
  y = lastY(doc) + 8;
  doc.setFont("helvetica", "bold").setFontSize(PDF.body).setTextColor(BRAND.primary);
  doc.text("LAS 3 PREGUNTAS QUE ESTA REUNIÓN DEBE RESOLVER", PDF.margin, y);
  y += 5.5;
  y = n.boardClose.questions.length > 0
    ? writeParagraphs(doc, story, "Cierre · Para decisión", y, n.boardClose.questions, " ")
    : writeParagraphs(doc, story, "Cierre · Para decisión", y, [{ text: "Sin preguntas abiertas que requieran acuerdo de socios este mes.", tone: "positivo", derivedFrom: [] }], " ");
  y += 3;
  doc.setFont("helvetica", "bold").setFontSize(PDF.body).setTextColor(BRAND.primary);
  doc.text("QUÉ ESPERAMOS SI ACTUAMOS", PDF.margin, y);
  y += 5.5;
  y = writeParagraphs(doc, story, "Cierre · Para decisión", y, [n.boardClose.expectedOutcome], " ");

  // ── 12+ · Anexos ──
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
