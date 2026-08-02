/**
 * Reporte del Piloto · Bonos e Incentivos (renderer tonto, jsPDF).
 *
 * Pedido de Jahnn (01-ago-2026, cierre del piloto de julio en Fonavi y
 * Centro): un exportable con "lujo de detalle" para entregar a cada
 * administrador — no un resumen, sino el día por día completo, el
 * ranking íntegro del mejor vendedor y la tabla de niveles/bonos.
 *
 * UN SOLO documento con ambas sedes (principio de transparencia del
 * panel: "no queremos que piensen que les ocultamos información" — un
 * administrador puede ver también cómo le fue al otro local). Portada
 * comparativa + una sección completa por sede.
 *
 * Función PURA de presentación: recibe los datos ya calculados por
 * getGroupIncentives (el MISMO cerebro que ve cada admin en su panel)
 * y solo los dibuja. Cero lógica de negocio aquí.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BRAND, PDF, fmtSoles } from "../report/renderers/design-system";
import { dailyPresencial, type DailyEntry, type IncentiveProgress } from "./engine";
import type { MejorVendedorResult } from "../mejor-vendedor";

export type PilotReportSede = {
  sede: string;
  progress: IncentiveProgress | null;
  ticketBase: number | null;
  mejorVendedor: MejorVendedorResult | null;
  mvPeriodStart: string | null;
  mvPeriodEnd: string | null;
  minMesas: number;
  noElegibles: number;
  dailies: DailyEntry[];
};

export type PilotReportInput = {
  periodoLabel: string;
  /** Días naturales del periodo (para la nota "X de Y días registrados"). */
  daysInPeriod: number;
  sedes: PilotReportSede[];
  generatedAtLabel: string;
};

const JORNADA_FRANJA: Record<string, string> = {
  mañana: "Mañana",
  tarde: "Tarde",
  completo: "Turno completo",
};

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
function diaSemanaCorto(iso: string): string {
  const d = new Date(iso + "T12:00:00Z").getUTCDay();
  return ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d];
}

function drawHeader(doc: jsPDF, subtitle: string): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(BRAND.primary);
  doc.rect(0, 0, w, 20, "F");
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor("#FFFFFF");
  doc.text("Reporte del Piloto · Bonos e Incentivos", PDF.margin, 9);
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  doc.text(subtitle, PDF.margin, 15.5);
  return 30;
}

function drawFooter(doc: jsPDF, pageLabel: string): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(BRAND.grayLight);
  doc.line(PDF.margin, h - 12, w - PDF.margin, h - 12);
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(BRAND.gray);
  doc.text("Yayi's · mismos números que ve cada admin en su panel — nada oculto.", PDF.margin, h - 6);
  doc.text(pageLabel, w - PDF.margin, h - 6, { align: "right" });
}

