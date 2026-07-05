/**
 * Acta de liquidación mensual de incentivos (renderer tonto, jsPDF).
 * El documento que se imprime: resultado del mes, tabla de pago por
 * persona con línea de firma (recibí), y las notas del cierre.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BRAND, PDF, fmtSoles } from "../report/renderers/design-system";
import type { LiquidationResult } from "./engine";

const JORNADA_LABEL: Record<string, string> = {
  tiempo_completo: "Tiempo completo",
  medio_turno: "Medio turno",
  administrador: "Administrador",
};

export function renderLiquidationPdf(input: {
  sede: string;
  monthLabel: string;
  result: LiquidationResult;
  mejorVendedor: string | null;
  notas: string | null;
  closedAt: string | null;
}): { blob: Blob; filename: string } {
  const { result: r } = input;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  doc.setFillColor(BRAND.primary);
  doc.rect(0, 0, w, 22, "F");
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor("#FFFFFF");
  doc.text("Acta de Liquidación · Incentivos por Upselling", PDF.margin, 10);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`Yayi's ${input.sede} · ${input.monthLabel}${input.closedAt ? ` · cerrada el ${input.closedAt.slice(0, 10)}` : " · BORRADOR"}`, PDF.margin, 17);

  let y = 32;
  doc.setFont("helvetica", "normal").setFontSize(PDF.body).setTextColor(BRAND.ink);
  const resumen = [
    `Ticket final del mes: ${r.ticketFinal !== null ? fmtSoles(r.ticketFinal) : "—"} (base ${fmtSoles(r.ticketBase)}${r.deltaFinal !== null ? ` · ${r.deltaFinal >= 0 ? "+" : ""}${fmtSoles(r.deltaFinal)}` : ""})`,
    `Personas atendidas: ${r.personas.toLocaleString("es-PE")} · Venta: ${fmtSoles(r.revenue)}`,
    `Piso de tráfico: ${r.personasPorDia ?? "—"} personas/día — ${r.trafficOk ? "CUMPLIDO ✓" : "INCUMPLIDO (la meta no cuenta)"}`,
    `Nivel alcanzado: ${r.nivel ? `${r.nivel.nombre} (+${fmtSoles(r.nivel.delta)})` : "SIN NIVEL — sin bonos este mes"}`,
    ...(r.pozo !== null ? [`Pozo del mes (techo 40%): ${fmtSoles(r.pozo)} · Total a pagar: ${fmtSoles(r.totalBonos)} · Colchón: ${fmtSoles(Math.round((r.pozo - r.totalBonos) * 100) / 100)}`] : []),
  ];
  for (const line of resumen) {
    doc.text(line, PDF.margin, y);
    y += 6;
  }

  if (r.warnings.length > 0) {
    y += 2;
    doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(BRAND.tone.atencion);
    for (const wtext of r.warnings) {
      const lines = doc.splitTextToSize(`• ${wtext}`, w - PDF.margin * 2);
      doc.text(lines, PDF.margin, y);
      y += lines.length * 4 + 1;
    }
  }

  y += 4;
  autoTable(doc, {
    startY: y,
    margin: { left: PDF.margin, right: PDF.margin },
    head: [["Colaborador", "Jornada", "Bono", "Premio MV", "Total", "Firma (recibí)"]],
    body: r.lines.map((l) => [
      l.name,
      JORNADA_LABEL[l.jornada] ?? l.jornada,
      fmtSoles(l.bono),
      l.premioMv > 0 ? fmtSoles(l.premioMv) : "—",
      fmtSoles(Math.round((l.bono + l.premioMv) * 100) / 100),
      "",
    ]),
    foot: [["TOTAL", "", "", "", fmtSoles(r.totalBonos), ""]],
    styles: { fontSize: 9, cellPadding: 2.5, minCellHeight: 10 },
    headStyles: { fillColor: BRAND.primary },
    footStyles: { fillColor: "#F3F4F6", textColor: BRAND.ink, fontStyle: "bold" },
    columnStyles: { 5: { cellWidth: 45 } },
  });
  let yy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  if (input.mejorVendedor) {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(BRAND.ink);
    doc.text(`Mejor vendedor del mes: ${input.mejorVendedor}`, PDF.margin, yy);
    yy += 6;
  }
  if (input.notas) {
    doc.setFont("helvetica", "italic").setFontSize(8.5).setTextColor(BRAND.gray);
    const lines = doc.splitTextToSize(`Notas del cierre: ${input.notas}`, w - PDF.margin * 2);
    doc.text(lines, PDF.margin, yy);
    yy += lines.length * 4 + 4;
  }

  yy = Math.max(yy + 14, 240);
  doc.setDrawColor(BRAND.gray);
  doc.line(PDF.margin, yy, PDF.margin + 60, yy);
  doc.line(w - PDF.margin - 60, yy, w - PDF.margin, yy);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(BRAND.gray);
  doc.text("Dirección (Jahnn Karlo)", PDF.margin, yy + 5);
  doc.text("Administrador de sede", w - PDF.margin - 60, yy + 5);
  doc.text("CONFIDENCIAL — el bono se paga solo con la venta nueva, nunca con la utilidad de hoy.", PDF.margin, 287);

  const filename = `Liquidacion-Incentivos-${input.sede}-${r.month}.pdf`;
  return { blob: doc.output("blob"), filename };
}
