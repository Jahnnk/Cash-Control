"use client";

import { useState } from "react";
import { X, Loader2, FileDown } from "lucide-react";
import { getFonaviPartnerReport } from "@/app/actions/partner-report";
import {
  applyPartnerFilter,
  PARTNER_FILTER_LABELS,
  type PartnerReportData,
  type PartnerReportFilter,
  type ReportAttachment,
} from "@/lib/partner-report";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import { isImageType } from "@/lib/attachment-validation";

const PRIMARY = "#004C40";
const MUTED = "#6B7280";

function lastMonths(n: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
    out.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return out;
}

/** Descarga la constancia y la convierte a JPEG (canvas) para jsPDF. */
async function fetchAsJpeg(att: ReportAttachment): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(att.signedUrl);
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // fondo blanco para PNG/WebP con transparencia
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.82), w: canvas.width, h: canvas.height };
  } catch {
    return null;
  }
}

const STATUS_ES: Record<string, string> = {
  pending: "Pendiente",
  partial: "Cobro parcial",
  collected: "Cobrado",
  "sin registro": "—",
};

async function buildPdf(data: PartnerReportData, filter: PartnerReportFilter, filename: string) {
  const { default: jsPDFCtor } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDFCtor({ unit: "mm", format: "a4" });
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 12) { doc.addPage(); y = 16; }
  };

  // ── Encabezado ──
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(PRIMARY);
  doc.text("Yayi's — Reporte Fonavi", margin, y); y += 7;
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor("#111827");
  const subtitle = filter === "todos"
    ? `Gastos compartidos y reembolsos · ${data.monthLabel}`
    : `${data.monthLabel} — ${PARTNER_FILTER_LABELS[filter]}`;
  doc.text(subtitle, margin, y); y += 5;
  doc.setFontSize(9).setTextColor(MUTED);
  doc.text(`Generado el ${data.generatedAt} · Constancias adjuntas incluidas`, margin, y); y += 8;

  // ── Resumen ──
  autoTable(doc, {
    startY: y,
    head: [["Resumen del mes", "Monto"]],
    body: [
      [filter === "pendientes"
        ? "Parte de Fonavi en compartidos PENDIENTES del mes"
        : filter === "pagados"
          ? "Parte de Fonavi en compartidos COBRADOS del mes"
          : "Parte de Fonavi en gastos compartidos del mes",
       formatCurrency(data.totals.fonaviPartMonth)],
      ...(filter !== "pendientes"
        ? [["Reembolsos de Fonavi recibidos en el mes", formatCurrency(data.totals.reimbursedMonth)]]
        : []),
      [{ content: "Saldo total por cobrar a Fonavi (a hoy)", styles: { fontStyle: "bold" as const } },
       { content: formatCurrency(data.totals.pendingNow), styles: { fontStyle: "bold" as const } }],
    ],
    margin: { left: margin, right: margin },
    headStyles: { fillColor: PRIMARY },
    styles: { fontSize: 9 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Gastos compartidos ──
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(PRIMARY);
  ensureSpace(10);
  const sharedTitle = filter === "pendientes"
    ? `Compartidos pendientes de pago · ${data.monthLabel}`
    : filter === "pagados"
      ? `Compartidos ya cobrados · ${data.monthLabel}`
      : `Gastos compartidos de ${data.monthLabel}`;
  doc.text(sharedTitle, margin, y); y += 4;
  if (data.sharedExpenses.length === 0) {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MUTED);
    y += 4; doc.text("Sin gastos compartidos este mes.", margin, y); y += 8;
  } else {
    autoTable(doc, {
      startY: y + 2,
      head: [["Fecha", "Concepto", "Total", "Parte Atelier", "Parte Fonavi", "Estado"]],
      body: data.sharedExpenses.map((e) => [
        e.date, e.concept, formatCurrency(e.amountTotal),
        formatCurrency(e.atelierPart), formatCurrency(e.fonaviPart),
        STATUS_ES[e.receivableStatus] ?? e.receivableStatus,
      ]),
      margin: { left: margin, right: margin },
      headStyles: { fillColor: PRIMARY },
      styles: { fontSize: 8 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Reembolsos (no aplica en "pendientes": son pagos ya hechos) ──
  if (filter !== "pendientes") {
  ensureSpace(14);
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(PRIMARY);
  doc.text(`Reembolsos recibidos de Fonavi · ${data.monthLabel}`, margin, y); y += 4;
  if (data.reimbursements.length === 0) {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MUTED);
    y += 4; doc.text("Sin reembolsos este mes.", margin, y); y += 8;
  } else {
    autoTable(doc, {
      startY: y + 2,
      head: [["Fecha", "Monto", "Método", "Nota"]],
      body: data.reimbursements.map((r) => [
        r.date, formatCurrency(r.amount),
        r.method === "efectivo" ? "Efectivo" : r.method === "yape_plin" ? "Yape/Plin" : "Transferencia",
        r.note || "—",
      ]),
      margin: { left: margin, right: margin },
      headStyles: { fillColor: PRIMARY },
      styles: { fontSize: 8 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  }

  // ── Constancias por transacción (en "pendientes" no hay pagos → sin constancias) ──
  type WithAtt = { title: string; attachments: ReportAttachment[] };
  const blocks: WithAtt[] = filter === "pendientes" ? [] : [
    ...data.sharedExpenses.filter((e) => e.attachments.length > 0)
      .map((e) => ({ title: `${e.date} · ${e.concept} · ${formatCurrency(e.amountTotal)}`, attachments: e.attachments })),
    ...data.reimbursements.filter((r) => r.attachments.length > 0)
      .map((r) => ({ title: `${r.date} · Reembolso ${formatCurrency(r.amount)}`, attachments: r.attachments })),
  ];

  if (blocks.length > 0) {
    doc.addPage(); y = 16;
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(PRIMARY);
    doc.text("Constancias de pago", margin, y); y += 7;

    for (const block of blocks) {
      ensureSpace(14);
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor("#111827");
      doc.text(block.title, margin, y); y += 5;

      for (const att of block.attachments) {
        if (isImageType(att.contentType)) {
          const img = await fetchAsJpeg(att);
          if (!img) {
            doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(MUTED);
            ensureSpace(6); doc.text(`(No se pudo cargar: ${att.filename})`, margin, y); y += 5;
            continue;
          }
          // Escalar a ancho de página, alto máx. 110mm, respetando proporción
          let w = contentW;
          let h = (img.h / img.w) * w;
          if (h > 110) { h = 110; w = (img.w / img.h) * h; }
          ensureSpace(h + 8);
          doc.addImage(img.dataUrl, "JPEG", margin, y, w, h);
          y += h + 3;
          doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(MUTED);
          doc.text(att.filename, margin, y); y += 6;
        } else {
          doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(MUTED);
          ensureSpace(6);
          doc.text(`PDF adjunto: ${att.filename} (disponible en la app)`, margin, y); y += 5;
        }
      }
      y += 3;
    }
  }

  doc.save(filename);
}

export function PartnerReportModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const months = lastMonths(12);
  const [month, setMonth] = useState(months[0].value);
  const [filter, setFilter] = useState<PartnerReportFilter>("todos");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleGenerate() {
    setWorking(true);
    try {
      setStatus("Recopilando movimientos y constancias…");
      const fullData = await getFonaviPartnerReport(month);
      const data = applyPartnerFilter(fullData, filter);
      // Pre-chequeo: filtro vacío → aviso claro, nunca un PDF en blanco
      if (data.sharedExpenses.length === 0 && data.reimbursements.length === 0) {
        const emptyMsg =
          filter === "pendientes"
            ? `No hay pagos pendientes de Fonavi en ${data.monthLabel}. ¡Todo al día!`
            : filter === "pagados"
              ? `No hay pagos ni reembolsos saldados en ${data.monthLabel}.`
              : `No hay gastos compartidos ni reembolsos en ${data.monthLabel}.`;
        showToast(emptyMsg, "error");
        setStatus(null);
        return;
      }
      const nImgs = filter === "pendientes" ? 0 : [...data.sharedExpenses, ...data.reimbursements]
        .reduce((s, x) => s + x.attachments.length, 0);
      setStatus(nImgs > 0 ? `Generando PDF (incrustando ${nImgs} constancias)…` : "Generando PDF…");
      const suffix = filter === "todos" ? "" : filter === "pendientes" ? "-Pendientes" : "-Pagados";
      await buildPdf(data, filter, `Yayis-Fonavi-Reporte-Socia-${month}${suffix}.pdf`);
      showToast("Reporte descargado");
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo generar el reporte", "error");
      setStatus(null);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !working && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Reporte para socia (PDF)</h2>
          <button onClick={onClose} disabled={working} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Gastos compartidos del mes, reembolsos recibidos y las <strong>constancias de pago adjuntas</strong> incluidas como imagen.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mes</label>
              <select value={month} onChange={(e) => setMonth(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {months.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
              <select value={filter} onChange={(e) => setFilter(e.target.value as PartnerReportFilter)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="todos">Todos</option>
                <option value="pendientes">Pendientes</option>
                <option value="pagados">Pagados</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            {filter === "pendientes"
              ? "Solo lo que Fonavi todavía debe pagar o reembolsar."
              : filter === "pagados"
                ? "Solo lo ya saldado, con sus constancias adjuntas."
                : "El mes completo: compartidos, reembolsos y constancias."}
          </p>
          {status && (
            <div className="text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> {status}
            </div>
          )}
          <button onClick={handleGenerate} disabled={working}
            className="w-full bg-violet-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Generar y descargar
          </button>
        </div>
      </div>
    </div>
  );
}