export function renderPilotReportPdf(input: PilotReportInput): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  let page = 1;
  const totalPages = 1 + input.sedes.length;

  // ── Portada: comparativo entre sedes ──
  let y = drawHeader(doc, `${input.periodoLabel} · generado el ${input.generatedAtLabel}`);
  doc.setFont("helvetica", "bold").setFontSize(PDF.h2).setTextColor(BRAND.primary);
  doc.text("Comparativo del periodo", PDF.margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: PDF.margin, right: PDF.margin },
    head: [["Sede", "Ticket", "Base", "Dif. vs base", "Nivel", "Piso tráfico", "Días con datos", "Mejor vendedor"]],
    body: input.sedes.map((s) => {
      const p = s.progress;
      return [
        s.sede,
        p?.ticketActual !== null && p?.ticketActual !== undefined ? fmtSoles(p.ticketActual) : "—",
        s.ticketBase !== null ? fmtSoles(s.ticketBase) : "—",
        p?.deltaActual !== null && p?.deltaActual !== undefined
          ? `${p.deltaActual >= 0 ? "+" : ""}${fmtSoles(p.deltaActual)}`
          : "—",
        p?.nivelAlcanzado?.nombre ?? "Sin nivel",
        p ? (p.traffic.cumple ? `OK ${p.traffic.personasPorDia ?? "—"}/día` : `FALTA ${p.traffic.personasPorDia ?? "—"}/día (mín. ${p.traffic.floor})`) : "—",
        `${p?.daysLoaded ?? 0} / ${input.daysInPeriod}`,
        s.mejorVendedor?.ganador ?? "—",
      ];
    }),
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: BRAND.primary, fontSize: 7.5 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  doc.setFont("helvetica", "italic").setFontSize(8.5).setTextColor(BRAND.gray);
  const introLines = doc.splitTextToSize(
    "El ticket del programa excluye delivery y consumo del personal (ninguno de los dos permite " +
    "hacer upselling): solo cuenta la venta presencial de mostrador y mesa, donde el equipo sí puede " +
    "influir. El detalle día por día y el ranking completo están en las páginas de cada sede.",
    w - PDF.margin * 2,
  );
  doc.text(introLines, PDF.margin, y);
  drawFooter(doc, `pág. ${page} / ${totalPages}`);
  page++;

  // ── Una sección completa por sede ──
  for (const s of input.sedes) {
    doc.addPage();
    y = drawHeader(doc, `${s.sede} · ${input.periodoLabel}`);
    const p = s.progress;

    if (!p || p.ticketActual === null) {
      doc.setFont("helvetica", "normal").setFontSize(PDF.body).setTextColor(BRAND.ink);
      doc.text("Sin días registrados en este periodo.", PDF.margin, y);
      drawFooter(doc, `pág. ${page} / ${totalPages}`);
      page++;
      continue;
    }

    // Resumen
    doc.setFont("helvetica", "bold").setFontSize(PDF.h2).setTextColor(BRAND.primary);
    doc.text("Resumen del periodo", PDF.margin, y);
    y += 7;
    doc.setFont("helvetica", "normal").setFontSize(PDF.body).setTextColor(BRAND.ink);
    const resumen = [
      `Ticket del programa: ${fmtSoles(p.ticketActual)} (base ${fmtSoles(s.ticketBase ?? 0)}${
        p.deltaActual !== null ? ` · ${p.deltaActual >= 0 ? "+" : ""}${fmtSoles(p.deltaActual)}` : ""
      })`,
      `Nivel alcanzado: ${p.nivelAlcanzado ? p.nivelAlcanzado.nombre : "Sin nivel — aún no se generan bonos"}${
        p.proximoNivel ? ` · para ${p.proximoNivel.level.nombre} faltan ${fmtSoles(p.proximoNivel.faltaSoles)}` : ""
      }`,
      `Días con registro: ${p.daysLoaded} de ${input.daysInPeriod} del periodo${
        p.daysLoaded < input.daysInPeriod ? " — faltan días por cargar" : ""
      }`,
      `Piso de tráfico: ${p.traffic.personasPorDia ?? "—"} personas/día (mínimo ${p.traffic.floor}) — ${
        p.traffic.cumple ? "CUMPLIDO" : "INCUMPLIDO — mientras no se cumpla, la meta no cuenta aunque el ticket suba"
      }`,
      `Personas atendidas: ${p.personas.toLocaleString("es-PE")} · Venta total: ${fmtSoles(p.revenue)}`,
    ];
    for (const line of resumen) {
      const lines = doc.splitTextToSize(line, w - PDF.margin * 2);
      doc.text(lines, PDF.margin, y);
      y += lines.length * 4.6 + 1.5;
    }

    if (p.delivery) {
      doc.setTextColor(BRAND.gray);
      doc.text(`Delivery aparte (no cuenta): ${fmtSoles(p.delivery.ticket ?? 0)} × ${p.delivery.pedidos} pedidos`, PDF.margin, y);
      y += 5;
      doc.setTextColor(BRAND.ink);
    }
    if (p.personal) {
      doc.setTextColor(BRAND.gray);
      doc.text(`Personal aparte (no cuenta): ${fmtSoles(p.personal.ticket ?? 0)} × ${p.personal.pedidos} compras`, PDF.margin, y);
      y += 5;
      doc.setTextColor(BRAND.ink);
    }

    // Niveles y bonos
    y += 3;
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(BRAND.primary);
    doc.text("Niveles y bonos", PDF.margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      margin: { left: PDF.margin, right: PDF.margin },
      head: [["Nivel", "Meta (ticket)", "Bonos si se alcanza", "Colchón vs. pozo"]],
      body: p.porNivel.map((n) => {
        const isCurrent = p.nivelAlcanzado?.nombre === n.level.nombre;
        return [
          `${isCurrent ? "» " : ""}${n.level.nombre}`,
          fmtSoles((s.ticketBase ?? 0) + n.level.delta),
          fmtSoles(n.sumaBonos),
          n.colchon !== null ? fmtSoles(n.colchon) : "—",
        ];
      }),
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      headStyles: { fillColor: BRAND.primary, fontSize: 8 },
      didParseCell: (data) => {
        if (data.section === "body" && p.nivelAlcanzado?.nombre && (data.row.raw as string[])[0]?.includes(p.nivelAlcanzado.nombre)) {
          data.cell.styles.fillColor = "#ECFDF5";
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // Detalle diario — el "lujo de detalle" pedido
    if (y > 230) { doc.addPage(); y = drawHeader(doc, `${s.sede} · ${input.periodoLabel}`); }
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(BRAND.primary);
    doc.text("Detalle día por día", PDF.margin, y);
    y += 6;

    const conDatos = s.dailies.filter((d) => (d.personas ?? 0) > 0 || (d.revenue ?? 0) > 0);
    autoTable(doc, {
      startY: y,
      margin: { left: PDF.margin, right: PDF.margin },
      head: [["Día", "Personas", "Venta", "Ticket presencial", "Delivery (ped./S/)", "Personal (ped./S/)"]],
      body: conDatos.map((d) => {
        const pres = dailyPresencial(d);
        const delivery = (d.deliveryPedidos ?? 0) > 0 ? `${d.deliveryPedidos} / ${fmtSoles(d.deliveryVenta ?? 0)}` : "—";
        const personal = (d.personalPedidos ?? 0) > 0 ? `${d.personalPedidos} / ${fmtSoles(d.personalVenta ?? 0)}` : "—";
        return [
          `${diaSemanaCorto(d.date)} ${ddmm(d.date)}`,
          String(d.personas ?? 0),
          fmtSoles(d.revenue ?? 0),
          pres.ticket !== null ? fmtSoles(pres.ticket) : "—",
          delivery,
          personal,
        ];
      }),
      foot: [[
        "TOTAL",
        String(p.personas),
        fmtSoles(p.revenue),
        fmtSoles(p.ticketActual ?? 0),
        p.delivery ? `${p.delivery.pedidos} / ${fmtSoles(p.delivery.venta)}` : "—",
        p.personal ? `${p.personal.pedidos} / ${fmtSoles(p.personal.venta)}` : "—",
      ]],
      styles: { fontSize: 7.8, cellPadding: 1.8 },
      headStyles: { fillColor: BRAND.primary, fontSize: 7.5 },
      footStyles: { fillColor: "#F3F4F6", textColor: BRAND.ink, fontStyle: "bold" },
      didDrawPage: () => drawFooter(doc, `pág. ${page} / ${totalPages}`),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // Ranking completo del mejor vendedor
    if (y > 230) { doc.addPage(); y = drawHeader(doc, `${s.sede} · ${input.periodoLabel}`); }
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(BRAND.primary);
    doc.text(
      `Mejor vendedor${s.mvPeriodEnd ? ` (${s.mvPeriodStart ? `${ddmm(s.mvPeriodStart)}–` : "al "}${ddmm(s.mvPeriodEnd)})` : ""}`,
      PDF.margin, y,
    );
    y += 6;

    if (!s.mejorVendedor || s.mejorVendedor.ranking.length === 0) {
      doc.setFont("helvetica", "normal").setFontSize(PDF.body).setTextColor(BRAND.gray);
      doc.text("Sin reporte de trabajadores en este periodo.", PDF.margin, y);
      y += 6;
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: PDF.margin, right: PDF.margin },
        head: [["#", "Colaborador", "Turno", "Mesas", "Ticket propio", "Levantamiento", "Elegible"]],
        body: s.mejorVendedor.ranking.map((r, i) => [
          r.elegible ? String(i + 1) : "—",
          r.seller,
          r.porFranja.map((f) => JORNADA_FRANJA[f.franja] ?? f.franja).join(", "),
          String(r.totalClientes),
          r.ticketGlobal !== null ? fmtSoles(r.ticketGlobal) : "—",
          r.liftPromedio !== null ? `${r.liftPromedio >= 0 ? "+" : ""}${fmtSoles(r.liftPromedio)}` : "—",
          r.elegible ? "Sí" : `No${r.notas.length > 0 ? ` (${r.notas[0]})` : ""}`,
        ]),
        styles: { fontSize: 7.8, cellPadding: 1.8 },
        headStyles: { fillColor: BRAND.primary, fontSize: 7.5 },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === 0 && s.mejorVendedor?.ranking[0]?.elegible) {
            data.cell.styles.fillColor = "#FFFBEB";
          }
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
      if (s.noElegibles > 0) {
        doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(BRAND.gray);
        doc.text(
          `${s.noElegibles} colaborador${s.noElegibles === 1 ? "" : "es"} ${s.noElegibles === 1 ? "quedó" : "quedaron"} fuera del ranking por atender menos de ${s.minMesas} mesas en el periodo.`,
          PDF.margin, y,
        );
      }
    }

    drawFooter(doc, `pág. ${page} / ${totalPages}`);
    page++;
  }

  const safeLabel = input.periodoLabel.replace(/[^\w-]+/g, "-");
  const filename = `Piloto-Bonos-Incentivos-${safeLabel}.pdf`;
  return { blob: doc.output("blob"), filename };
}
