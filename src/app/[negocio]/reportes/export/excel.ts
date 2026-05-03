import type { ReportData } from "@/app/actions/export-report";

const PRIMARY = "FF004C40";
const PRIMARY_LIGHT = "FF098B5F";
const CREAM = "FFF9F6EB";
const CURRENCY = "\"S/ \"#,##0.00";
const PCT = "0.0%";

export async function generateExcel(data: ReportData, filename: string): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yayi's Cash Control";
  wb.created = new Date();

  const styleHeader = (cell: import("exceljs").Cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRIMARY } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "thin", color: { argb: PRIMARY_LIGHT } } };
  };
  const styleAlt = (row: import("exceljs").Row, isAlt: boolean) => {
    if (isAlt) row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } }; });
  };

  // ─────────── Pestaña 1: Resumen ───────────
  const ws1 = wb.addWorksheet("Resumen", { views: [{ state: "frozen", ySplit: 4 }] });
  ws1.mergeCells("A1:D1");
  ws1.getCell("A1").value = "Yayi's · Atelier";
  ws1.getCell("A1").font = { size: 16, bold: true, color: { argb: PRIMARY } };
  ws1.mergeCells("A2:D2");
  ws1.getCell("A2").value = `Reporte ejecutivo · ${data.period.label}`;
  ws1.getCell("A2").font = { size: 12, color: { argb: PRIMARY_LIGHT } };
  ws1.mergeCells("A3:D3");
  ws1.getCell("A3").value = `Generado: ${new Date(data.generatedAt).toLocaleString("es-PE")}`;
  ws1.getCell("A3").font = { size: 9, color: { argb: "FF6B7280" } };

  ws1.addRow([]);
  const headers1 = ["Métrica", "Valor"];
  const r1h = ws1.addRow(headers1);
  r1h.eachCell((c) => styleHeader(c));

  const kpis: [string, number, string][] = [
    ["Ingresos brutos", data.summary.incomeGross, CURRENCY],
    ["(-) Reembolsos Fonavi", data.summary.fonaviReimbursements, CURRENCY],
    ["= Ingresos ajustados", data.summary.incomeAdjusted, CURRENCY],
    ["Egresos brutos", data.summary.expensesGross, CURRENCY],
    ["Egresos financieros (excl. EBITDA)", data.summary.expensesFinancial, CURRENCY],
    ["Egresos operativos (atelier)", data.summary.expensesOperative, CURRENCY],
    ["EBITDA ajustado", data.summary.ebitda, CURRENCY],
    ["Margen EBITDA", data.summary.ebitdaMargin / 100, PCT],
    ["Saldo banco inicial", data.summary.bankStart, CURRENCY],
    ["Saldo banco final", data.summary.bankEnd, CURRENCY],
    ["Variación de caja", data.summary.bankDelta, CURRENCY],
    ["Cuentas por cobrar Fonavi (final)", data.summary.fonaviReceivablesAtEnd, CURRENCY],
    ["Cuentas por cobrar B2B (final)", data.summary.b2bReceivablesAtEnd, CURRENCY],
  ];
  kpis.forEach(([name, value, fmt], i) => {
    const row = ws1.addRow([name, value]);
    row.getCell(2).numFmt = fmt;
    if (name.startsWith("=") || name === "EBITDA ajustado" || name === "Margen EBITDA") {
      row.getCell(1).font = { bold: true };
      row.getCell(2).font = { bold: true };
    }
    styleAlt(row, i % 2 === 0);
  });
  ws1.getColumn(1).width = 38;
  ws1.getColumn(2).width = 20;

  // ─────────── Pestaña 2: Ingresos ───────────
  const ws2 = wb.addWorksheet("Ingresos detallados", { views: [{ state: "frozen", ySplit: 1 }] });
  const r2h = ws2.addRow(["Fecha", "Cliente", "Concepto", "Monto", "Método", "Es reembolso?", "Notas"]);
  r2h.eachCell((c) => styleHeader(c));
  data.incomes.forEach((x, i) => {
    const r = ws2.addRow([x.date, x.client, x.concept, x.amount, x.method, x.isReimbursement ? "Sí" : "No", x.notes]);
    r.getCell(4).numFmt = CURRENCY;
    styleAlt(r, i % 2 === 0);
  });
  if (data.incomes.length > 0) {
    const total = data.incomes.reduce((s, x) => s + x.amount, 0);
    const rt = ws2.addRow(["", "", "TOTAL", total, "", "", ""]);
    rt.getCell(3).font = { bold: true };
    rt.getCell(4).font = { bold: true };
    rt.getCell(4).numFmt = CURRENCY;
  }
  [12, 22, 32, 14, 14, 12, 24].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

  // ─────────── Pestaña 3: Egresos ───────────
  const ws3 = wb.addWorksheet("Egresos detallados", { views: [{ state: "frozen", ySplit: 1 }] });
  const r3h = ws3.addRow(["Fecha", "Categoría", "Concepto", "Método", "Monto bruto", "Compartido?", "Atelier", "Fonavi", "Notas"]);
  r3h.eachCell((c) => styleHeader(c));
  data.expenses.forEach((x, i) => {
    const r = ws3.addRow([x.date, x.category, x.concept, x.method, x.amount, x.isShared ? "Sí" : "No", x.atelierAmount, x.fonaviAmount, x.notes]);
    [5, 7, 8].forEach((c) => { r.getCell(c).numFmt = CURRENCY; });
    styleAlt(r, i % 2 === 0);
  });
  if (data.expenses.length > 0) {
    const totalGross = data.expenses.reduce((s, x) => s + x.amount, 0);
    const totalAtelier = data.expenses.reduce((s, x) => s + (x.isShared ? x.atelierAmount : x.amount), 0);
    const rt = ws3.addRow(["", "", "TOTAL", "", totalGross, "", totalAtelier, "", ""]);
    rt.getCell(3).font = { bold: true };
    rt.getCell(5).font = { bold: true }; rt.getCell(5).numFmt = CURRENCY;
    rt.getCell(7).font = { bold: true }; rt.getCell(7).numFmt = CURRENCY;
  }
  [12, 18, 30, 14, 14, 12, 14, 14, 24].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });

  // ─────────── Pestaña 4: Por categoría ───────────
  const ws4 = wb.addWorksheet("Egresos por categoría", { views: [{ state: "frozen", ySplit: 1 }] });
  const r4h = ws4.addRow(["Categoría", "Total bruto", "Total Atelier", "% del total", "# Trans.", "Promedio", "EBITDA?"]);
  r4h.eachCell((c) => styleHeader(c));
  data.byCategory.forEach((c, i) => {
    const r = ws4.addRow([c.category, c.totalGross, c.totalAtelier, c.pct / 100, c.count, c.avg, c.excludeFromEbitda ? "No" : "Sí"]);
    [2, 3, 6].forEach((cc) => { r.getCell(cc).numFmt = CURRENCY; });
    r.getCell(4).numFmt = PCT;
    styleAlt(r, i % 2 === 0);
  });
  if (data.byCategory.length > 0) {
    const totalG = data.byCategory.reduce((s, c) => s + c.totalGross, 0);
    const totalA = data.byCategory.reduce((s, c) => s + c.totalAtelier, 0);
    const rt = ws4.addRow(["TOTAL", totalG, totalA, 1, "", "", ""]);
    rt.eachCell((c) => { c.font = { bold: true }; });
    rt.getCell(2).numFmt = CURRENCY;
    rt.getCell(3).numFmt = CURRENCY;
    rt.getCell(4).numFmt = PCT;
  }
  [22, 16, 16, 12, 10, 14, 10].forEach((w, i) => { ws4.getColumn(i + 1).width = w; });

  // ─────────── Pestaña 5: Presupuesto vs Real ───────────
  const ws5 = wb.addWorksheet("Presupuesto vs Real", { views: [{ state: "frozen", ySplit: 1 }] });
  const r5h = ws5.addRow(["Categoría", "Presupuestado", "Real (atelier)", "Diferencia", "% Cumplimiento", "Estado"]);
  r5h.eachCell((c) => styleHeader(c));
  data.budgetVsReal.forEach((b, i) => {
    const status = b.status === "ok" ? "✅ Bajo" : b.status === "near" ? "⚠️ Cerca" : b.status === "over" ? "🔴 Sobre" : "—";
    const r = ws5.addRow([b.category, b.budgeted ?? "—", b.real, b.budgeted !== null ? b.diff : "—", b.budgeted !== null ? b.pct / 100 : "—", status]);
    if (typeof b.budgeted === "number") r.getCell(2).numFmt = CURRENCY;
    r.getCell(3).numFmt = CURRENCY;
    if (b.budgeted !== null) { r.getCell(4).numFmt = CURRENCY; r.getCell(5).numFmt = PCT; }
    styleAlt(r, i % 2 === 0);
  });
  [22, 16, 16, 14, 16, 14].forEach((w, i) => { ws5.getColumn(i + 1).width = w; });

  // ─────────── Pestaña 6: Flujo de caja ───────────
  const ws6 = wb.addWorksheet("Flujo de caja", { views: [{ state: "frozen", ySplit: 1 }] });
  const r6h = ws6.addRow(["Fecha", "Saldo inicial", "Ingresos", "Egresos", "Saldo final", "Variación"]);
  r6h.eachCell((c) => styleHeader(c));
  data.cashFlow.forEach((d, i) => {
    const r = ws6.addRow([d.date, d.bankStart, d.income, d.expense, d.bankEnd, d.delta]);
    [2, 3, 4, 5, 6].forEach((cc) => { r.getCell(cc).numFmt = CURRENCY; });
    styleAlt(r, i % 2 === 0);
  });
  [14, 16, 14, 14, 16, 14].forEach((w, i) => { ws6.getColumn(i + 1).width = w; });

  // ─────────── Pestaña 7: Top 10 ───────────
  if (data.topExpenses.length > 0) {
    const ws7 = wb.addWorksheet("Top 10 egresos", { views: [{ state: "frozen", ySplit: 1 }] });
    const r7h = ws7.addRow(["Fecha", "Categoría", "Concepto", "Monto (atelier)", "Método"]);
    r7h.eachCell((c) => styleHeader(c));
    data.topExpenses.forEach((x, i) => {
      const r = ws7.addRow([x.date, x.category, x.concept, x.amount, x.method]);
      r.getCell(4).numFmt = CURRENCY;
      styleAlt(r, i % 2 === 0);
    });
    [12, 18, 32, 16, 14].forEach((w, i) => { ws7.getColumn(i + 1).width = w; });
  }

  // ─────────── Pestaña 8: Comparativo ───────────
  if (data.comparePrev) {
    const ws8 = wb.addWorksheet("Comparativo mes anterior", { views: [{ state: "frozen", ySplit: 2 }] });
    ws8.mergeCells("A1:E1");
    ws8.getCell("A1").value = `${data.period.label} vs ${data.comparePrev.prevLabel}`;
    ws8.getCell("A1").font = { size: 12, bold: true, color: { argb: PRIMARY } };
    const r8h = ws8.addRow(["Métrica", "Mes actual", "Mes anterior", "Variación", "Variación %"]);
    r8h.eachCell((c) => styleHeader(c));
    data.comparePrev.metrics.forEach((m, i) => {
      const isPct = m.name.includes("%");
      const r = ws8.addRow([m.name, m.current, m.prev, m.delta, m.deltaPct / 100]);
      [2, 3, 4].forEach((cc) => { r.getCell(cc).numFmt = isPct ? "0.00" : CURRENCY; });
      r.getCell(5).numFmt = PCT;
      styleAlt(r, i % 2 === 0);
    });
    [26, 16, 16, 16, 14].forEach((w, i) => { ws8.getColumn(i + 1).width = w; });
  }

  // ─────────── Pestaña 9: Cuentas por cobrar ───────────
  if (data.fonaviAtEnd.length > 0 || data.summary.b2bReceivablesAtEnd > 0) {
    const ws9 = wb.addWorksheet("Cuentas por cobrar", { views: [{ state: "frozen", ySplit: 2 }] });
    ws9.mergeCells("A1:F1");
    ws9.getCell("A1").value = "Por cobrar a Fonavi";
    ws9.getCell("A1").font = { bold: true, color: { argb: PRIMARY }, size: 12 };
    const fh = ws9.addRow(["Fecha", "Categoría · Concepto", "Por cobrar", "Cobrado", "Estado", "Antigüedad (días)"]);
    fh.eachCell((c) => styleHeader(c));
    data.fonaviAtEnd.forEach((r, i) => {
      const row = ws9.addRow([r.date, `${r.category} · ${r.concept}`, r.pending, r.collected, r.status, r.aging]);
      row.getCell(3).numFmt = CURRENCY;
      row.getCell(4).numFmt = CURRENCY;
      styleAlt(row, i % 2 === 0);
    });
    ws9.addRow([]);
    ws9.addRow(["Total Fonavi", "", data.summary.fonaviReceivablesAtEnd, "", "", ""]);
    ws9.addRow([]);

    ws9.addRow(["Por cobrar B2B", "", "", "", "", ""]).getCell(1).font = { bold: true, color: { argb: PRIMARY } };
    const bh = ws9.addRow(["Cliente", "Fecha", "Total venta", "Cobrado", "Pendiente", "Antigüedad (días)"]);
    bh.eachCell((c) => styleHeader(c));
    data.b2bAtEnd.forEach((r, i) => {
      const row = ws9.addRow([r.client, r.date, r.total, r.collected, r.pending, r.aging]);
      [3, 4, 5].forEach((cc) => { row.getCell(cc).numFmt = CURRENCY; });
      styleAlt(row, i % 2 === 0);
    });
    [16, 30, 14, 14, 12, 18].forEach((w, i) => { ws9.getColumn(i + 1).width = w; });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
