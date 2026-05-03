import type { ReportData } from "@/app/actions/export-report";
import { renderChartToPng } from "./charts";

const PRIMARY = "#004C40";
const PRIMARY_LIGHT = "#098B5F";
const CREAM = "#F9F6EB";
const TEXT = "#1F2937";
const MUTED = "#6B7280";

const fmtMoney = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => n.toFixed(1) + "%";

const PIE_COLORS = ["#004C40", "#098B5F", "#22C55E", "#EAB308", "#F97316", "#DC2626", "#8B5CF6", "#3B82F6", "#EC4899", "#6B7280", "#14B8A6", "#A855F7", "#F59E0B"];

export async function generatePdf(data: ReportData, filename: string): Promise<void> {
  const { default: jsPDFCtor } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDFCtor({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  let pageNum = 0;

  function addPageHeader() {
    pageNum++;
    doc.setFillColor(PRIMARY);
    doc.rect(0, 0, pageW, 14, "F");
    doc.setTextColor("#FFFFFF");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Yayi's · Cash Control", margin, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(data.period.label, pageW - margin, 9, { align: "right" });

    // Footer
    doc.setTextColor(MUTED);
    doc.setFontSize(8);
    doc.text(`Yayi's · Atelier · Cajamarca, Perú`, margin, pageH - 6);
    doc.text(`Página ${pageNum}`, pageW - margin, pageH - 6, { align: "right" });

    doc.setTextColor(TEXT);
  }

  function addNewPage() {
    doc.addPage();
    addPageHeader();
  }

  // ════════════════════════ PÁGINA 1: PORTADA ════════════════════════
  addPageHeader();
  let y = 30;

  doc.setTextColor(PRIMARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("REPORTE EJECUTIVO", margin, y);
  y += 8;
  doc.setFontSize(13);
  doc.setTextColor(PRIMARY_LIGHT);
  doc.setFont("helvetica", "normal");
  doc.text(`Atelier · ${data.period.label}`, margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(`Generado: ${new Date(data.generatedAt).toLocaleString("es-PE")}`, margin, y);
  y += 10;

  // KPIs grid 2x3
  const kpis = [
    { label: "Ingresos ajustados", value: fmtMoney(data.summary.incomeAdjusted), color: PRIMARY_LIGHT },
    { label: "EBITDA ajustado", value: fmtMoney(data.summary.ebitda), color: data.summary.ebitda >= 0 ? PRIMARY_LIGHT : "#DC2626" },
    { label: "Margen EBITDA", value: fmtPct(data.summary.ebitdaMargin), color: PRIMARY },
    { label: "Saldo banco al cierre", value: fmtMoney(data.summary.bankEnd), color: PRIMARY },
    { label: "Egresos operativos", value: fmtMoney(data.summary.expensesOperative), color: "#DC2626" },
    { label: "Por cobrar (Fonavi+B2B)", value: fmtMoney(data.summary.fonaviReceivablesAtEnd + data.summary.b2bReceivablesAtEnd), color: "#8B5CF6" },
  ];
  const colW = (pageW - margin * 2 - 6) / 3;
  const cardH = 22;
  for (let i = 0; i < kpis.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = margin + col * (colW + 3);
    const yy = y + row * (cardH + 4);
    doc.setFillColor(CREAM);
    doc.roundedRect(x, yy, colW, cardH, 2, 2, "F");
    doc.setTextColor(MUTED);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(kpis[i].label, x + 3, yy + 6);
    doc.setTextColor(kpis[i].color);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(kpis[i].value, x + 3, yy + 16);
  }
  y += cardH * 2 + 14;

  // Resumen narrativo
  doc.setTextColor(PRIMARY);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Resumen del período", margin, y);
  y += 5;
  doc.setTextColor(TEXT);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const topCat = data.byCategory[0];
  const narrative = [
    `El período generó ${fmtMoney(data.summary.incomeAdjusted)} en ingresos operativos con un EBITDA de ${fmtMoney(data.summary.ebitda)} (${fmtPct(data.summary.ebitdaMargin)} de margen).`,
    topCat ? `Los egresos se concentraron en "${topCat.category}" (${fmtMoney(topCat.totalAtelier)}, ${fmtPct(topCat.pct)} del total).` : "",
    `El saldo del banco cerró en ${fmtMoney(data.summary.bankEnd)} (variación ${data.summary.bankDelta >= 0 ? "+" : ""}${fmtMoney(data.summary.bankDelta)}).`,
    data.summary.fonaviReceivablesAtEnd > 0 ? `Quedan ${fmtMoney(data.summary.fonaviReceivablesAtEnd)} por cobrar a Fonavi.` : "",
  ].filter(Boolean);
  for (const line of narrative) {
    const wrapped = doc.splitTextToSize(line, pageW - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 5;
  }

  // ════════════════════════ PÁGINA 2: ESTADO DE RESULTADOS ════════════════════════
  addNewPage();
  y = 22;
  doc.setTextColor(PRIMARY);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Estado de resultados", margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Concepto", "Monto"]],
    body: [
      ["Ingresos brutos", fmtMoney(data.summary.incomeGross)],
      ["(-) Reembolsos Fonavi", fmtMoney(-data.summary.fonaviReimbursements)],
      [{ content: "= Ingresos ajustados", styles: { fontStyle: "bold" } }, { content: fmtMoney(data.summary.incomeAdjusted), styles: { fontStyle: "bold" } }],
      ["(-) Egresos operativos", fmtMoney(-data.summary.expensesOperative)],
      [{ content: "= EBITDA ajustado", styles: { fontStyle: "bold", textColor: data.summary.ebitda >= 0 ? PRIMARY : "#DC2626" } }, { content: fmtMoney(data.summary.ebitda), styles: { fontStyle: "bold", textColor: data.summary.ebitda >= 0 ? PRIMARY : "#DC2626" } }],
      ["Margen EBITDA", fmtPct(data.summary.ebitdaMargin)],
      ["(Para info) Egresos financieros excluidos", fmtMoney(data.summary.expensesFinancial)],
    ],
    headStyles: { fillColor: PRIMARY, textColor: "#FFFFFF" },
    alternateRowStyles: { fillColor: CREAM },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error lastAutoTable es agregado dinámicamente
  y = doc.lastAutoTable.finalY + 8;

  // Gráfico ingresos vs egresos
  try {
    const chartImg = await renderChartToPng({
      type: "bar",
      data: {
        labels: ["Ingresos ajustados", "Egresos operativos", "EBITDA"],
        datasets: [{
          label: "S/",
          data: [data.summary.incomeAdjusted, data.summary.expensesOperative, data.summary.ebitda],
          backgroundColor: [PRIMARY_LIGHT, "#DC2626", data.summary.ebitda >= 0 ? PRIMARY : "#DC2626"],
        }],
      },
      options: { plugins: { legend: { display: false } } },
    }, 700, 280);
    if (y + 80 > pageH - 20) { addNewPage(); y = 22; }
    doc.addImage(chartImg, "PNG", margin, y, pageW - margin * 2, 70);
  } catch { /* ignorar errores de chart */ }

  // ════════════════════════ PÁGINA 3: FLUJO DE CAJA ════════════════════════
  addNewPage();
  y = 22;
  doc.setTextColor(PRIMARY);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Flujo de caja", margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Métrica", "Monto"]],
    body: [
      ["Saldo inicial", fmtMoney(data.summary.bankStart)],
      ["(+) Total ingresos del período", fmtMoney(data.summary.incomeGross)],
      ["(-) Total egresos del período (banco)", fmtMoney(data.summary.expensesGross)],
      [{ content: "= Saldo final", styles: { fontStyle: "bold" } }, { content: fmtMoney(data.summary.bankEnd), styles: { fontStyle: "bold" } }],
      ["Variación", fmtMoney(data.summary.bankDelta)],
    ],
    headStyles: { fillColor: PRIMARY, textColor: "#FFFFFF" },
    alternateRowStyles: { fillColor: CREAM },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error
  y = doc.lastAutoTable.finalY + 8;

  // Gráfico evolución saldo diario
  try {
    const labels = data.cashFlow.map((d) => d.date.substring(5));
    const values = data.cashFlow.map((d) => d.bankEnd);
    const chartImg = await renderChartToPng({
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Saldo banco (S/)",
          data: values,
          borderColor: PRIMARY,
          backgroundColor: PRIMARY_LIGHT,
          tension: 0.2,
        }],
      },
      options: { plugins: { legend: { display: false } } },
    }, 700, 280);
    if (y + 80 > pageH - 20) { addNewPage(); y = 22; }
    doc.addImage(chartImg, "PNG", margin, y, pageW - margin * 2, 70);
  } catch { /* */ }

  // ════════════════════════ PÁGINA 4: GASTOS POR CATEGORÍA ════════════════════════
  addNewPage();
  y = 22;
  doc.setTextColor(PRIMARY);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Gastos por categoría", margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Categoría", "Monto Atelier", "% del total"]],
    body: data.byCategory.map((c) => [c.category, fmtMoney(c.totalAtelier), fmtPct(c.pct)]),
    headStyles: { fillColor: PRIMARY, textColor: "#FFFFFF" },
    alternateRowStyles: { fillColor: CREAM },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error
  y = doc.lastAutoTable.finalY + 8;

  // Pie chart
  if (data.byCategory.length > 0) {
    try {
      const chartImg = await renderChartToPng({
        type: "doughnut",
        data: {
          labels: data.byCategory.map((c) => c.category),
          datasets: [{
            data: data.byCategory.map((c) => c.totalAtelier),
            backgroundColor: data.byCategory.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
          }],
        },
        options: { plugins: { legend: { position: "right" } } },
      }, 700, 320);
      if (y + 90 > pageH - 20) { addNewPage(); y = 22; }
      doc.addImage(chartImg, "PNG", margin, y, pageW - margin * 2, 80);
    } catch { /* */ }
  }

  // ════════════════════════ PÁGINA 5: PRESUPUESTO VS REAL ════════════════════════
  if (data.budgetVsReal.some((b) => b.budgeted !== null)) {
    addNewPage();
    y = 22;
    doc.setTextColor(PRIMARY);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Presupuesto vs Real", margin, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [["Categoría", "Presupuesto", "Real", "% Cumplimiento", "Estado"]],
      body: data.budgetVsReal.map((b) => [
        b.category,
        b.budgeted !== null ? fmtMoney(b.budgeted) : "—",
        fmtMoney(b.real),
        b.budgeted !== null ? fmtPct(b.pct) : "—",
        b.status === "ok" ? "Bajo" : b.status === "near" ? "Cerca" : b.status === "over" ? "Sobre" : "—",
      ]),
      headStyles: { fillColor: PRIMARY, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: CREAM },
      margin: { left: margin, right: margin },
      didParseCell: (data2) => {
        if (data2.section === "body" && data2.column.index === 4) {
          const v = data2.cell.raw as string;
          if (v === "Sobre") data2.cell.styles.textColor = "#DC2626";
          else if (v === "Cerca") data2.cell.styles.textColor = "#EAB308";
          else if (v === "Bajo") data2.cell.styles.textColor = PRIMARY_LIGHT;
        }
      },
    });
  }

  // ════════════════════════ PÁGINA 6: TOP 10 EGRESOS ════════════════════════
  if (data.topExpenses.length > 0) {
    addNewPage();
    y = 22;
    doc.setTextColor(PRIMARY);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Top egresos del período", margin, y);
    y += 8;

    const totalTop = data.topExpenses.reduce((s, x) => s + x.amount, 0);
    const totalAll = data.summary.expensesOperative + data.summary.expensesFinancial;
    const pctTop = totalAll > 0 ? (totalTop / totalAll) * 100 : 0;

    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Categoría", "Concepto", "Monto", "Método"]],
      body: data.topExpenses.map((x) => [x.date, x.category, x.concept, fmtMoney(x.amount), x.method]),
      headStyles: { fillColor: PRIMARY, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: CREAM },
      margin: { left: margin, right: margin },
    });
    // @ts-expect-error
    y = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(`Suma top: ${fmtMoney(totalTop)} (${fmtPct(pctTop)} del total de egresos del período)`, margin, y);
  }

  // ════════════════════════ PÁGINA 7: COMPARATIVO ════════════════════════
  if (data.comparePrev) {
    addNewPage();
    y = 22;
    doc.setTextColor(PRIMARY);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Comparativo: ${data.period.label} vs ${data.comparePrev.prevLabel}`, margin, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [["Métrica", "Actual", "Anterior", "Variación", "Variación %"]],
      body: data.comparePrev.metrics.map((m) => [
        m.name,
        m.name.includes("%") ? m.current.toFixed(2) : fmtMoney(m.current),
        m.name.includes("%") ? m.prev.toFixed(2) : fmtMoney(m.prev),
        m.name.includes("%") ? m.delta.toFixed(2) : fmtMoney(m.delta),
        fmtPct(m.deltaPct),
      ]),
      headStyles: { fillColor: PRIMARY, textColor: "#FFFFFF" },
      alternateRowStyles: { fillColor: CREAM },
      margin: { left: margin, right: margin },
      didParseCell: (data2) => {
        if (data2.section === "body" && data2.column.index === 4) {
          const m = data.comparePrev!.metrics[data2.row.index];
          if (m.deltaPct > 0) data2.cell.styles.textColor = PRIMARY_LIGHT;
          else if (m.deltaPct < 0) data2.cell.styles.textColor = "#DC2626";
        }
      },
    });
  }

  // ════════════════════════ PÁGINA 8: CUENTAS POR COBRAR ════════════════════════
  if (data.fonaviAtEnd.length > 0 || data.summary.b2bReceivablesAtEnd > 0) {
    addNewPage();
    y = 22;
    doc.setTextColor(PRIMARY);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Cuentas por cobrar", margin, y);
    y += 8;

    if (data.fonaviAtEnd.length > 0) {
      doc.setFontSize(11);
      doc.setTextColor(PRIMARY_LIGHT);
      doc.text("Fonavi", margin, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Fecha", "Categoría · Concepto", "Por cobrar", "Cobrado", "Estado", "Días"]],
        body: data.fonaviAtEnd.map((r) => [
          r.date, `${r.category} · ${r.concept}`,
          fmtMoney(r.pending), fmtMoney(r.collected), r.status, String(r.aging),
        ]),
        foot: [["", "TOTAL", fmtMoney(data.summary.fonaviReceivablesAtEnd), "", "", ""]],
        headStyles: { fillColor: PRIMARY, textColor: "#FFFFFF" },
        footStyles: { fillColor: "#E5E7EB", textColor: TEXT, fontStyle: "bold" },
        alternateRowStyles: { fillColor: CREAM },
        margin: { left: margin, right: margin },
      });
      // @ts-expect-error
      y = doc.lastAutoTable.finalY + 6;
    }

    if (data.summary.b2bReceivablesAtEnd > 0) {
      doc.setFontSize(11);
      doc.setTextColor(PRIMARY_LIGHT);
      doc.text("B2B", margin, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Cliente", "Total venta", "Cobrado", "Pendiente"]],
        body: data.b2bAtEnd.map((r) => [r.client, fmtMoney(r.total), fmtMoney(r.collected), fmtMoney(r.pending)]),
        headStyles: { fillColor: PRIMARY, textColor: "#FFFFFF" },
        alternateRowStyles: { fillColor: CREAM },
        margin: { left: margin, right: margin },
      });
    }
  }

  doc.save(filename);
}
