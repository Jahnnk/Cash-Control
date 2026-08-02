/**
 * EIRS · Design System compartido por TODOS los renderers del Board
 * Meeting Package (PDF/PPT/Excel): la marca Yayi's en un solo lugar.
 */

import type { jsPDF } from "jspdf";
import type { ReportStory, Traffic } from "../types";

export const BRAND = {
  primary: "#004C40",
  primaryLight: "#098B5F",
  ink: "#111827",
  gray: "#6B7280",
  grayLight: "#E5E7EB",
  paper: "#FFFFFF",
  cream: "#F6F5F1",
  traffic: {
    verde: "#0E9F6E",
    ambar: "#D97706",
    rojo: "#DC2626",
  } as Record<Traffic, string>,
  tone: {
    positivo: "#0E9F6E",
    neutro: "#374151",
    atencion: "#B45309",
    riesgo: "#B91C1C",
  } as Record<string, string>,
};

export const PDF = {
  margin: 16,
  headerH: 14,
  footerH: 12,
  h1: 19,
  h2: 13,
  body: 9.5,
  small: 7.5,
  lineGap: 4.6,
};

export function fmtSoles(n: number): string {
  // Guion ASCII, no el signo menos "−" (U+2212): la fuente helvetica de
  // jsPDF no lo soporta y lo dibuja como un carácter garabateado.
  const sign = n < 0 ? "-" : "";
  return `${sign}S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Encabezado estándar de página interior (marca + sección + mes). */
export function pageHeader(doc: jsPDF, story: ReportStory, section: string): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(BRAND.primary);
  doc.rect(0, 0, w, PDF.headerH, "F");
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor("#FFFFFF");
  doc.text(`Yayi's · ${story.meta.title}`, PDF.margin, 9);
  doc.setFont("helvetica", "normal");
  doc.text(`${section} · ${story.meta.monthLabel}`, w - PDF.margin, 9, { align: "right" });
  return PDF.headerH + 8; // y inicial del contenido
}

/** Pie estándar: paginación + confidencial. */
export function pageFooter(doc: jsPDF, pageNum: number, totalLabel: string): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(BRAND.grayLight);
  doc.line(PDF.margin, h - PDF.footerH, w - PDF.margin, h - PDF.footerH);
  doc.setFont("helvetica", "normal").setFontSize(PDF.small).setTextColor(BRAND.gray);
  doc.text("CONFIDENCIAL — solo para uso interno y directorio", PDF.margin, h - 6);
  doc.text(`${totalLabel} · pág. ${pageNum}`, w - PDF.margin, h - 6, { align: "right" });
}

/** Título de sección dentro de una página. Devuelve el nuevo y. */
export function sectionTitle(doc: jsPDF, y: number, text: string): number {
  doc.setFont("helvetica", "bold").setFontSize(PDF.h2).setTextColor(BRAND.primary);
  doc.text(text, PDF.margin, y);
  doc.setDrawColor(BRAND.primaryLight);
  doc.setLineWidth(0.6);
  doc.line(PDF.margin, y + 2, PDF.margin + 42, y + 2);
  doc.setLineWidth(0.2);
  return y + 9;
}

/** Chip de semáforo (celda de tabla o inline). */
export function trafficLabel(t: Traffic): string {
  return t === "verde" ? "● Verde" : t === "ambar" ? "● Ámbar" : "● Rojo";
}
