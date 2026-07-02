/**
 * EIRS · Renderer XLSX — el Excel Gerencial para ANALIZAR.
 *
 * RENDERER TONTO: solo lee el ReportStory. Todo el detalle, en pestañas:
 * Resumen · Scorecard · Rentabilidad · Categorías · Presupuesto · Riesgos
 * y Oportunidades · Plan y Preguntas · Proyecciones · Anexos (por unidad).
 * Semáforos como formato real de celda (colores nativos de Excel).
 */

import ExcelJS from "exceljs";
import type { ReportStory, Traffic } from "../types";
import { BRAND } from "./design-system";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BRAND.primary.slice(1) } };
const TRAFFIC_FILL: Record<Traffic, string> = { verde: "FFD1FAE5", ambar: "FFFEF3C7", rojo: "FFFEE2E2" };
const TRAFFIC_TEXT: Record<Traffic, string> = { verde: "FF065F46", ambar: "FF92400E", rojo: "FF991B1B" };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
}

function addSheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns;
  styleHeader(ws.getRow(1));
  return ws;
}

function trafficCell(cell: ExcelJS.Cell, t: Traffic) {
  cell.value = t === "verde" ? "Verde" : t === "ambar" ? "Ámbar" : "Rojo";
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TRAFFIC_FILL[t] } };
  cell.font = { bold: true, color: { argb: TRAFFIC_TEXT[t] } };
}

