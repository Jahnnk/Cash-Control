/**
 * PIC · Renderer XLSX — el Excel Comercial para ANALIZAR (renderer tonto).
 * Todo el detalle por producto en pestañas, con semáforos nativos.
 */

import ExcelJS from "exceljs";
import type { PortfolioStory, Verdict } from "../types";
import { BRAND } from "../../report/renderers/design-system";

const VERDICT_LABEL: Record<Verdict, string> = {
  proteger: "Proteger",
  ajustar_precio: "Ajustar precio",
  impulsar: "Impulsar",
  experimentar: "Experimentar",
  revisar: "Revisión estratégica",
  observar: "Observar",
};

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BRAND.primary.slice(1) } };

function addSheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns;
  ws.getRow(1).eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  return ws;
}

const SOLES = '"S/" #,##0.00';

export async function renderPortfolioXlsx(story: PortfolioStory): Promise<{ blob: Blob; filename: string }> {
  const i = story.intelligence;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yayi's Cash Control · PIC";
  wb.created = new Date(story.meta.generatedAt);

  // ── Resumen ──
  const res = wb.addWorksheet("Resumen");
  res.columns = [{ width: 30 }, { width: 110 }];
  const put = (label: string, text: string) => {
    const row = res.addRow([label, text]);
    row.getCell(1).font = { bold: true, color: { argb: "FF" + BRAND.primary.slice(1) } };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  };
  put("Reporte", `${story.meta.title} · Comercial · ${story.meta.monthLabel} · CONFIDENCIAL`);
  put("Salud del portafolio", `${i.health.total}/100 (${i.health.level}) · cobertura de costos ${i.health.costCoveragePct}%`);
  story.narrative.executiveSummary.forEach((p, n) => put(`Resumen ${n + 1}`, p.text));
  if (story.narrative.dataCaveat) put("Transparencia", story.narrative.dataCaveat.text);
  i.boardDecisions.forEach((d, n) => put(`Decisión ${n + 1}`, `${d.decision} (~S/${Math.round(d.impact)}/mes)`));
  i.boardQuestions.forEach((q, n) => put(`Pregunta ${n + 1}`, `${q.question} — ${q.context}`));

  // ── Veredictos (todo el detalle por producto) ──
  const ver = addSheet(wb, "Veredictos", [
    { header: "Producto", key: "n", width: 40 },
    { header: "Categoría", key: "cat", width: 22 },
    { header: "Veredicto", key: "v", width: 20 },
    { header: "Und", key: "u", width: 9 },
    { header: "Venta", key: "r", width: 14 },
    { header: "% Venta", key: "sh", width: 10 },
    { header: "Precio prom.", key: "pp", width: 12 },
    { header: "Costo unit.", key: "c", width: 12 },
    { header: "Contrib./und", key: "cu", width: 12 },
    { header: "Utilidad mes", key: "ct", width: 14 },
    { header: "Margen %", key: "m", width: 10 },
    { header: "ME", key: "me", width: 12 },
    { header: "ABC", key: "abc", width: 7 },
    { header: "Por qué (auditable)", key: "why", width: 80 },
  ]);
  for (const p of i.products) {
    const row = ver.addRow({
      n: p.name, cat: p.category ?? "—", v: VERDICT_LABEL[p.verdict], u: p.units,
      r: p.revenue, sh: p.revenueShare / 100, pp: p.avgPrice,
      c: p.unitCogs, cu: p.unitContribution, ct: p.contribution,
      m: p.marginPct !== null ? p.marginPct / 100 : null,
      me: p.menuEng ?? "—", abc: p.abcClass, why: p.verdictReason,
    });
    ["r", "pp", "c", "cu", "ct"].forEach((k) => (row.getCell(k).numFmt = SOLES));
    row.getCell("sh").numFmt = "0.0%";
    row.getCell("m").numFmt = "0.0%";
    const fills: Partial<Record<Verdict, string>> = {
      proteger: "FFD1FAE5", ajustar_precio: "FFFEF3C7", impulsar: "FFDBEAFE", revisar: "FFFEE2E2",
    };
    const fill = fills[p.verdict];
    if (fill) row.getCell("v").fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  }

  // ── Señales ──
  const sig = addSheet(wb, "Señales", [
    { header: "Tipo", key: "k", width: 14 },
    { header: "Metodología", key: "m", width: 18 },
    { header: "Qué se midió", key: "d", width: 55 },
    { header: "Valor", key: "v", width: 12 },
    { header: "Referencia", key: "ref", width: 12 },
    { header: "Impacto S/", key: "i", width: 12 },
    { header: "Confianza", key: "c", width: 11 },
    { header: "Fuente (auditoría)", key: "s", width: 70 },
  ]);
  for (const s of i.signals) {
    const row = sig.addRow({
      k: s.kind, m: s.methodology, d: s.metric,
      v: s.valueNow, ref: s.valueRef ?? "—", i: s.impact, c: s.confidence, s: s.source,
    });
    row.getCell("i").numFmt = SOLES;
  }

  // ── Salud ──
  const sal = addSheet(wb, "Salud", [
    { header: "Componente", key: "l", width: 22 },
    { header: "Puntos", key: "s", width: 10 },
    { header: "Peso", key: "w", width: 8 },
    { header: "Fórmula / motivo", key: "f", width: 100 },
  ]);
  for (const c of i.health.components) {
    sal.addRow({ l: c.label, s: c.score === null ? "—" : Math.round(c.score), w: c.weight, f: c.score === null ? (c.unavailableReason ?? "") : c.formula });
  }
  sal.addRow({});
  sal.addRow({ l: "TOTAL", s: i.health.total, f: `re-ponderado sobre componentes medibles · nivel ${i.health.level}` });

  // ── Plan ──
  const plan = addSheet(wb, "Plan", [
    { header: "#", key: "p", width: 4 },
    { header: "Acción", key: "a", width: 55 },
    { header: "Por qué", key: "w", width: 60 },
    { header: "Beneficio/mes", key: "b", width: 14 },
    { header: "Costo de no actuar", key: "i", width: 45 },
    { header: "Plazo", key: "t", width: 12 },
    { header: "Confianza", key: "c", width: 11 },
  ]);
  for (const r of i.recommendations) {
    const row = plan.addRow({ p: r.priority, a: r.action, w: r.why, b: r.expectedBenefit, i: r.inactionCost, t: r.timeframe, c: r.confidence });
    row.getCell("b").numFmt = SOLES;
  }

  // ── Calidad de datos ──
  const cal = addSheet(wb, "Calidad de datos", [
    { header: "Producto sin costo", key: "n", width: 45 },
    { header: "Venta/mes", key: "r", width: 14 },
    { header: "Acción", key: "a", width: 55 },
  ]);
  for (const u of i.dataQuality.topUncosted) {
    const row = cal.addRow({ n: u.name, r: u.revenue, a: "Vincular con el catálogo (alias) o costear la receta en el pricing-engine" });
    row.getCell("r").numFmt = SOLES;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const filename = `Yayis-${story.meta.title.replace(/[^a-zA-Z0-9]+/g, "-")}-${story.meta.month}-Comercial-Excel.xlsx`;
  return { blob, filename };
}