export async function renderXlsx(story: ReportStory): Promise<{ blob: Blob; filename: string }> {
  const intel = story.intelligence.consolidated ?? story.intelligence.units[0];
  const n = story.narrative;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yayi's Cash Control · EIRS";
  wb.created = new Date(story.meta.generatedAt);

  // ── Resumen ──
  const res = wb.addWorksheet("Resumen");
  res.columns = [{ width: 26 }, { width: 110 }];
  const put = (label: string, text: string) => {
    const row = res.addRow([label, text]);
    row.getCell(1).font = { bold: true, color: { argb: "FF" + BRAND.primary.slice(1) } };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  };
  put("Reporte", `${story.meta.title} · ${story.meta.monthLabel} · CONFIDENCIAL`);
  put("Estado", n.cover.statusLine);
  put("Cierre del mes", n.executiveSummary.closing.text);
  if (n.executiveSummary.achievement) put("Mayor logro", n.executiveSummary.achievement.text);
  if (n.executiveSummary.problem) put("Mayor problema", n.executiveSummary.problem.text);
  if (n.executiveSummary.risk) put("Principal riesgo", n.executiveSummary.risk.text);
  if (n.executiveSummary.opportunity) put("Principal oportunidad", n.executiveSummary.opportunity.text);
  n.executiveSummary.keyDecisions.forEach((d, i) => put(`Decisión ${i + 1}`, d.text));
  put("Si actuamos", n.boardClose.expectedOutcome.text);

  // ── Scorecard ──
  const sc = addSheet(wb, "Scorecard", [
    { header: "KPI", key: "k", width: 24 },
    { header: "Valor", key: "v", width: 16 },
    { header: "Mes previo", key: "p", width: 16 },
    { header: "Variación", key: "d", width: 12 },
    { header: "Estado", key: "t", width: 10 },
    { header: "Lectura", key: "c", width: 60 },
  ]);
  for (const k of intel.kpis) {
    const row = sc.addRow({
      k: k.label,
      v: k.value,
      p: k.prev,
      d: k.deltaPct !== null ? `${k.deltaPct >= 0 ? "+" : ""}${k.deltaPct.toFixed(1)}${k.unitSuffix === "%" ? " pts" : "%"}` : "—",
      c: n.kpiComments[k.id] ?? "",
    });
    if (k.unitSuffix === "S/") {
      row.getCell("v").numFmt = '"S/" #,##0.00';
      row.getCell("p").numFmt = '"S/" #,##0.00';
    }
    trafficCell(row.getCell("t"), k.traffic);
  }

  // ── Rentabilidad (serie 4 meses) ──
  const rent = addSheet(wb, "Rentabilidad", [
    { header: "Mes", key: "m", width: 12 },
    { header: "Ventas", key: "s", width: 16 },
    { header: "Gastos operativos", key: "g", width: 18 },
    { header: "EBITDA", key: "e", width: 16 },
    { header: "Margen %", key: "mg", width: 12 },
    { header: "Liquidez cierre", key: "l", width: 16 },
  ]);
  intel.series.months.forEach((m, i) => {
    const row = rent.addRow({
      m,
      s: intel.series.sales[i],
      g: Math.round((intel.series.sales[i] - intel.series.ebitda[i]) * 100) / 100,
      e: intel.series.ebitda[i],
      mg: intel.series.margin[i] / 100,
      l: intel.series.liquidity[i],
    });
    ["s", "g", "e", "l"].forEach((c2) => (row.getCell(c2).numFmt = '"S/" #,##0.00'));
    row.getCell("mg").numFmt = "0.0%";
  });

  // ── Categorías (mes vs promedio 3m, por unidad) ──
  const cat = addSheet(wb, "Categorías", [
    { header: "Unidad", key: "u", width: 16 },
    { header: "Categoría", key: "c", width: 26 },
    { header: "Mes", key: "m", width: 16 },
    { header: "Promedio 3m", key: "a", width: 16 },
    { header: "Desviación", key: "d", width: 16 },
    { header: "Grupo de costo", key: "g", width: 14 },
  ]);
  for (const u of story.facts.units) {
    for (const c2 of [...u.categories].sort((a, b) => b.amount - a.amount)) {
      const row = cat.addRow({
        u: u.unit.name, c: c2.category, m: c2.amount, a: c2.avg3m,
        d: Math.round((c2.amount - c2.avg3m) * 100) / 100, g: c2.costGroup ?? "—",
      });
      ["m", "a", "d"].forEach((k) => (row.getCell(k).numFmt = '"S/" #,##0.00'));
      const dev = c2.amount - c2.avg3m;
      if (c2.avg3m > 0 && dev >= Math.max(100, c2.avg3m * 0.25)) trafficCell(row.getCell("d"), "rojo");
    }
  }

  // ── Presupuesto (por unidad) ──
  const bud = addSheet(wb, "Presupuesto", [
    { header: "Unidad", key: "u", width: 16 },
    { header: "Categoría", key: "c", width: 26 },
    { header: "Presupuesto", key: "b", width: 16 },
    { header: "Gastado", key: "s", width: 16 },
    { header: "Estado", key: "t", width: 10 },
  ]);
  for (const u of story.facts.units) {
    for (const b of u.budget) {
      const row = bud.addRow({ u: u.unit.name, c: b.category, b: b.budgetSoles, s: b.spent });
      ["b", "s"].forEach((k) => (row.getCell(k).numFmt = '"S/" #,##0.00'));
      trafficCell(row.getCell("t"), b.color === "red" ? "rojo" : b.color === "yellow" ? "ambar" : "verde");
    }
  }

  // ── Riesgos y Oportunidades ──
  const ro = addSheet(wb, "Riesgos y Oportunidades", [
    { header: "Tipo", key: "t", width: 14 },
    { header: "Detalle", key: "d", width: 60 },
    { header: "Impacto", key: "i", width: 16 },
    { header: "Gravedad-Prioridad", key: "g", width: 18 },
    { header: "Mitigación / Plazo", key: "m", width: 60 },
    { header: "Fuente (auditoría)", key: "f", width: 50 },
  ]);
  for (const r of intel.risks) {
    const row = ro.addRow({ t: "Riesgo", d: r.metric, i: r.impact, g: r.severity, m: n.mitigations[r.mitigationId] ?? "", f: r.source });
    row.getCell("i").numFmt = '"S/" #,##0.00';
    trafficCell(row.getCell("t"), r.severity === "alta" ? "rojo" : "ambar");
    row.getCell("t").value = "Riesgo";
  }
  for (const o of intel.opportunities) {
    const row = ro.addRow({ t: "Oportunidad", d: o.metric, i: o.impact, g: `P${o.priority} · ${o.ease}`, m: o.timeframe, f: o.source });
    row.getCell("i").numFmt = '"S/" #,##0.00';
    trafficCell(row.getCell("t"), "verde");
    row.getCell("t").value = "Oportunidad";
  }

  // ── Plan y Preguntas ──
  const plan = addSheet(wb, "Plan y Preguntas", [
    { header: "#", key: "n", width: 4 },
    { header: "Tipo", key: "t", width: 22 },
    { header: "Contenido", key: "c", width: 70 },
    { header: "Impacto", key: "i", width: 16 },
    { header: "Responsable / Contexto", key: "o", width: 50 },
    { header: "Plazo", key: "p", width: 14 },
  ]);
  intel.decisions.forEach((d, i) => {
    const row = plan.addRow({ n: i + 1, t: "Decisión", c: d.action, i: d.impact, o: d.owner, p: d.timeframe });
    row.getCell("i").numFmt = '"S/" #,##0.00';
  });
  intel.boardQuestions.forEach((q, i) => {
    plan.addRow({ n: i + 1, t: "Pregunta directorio", c: q.question, i: null, o: q.context, p: "" });
  });

  // ── Proyecciones ──
  const proj = addSheet(wb, "Proyecciones", [
    { header: "Escenario", key: "e", width: 14 },
    { header: "Liquidez proyectada", key: "l", width: 20 },
    { header: "Flujo supuesto", key: "f", width: 16 },
    { header: "Base del supuesto (auditoría)", key: "b", width: 60 },
  ]);
  for (const s of intel.projections.scenarios) {
    const row = proj.addRow({ e: s.scenario, l: s.liquidityEndNextMonth, f: s.monthlyNetFlow, b: s.basis });
    ["l", "f"].forEach((k) => (row.getCell(k).numFmt = '"S/" #,##0.00'));
  }
  proj.addRow({});
  proj.addRow({ e: "Confianza", l: intel.projections.confidence, b: intel.projections.confidenceBasis });

  // ── Anexo: top gastos por unidad (base de datos) ──
  const anx = addSheet(wb, "Anexo Top Gastos", [
    { header: "Unidad", key: "u", width: 16 },
    { header: "Fecha", key: "f", width: 12 },
    { header: "Categoría", key: "c", width: 22 },
    { header: "Concepto", key: "co", width: 50 },
    { header: "Monto", key: "m", width: 16 },
  ]);
  for (const u of story.facts.units) {
    for (const t of u.annex.topExpenses) {
      const row = anx.addRow({ u: u.unit.name, f: t.date, c: t.category, co: t.concept, m: t.amount });
      row.getCell("m").numFmt = '"S/" #,##0.00';
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const filename = `Yayis-${story.meta.title.replace(/[^a-zA-Z0-9]+/g, "-")}-${story.meta.month}-Excel-Gerencial.xlsx`;
  return { blob, filename };
}
