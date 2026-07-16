/**
 * KPIs · Renderer del deck de la reunión (renderer tonto) — v2.
 * Estructura: portada → resumen ejecutivo (gráfico + tarjetas) → detalle
 * Fonavi → detalle Centro → detalle Atelier → meta de ticket & plan de
 * incentivos → qué mejoró/empeoró + KPI rojo priorizado → kaizen.
 * Acepta rangos personalizados (no solo la semana dom→sáb).
 *
 * v2 (feedback de la primera reunión de Jahnn): resumen con gráfico de
 * barras (antes era texto plano), slide detallada de Atelier (faltaba),
 * slide del plan de incentivos/bonos, y márgenes/visual consistentes.
 */

import PptxGenJS from "pptxgenjs";
import { BRAND } from "../report/renderers/design-system";
import type { BoardDeckData } from "@/app/actions/kpis";
import type { KpiTraffic, KpiWeekSummary } from "./engine";

const PRIMARY = BRAND.primary.replace("#", "");
const INK = BRAND.ink.replace("#", "");
const GRAY = BRAND.gray.replace("#", "");
const TRAFFIC_HEX: Record<KpiTraffic, string> = {
  verde: BRAND.traffic.verde.replace("#", ""),
  ambar: BRAND.traffic.ambar.replace("#", ""),
  rojo: BRAND.traffic.rojo.replace("#", ""),
  gris: "9CA3AF",
};

// Márgenes consistentes en todas las diapositivas (feedback v2).
const MX = 0.5;            // margen lateral
const CONTENT_W = 10 - MX * 2; // 9.0
const TITLE_Y = 0.68;
const BODY_Y = 1.45;

const fmtS = (n: number | null) =>
  n === null ? "—" : `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function rangeLabel(ws: string, we: string): string {
  const d1 = new Date(ws + "T12:00:00Z");
  const d2 = new Date(we + "T12:00:00Z");
  const mes1 = d1.toLocaleDateString("es-PE", { month: "long", timeZone: "UTC" });
  const mes2 = d2.toLocaleDateString("es-PE", { month: "long", timeZone: "UTC" });
  if (mes1 === mes2) return `Del ${d1.getUTCDate()} al ${d2.getUTCDate()} de ${mes2} ${d2.getUTCFullYear()}`;
  return `Del ${d1.getUTCDate()} de ${mes1} al ${d2.getUTCDate()} de ${mes2} ${d2.getUTCFullYear()}`;
}

function dayShort(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()}`;
}

function baseSlide(pptx: PptxGenJS, title: string, sub: string) {
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape("rect", { x: 0, y: 0, w: 10, h: 0.42, fill: { color: PRIMARY } });
  s.addText(`Yayi's · Reunión de KPIs · ${sub}`, { x: MX, y: 0, w: CONTENT_W, h: 0.42, fontSize: 10, color: "FFFFFF", bold: true, valign: "middle" });
  s.addText(title, { x: MX, y: TITLE_Y, w: CONTENT_W, h: 0.5, fontSize: 22, bold: true, color: PRIMARY });
  // Línea base sutil al pie (marco visual)
  s.addShape("rect", { x: MX, y: 5.42, w: CONTENT_W, h: 0.012, fill: { color: "E5E7EB" } });
  return s;
}

/** Punto de semáforo. */
function dot(s: PptxGenJS.Slide, x: number, y: number, traffic: KpiTraffic) {
  s.addShape("ellipse", { x, y, w: 0.14, h: 0.14, fill: { color: TRAFFIC_HEX[traffic] } });
}

function kpiCard(
  s: PptxGenJS.Slide,
  x: number, y: number, w: number,
  big: string, label: string, meta: string, traffic: KpiTraffic,
  extra1: string, extra2: string,
) {
  s.addShape("roundRect", { x, y, w, h: 1.8, fill: { color: "F8FAF9" }, line: { color: "E5E7EB" }, rectRadius: 0.05 });
  s.addShape("rect", { x, y, w: 0.07, h: 1.8, fill: { color: TRAFFIC_HEX[traffic] } });
  s.addText(big, { x: x + 0.15, y: y + 0.08, w: w - 0.25, h: 0.42, fontSize: 19, bold: true, color: INK });
  s.addText(label, { x: x + 0.15, y: y + 0.52, w: w - 0.25, h: 0.28, fontSize: 9.5, bold: true, color: GRAY });
  s.addText(meta, { x: x + 0.15, y: y + 0.8, w: w - 0.25, h: 0.28, fontSize: 9, color: TRAFFIC_HEX[traffic], bold: true });
  s.addText(extra1, { x: x + 0.15, y: y + 1.12, w: w - 0.25, h: 0.28, fontSize: 8.5, color: GRAY });
  s.addText(extra2, { x: x + 0.15, y: y + 1.4, w: w - 0.25, h: 0.28, fontSize: 8.5, color: GRAY });
}

function sedeDetailSlide(
  pptx: PptxGenJS, sub: string, sede: string, s2: KpiWeekSummary,
  targets: { ventaDiaria: number; ticketRef: number; npsMin: number; mermasMaxPct: number; tiempoMaxMin: number | null; tiempoMesaMaxMin: number | null },
) {
  const s = baseSlide(pptx, `${sede} — Detalle de KPIs`, sub);
  const y = BODY_Y;
  const cw = (CONTENT_W - 0.6) / 4; // 4 tarjetas con 0.2 de aire
  kpiCard(s, MX, y, cw,
    fmtS(s2.ventasProm), "VENTAS DIARIAS (prom.)",
    `Meta ${fmtS(targets.ventaDiaria)} · ${s2.ventasPct ?? "—"}%`, s2.traffic.ventas,
    s2.best.ventas ? `Alto ${dayShort(s2.best.ventas.date)} ${fmtS(s2.best.ventas.value)}` : "",
    s2.worst.ventas ? `Bajo ${dayShort(s2.worst.ventas.date)} ${fmtS(s2.worst.ventas.value)}` : "");
  kpiCard(s, MX + cw + 0.2, y, cw,
    fmtS(s2.ticketProm), "TICKET PROMEDIO",
    `Ref. ${fmtS(targets.ticketRef)} · ${s2.ticketPct ?? "—"}%`, s2.traffic.ticket,
    s2.best.ticket ? `Alto ${dayShort(s2.best.ticket.date)} ${fmtS(s2.best.ticket.value)}` : "",
    s2.worst.ticket ? `Bajo ${dayShort(s2.worst.ticket.date)} ${fmtS(s2.worst.ticket.value)}` : "");
  kpiCard(s, MX + (cw + 0.2) * 2, y, cw,
    s2.npsProm !== null ? String(s2.npsProm) : "—", "NPS (prom.)",
    `Meta ≥${targets.npsMin} ${s2.traffic.nps === "verde" ? "✓" : s2.traffic.nps === "gris" ? "· sin dato" : "✗"}`, s2.traffic.nps,
    s2.worst.nps ? `Bajo ${dayShort(s2.worst.nps.date)} = ${s2.worst.nps.value}` : "",
    "");
  kpiCard(s, MX + (cw + 0.2) * 3, y, cw,
    s2.mermasPct !== null ? `${s2.mermasPct}%` : "—", "MERMAS (% ventas)",
    `Meta ≤${Math.round(targets.mermasMaxPct * 100)}% · ${fmtS(s2.mermasTotal)}`, s2.traffic.mermas,
    s2.best.mermas ? `Mejor ${dayShort(s2.best.mermas.date)} ${fmtS(s2.best.mermas.value)}` : "",
    s2.worst.mermas ? `Alto ${dayShort(s2.worst.mermas.date)} ${fmtS(s2.worst.mermas.value)}` : "");

  // Tabla diaria (ahora con los DOS tiempos medidos)
  const rows: PptxGenJS.TableRow[] = [
    ["Día", "Ventas", "Ticket", "NPS", "Mermas", `T. most. (<${targets.tiempoMaxMin ?? "—"}m)`, `T. mesa (<${targets.tiempoMesaMaxMin ?? "—"}m)`].map((t) => ({
      text: t, options: { bold: true, color: "FFFFFF", fill: { color: PRIMARY } as PptxGenJS.ShapeFillProps },
    })),
    ...s2.days.map((d): PptxGenJS.TableRow => [
      { text: dayShort(d.date) },
      { text: fmtS(d.ventas), options: { color: TRAFFIC_HEX[d.traffic.ventas], bold: d.traffic.ventas === "rojo" } },
      { text: d.ticket !== null ? fmtS(d.ticket) : "—", options: { color: TRAFFIC_HEX[d.traffic.ticket] } },
      { text: d.nps !== null ? String(d.nps) : "—", options: { color: TRAFFIC_HEX[d.traffic.nps] } },
      { text: d.mermasSoles !== null ? fmtS(d.mermasSoles) : "—", options: { color: TRAFFIC_HEX[d.traffic.mermas] } },
      { text: d.tiempoMin !== null ? `${d.tiempoMin} min` : "—", options: { color: TRAFFIC_HEX[d.traffic.tiempo] } },
      { text: d.tiempoMesaMin !== null ? `${d.tiempoMesaMin} min` : "—", options: { color: TRAFFIC_HEX[d.traffic.tiempoMesa] } },
    ]),
  ];
  s.addTable(rows, { x: MX, y: y + 2.0, w: CONTENT_W, fontSize: 8.5, color: INK, border: { pt: 0.5, color: "E5E7EB" }, autoPage: false });
}

/** Slide detallada de Atelier (B2B: ventas diarias, sin KPIs del programa). */
function atelierDetailSlide(pptx: PptxGenJS, sub: string, at: NonNullable<BoardDeckData["atelier"]>) {
  const s = baseSlide(pptx, "Atelier — Detalle de ventas (B2B)", sub);
  const y = BODY_Y;
  const cw = (CONTENT_W - 0.6) / 4;
  kpiCard(s, MX, y, cw, fmtS(at.ventasTotal), "VENDIDO EN EL PERIODO", `${at.daysWithData} día${at.daysWithData === 1 ? "" : "s"} con venta`, "gris", "", "");
  kpiCard(s, MX + cw + 0.2, y, cw, fmtS(at.ventasProm), "PROMEDIO POR DÍA", "sobre días con venta", "gris", "", "");
  kpiCard(s, MX + (cw + 0.2) * 2, y, cw,
    at.best ? fmtS(at.best.value) : "—", "MEJOR DÍA", at.best ? dayShort(at.best.date) : "", "verde", "", "");
  kpiCard(s, MX + (cw + 0.2) * 3, y, cw,
    at.worst ? fmtS(at.worst.value) : "—", "DÍA MÁS BAJO", at.worst ? dayShort(at.worst.date) : "", "ambar", "", "");

  const rows: PptxGenJS.TableRow[] = [
    ["Día", "Venta Byte"].map((t) => ({
      text: t, options: { bold: true, color: "FFFFFF", fill: { color: PRIMARY } as PptxGenJS.ShapeFillProps },
    })),
    ...at.days.map((d): PptxGenJS.TableRow => [
      { text: dayShort(d.date) },
      { text: fmtS(d.value) },
    ]),
  ];
  s.addTable(rows, { x: MX, y: y + 2.0, w: 4.4, fontSize: 9, color: INK, border: { pt: 0.5, color: "E5E7EB" }, autoPage: false });

  // Los otros 2 KPIs de Atelier (registro de la supervisora, jul-2026):
  // ticket promedio por pedido y mermas de producción.
  let ny = y + 2.0;
  if (at.ticketProm !== null) {
    s.addText(`Ticket promedio: ${fmtS(at.ticketProm)} por pedido`, {
      x: 5.2, y: ny, w: 4.3, h: 0.3, fontSize: 11, bold: true, color: INK,
    });
    ny += 0.36;
  }
  if (at.mermasTotal !== null) {
    s.addText(
      `Mermas del periodo: ${fmtS(at.mermasTotal)}${at.mermasPct !== null ? ` (${at.mermasPct}% de la venta)` : ""}`,
      { x: 5.2, y: ny, w: 4.3, h: 0.3, fontSize: 11, bold: true, color: at.mermasPct !== null && at.mermasPct > 4 ? TRAFFIC_HEX.rojo : INK },
    );
    ny += 0.36;
  }
  s.addText(
    "Atelier es el centro de producción B2B: sus clientes pagan a crédito (7/15/30 días), por eso se miden su VENTA, su ticket por pedido y sus mermas — no los KPIs de salón (NPS, tiempos).",
    { x: 5.2, y: ny + 0.1, w: 4.3, h: 1.4, fontSize: 10, color: GRAY, italic: true, valign: "top" },
  );
}

/** Flecha de variación coloreada (▲ verde / ▼ rojo / — gris). */
function deltaText(pct: number | null): { text: string; color: string } {
  if (pct === null) return { text: "sin comparativo", color: GRAY };
  const up = pct >= 0;
  return { text: `${up ? "▲" : "▼"} ${up ? "+" : ""}${pct}%`, color: up ? TRAFFIC_HEX.verde : TRAFFIC_HEX.rojo };
}

/** Slide de ventas Byte: acumulado del mes + vs semana y mes pasado. */
function ventasSlide(pptx: PptxGenJS, sub: string, ventas: NonNullable<BoardDeckData["ventas"]>, weekEnd: string) {
  const s = baseSlide(pptx, "Ventas del mes (Byte) — ¿cómo vamos vs antes?", sub);
  const colW = (CONTENT_W - 0.6) / 3;
  ventas.forEach((v, i) => {
    const x = MX + i * (colW + 0.3);
    s.addShape("roundRect", { x, y: BODY_Y, w: colW, h: 3.6, fill: { color: "F8FAF9" }, line: { color: "E5E7EB" }, rectRadius: 0.06 });
    s.addText(v.sede.toUpperCase(), { x: x + 0.2, y: BODY_Y + 0.12, w: colW - 0.4, h: 0.32, fontSize: 13, bold: true, color: PRIMARY });
    if (v.hasta === null) {
      s.addText("Sin reporte de ventas subido.", { x: x + 0.2, y: BODY_Y + 0.7, w: colW - 0.4, h: 0.4, fontSize: 10, italic: true, color: GRAY });
      return;
    }
    // Rango del informe vs ventana anterior
    s.addText("VENTA DEL PERIODO", { x: x + 0.2, y: BODY_Y + 0.55, w: colW - 0.4, h: 0.24, fontSize: 8, color: GRAY });
    s.addText(fmtS(v.rango), { x: x + 0.2, y: BODY_Y + 0.78, w: colW - 0.4, h: 0.4, fontSize: 17, bold: true, color: INK });
    const dr = deltaText(v.deltaRangoPct);
    s.addText(`${dr.text} vs periodo anterior${v.rangoPrev !== null ? ` (${fmtS(v.rangoPrev)})` : ""}`, {
      x: x + 0.2, y: BODY_Y + 1.2, w: colW - 0.4, h: 0.26, fontSize: 9, bold: true, color: dr.color,
    });
    // Acumulado del mes vs mes pasado (mismos días)
    s.addText("ACUMULADO DEL MES", { x: x + 0.2, y: BODY_Y + 1.66, w: colW - 0.4, h: 0.24, fontSize: 8, color: GRAY });
    s.addText(fmtS(v.mes), { x: x + 0.2, y: BODY_Y + 1.89, w: colW - 0.4, h: 0.4, fontSize: 17, bold: true, color: INK });
    const dm = deltaText(v.deltaMesPct);
    s.addText(`${dm.text} vs mes pasado a mismos días${v.mesPrev !== null ? ` (${fmtS(v.mesPrev)})` : ""}`, {
      x: x + 0.2, y: BODY_Y + 2.31, w: colW - 0.4, h: 0.42, fontSize: 9, bold: true, color: dm.color,
    });
    // Frescura: hasta cuándo hay datos
    const fresh = v.hasta < weekEnd;
    s.addText(`Datos hasta el ${dayShort(v.hasta)}${fresh ? " ⚠ falta subir el reporte" : ""}`, {
      x: x + 0.2, y: BODY_Y + 2.95, w: colW - 0.4, h: 0.3, fontSize: 8.5, italic: true, color: fresh ? "B45309" : GRAY,
    });
  });
  s.addText(
    "El comparativo del mes es a MISMOS DÍAS transcurridos (día 1 al corte, ambos meses) — nunca un mes a medias contra un mes completo. Fuente: reporte semanal de Ventas de Byte.",
    { x: MX, y: 4.6, w: CONTENT_W, h: 0.5, fontSize: 9, italic: true, color: GRAY },
  );
}

/** Slide del plan de incentivos: meta de ticket, nivel, pozo y bonos. */
function incentivesSlide(pptx: PptxGenJS, sub: string, cafeterias: BoardDeckData["cafeterias"]) {
  const s = baseSlide(pptx, "Meta de ticket & plan de incentivos (mes en curso)", sub);
  const colW = (CONTENT_W - 0.3) / 2;
  cafeterias.forEach((cf, i) => {
    const x = MX + i * (colW + 0.3);
    const inc = cf.incentives;
    s.addShape("roundRect", { x, y: BODY_Y, w: colW, h: 3.75, fill: { color: "F8FAF9" }, line: { color: "E5E7EB" }, rectRadius: 0.06 });
    s.addText(cf.sede.toUpperCase(), { x: x + 0.2, y: BODY_Y + 0.1, w: colW - 0.4, h: 0.32, fontSize: 14, bold: true, color: PRIMARY });
    if (!inc) {
      s.addText("Sin configuración de incentivos.", { x: x + 0.2, y: BODY_Y + 0.6, w: colW - 0.4, h: 0.4, fontSize: 10, italic: true, color: GRAY });
      return;
    }
    const deltaColor = (inc.deltaActual ?? 0) > 0 ? TRAFFIC_HEX.verde : TRAFFIC_HEX.rojo;
    // Ticket: base → actual
    s.addText(`Ticket: base ${fmtS(inc.ticketBase)}  →  actual ${fmtS(inc.ticketActual)}`, {
      x: x + 0.2, y: BODY_Y + 0.5, w: colW - 0.4, h: 0.3, fontSize: 11.5, bold: true, color: INK,
    });
    s.addText(
      inc.deltaActual !== null ? `${inc.deltaActual >= 0 ? "+" : ""}${fmtS(inc.deltaActual)} de venta nueva por cliente` : "sin datos del mes aún",
      { x: x + 0.2, y: BODY_Y + 0.82, w: colW - 0.4, h: 0.28, fontSize: 10, bold: true, color: deltaColor },
    );
    // Nivel + próximo
    s.addText(
      `Nivel alcanzado: ${inc.nivelAlcanzado ?? "aún sin nivel"}` +
      (inc.proximoNivel ? `   ·   Falta ${fmtS(inc.proximoNivel.faltaSoles)} de ticket para ${inc.proximoNivel.nombre}` : ""),
      { x: x + 0.2, y: BODY_Y + 1.14, w: colW - 0.4, h: 0.3, fontSize: 9.5, color: INK },
    );
    // Piso de tráfico + pozo
    s.addText(
      `Piso de tráfico: ${inc.personasPorDia ?? "—"} pers/día (mín. ${inc.trafficFloor}) ${inc.trafficOk ? "✓ la meta cuenta" : "✗ sin el piso, la meta NO cuenta"}`,
      { x: x + 0.2, y: BODY_Y + 1.44, w: colW - 0.4, h: 0.3, fontSize: 9.5, bold: !inc.trafficOk, color: inc.trafficOk ? TRAFFIC_HEX.verde : TRAFFIC_HEX.rojo },
    );
    s.addText(`Pozo proyectado al cierre: ${fmtS(inc.pozoProyectado)} (techo 40% de la utilidad nueva)`, {
      x: x + 0.2, y: BODY_Y + 1.74, w: colW - 0.4, h: 0.3, fontSize: 9.5, color: GRAY,
    });
    // Tabla de niveles y bonos
    const rows: PptxGenJS.TableRow[] = [
      ["Nivel", "Ticket meta", "Bonos a pagar"].map((t) => ({
        text: t, options: { bold: true, color: "FFFFFF", fill: { color: PRIMARY } as PptxGenJS.ShapeFillProps },
      })),
      ...inc.niveles.map((n): PptxGenJS.TableRow => {
        const isCurrent = inc.nivelAlcanzado === n.nombre;
        return [
          { text: `${isCurrent ? "✓ " : ""}${n.nombre}`, options: { bold: isCurrent } },
          { text: fmtS(inc.ticketBase + n.delta) },
          { text: fmtS(n.sumaBonos), options: { bold: isCurrent } },
        ];
      }),
    ];
    s.addTable(rows, { x: x + 0.2, y: BODY_Y + 2.15, w: colW - 0.4, fontSize: 9, color: INK, border: { pt: 0.5, color: "E5E7EB" }, autoPage: false });
  });
  s.addText("El bono se paga solo con la VENTA NUEVA (subir el ticket) y con el piso de tráfico cumplido — nunca con la utilidad de hoy.", {
    x: MX, y: 5.02, w: CONTENT_W, h: 0.3, fontSize: 9, italic: true, color: GRAY,
  });
}

export async function renderWeeklyKpiDeck(data: BoardDeckData): Promise<{ blob: Blob; filename: string }> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 10, height: 5.625 });
  pptx.layout = "WIDE";
  const sub = rangeLabel(data.weekStart, data.weekEnd);

  // 1 · Portada
  const cover = pptx.addSlide();
  cover.background = { color: PRIMARY };
  cover.addShape("rect", { x: 0, y: 5.2, w: 10, h: 0.425, fill: { color: "FFFFFF", transparency: 85 } });
  cover.addText(data.isCustomRange ? "Reporte de KPIs & Mermas" : "Reunión Semanal de KPIs & Mermas", {
    x: MX, y: 1.9, w: CONTENT_W, h: 0.8, fontSize: 34, bold: true, color: "FFFFFF", align: "center",
  });
  cover.addText(`Grupo Yayi's · ${sub}`, { x: MX, y: 2.8, w: CONTENT_W, h: 0.5, fontSize: 16, color: "FFFFFF", align: "center" });
  cover.addText("Fonavi · Centro · Atelier", { x: MX, y: 3.4, w: CONTENT_W, h: 0.4, fontSize: 12, color: "FFFFFF", align: "center" });

  // 2 · Resumen ejecutivo: gráfico de cumplimiento + tarjetas por sede
  const rs = baseSlide(pptx, "Resumen ejecutivo", sub);
  // Gráfico de barras: % de cumplimiento (ventas y ticket) por cafetería.
  rs.addChart("bar", [
    {
      name: "Ventas (% de meta)",
      labels: data.cafeterias.map((c) => c.sede),
      values: data.cafeterias.map((c) => c.summary.ventasPct ?? 0),
    },
    {
      name: "Ticket (% de ref.)",
      labels: data.cafeterias.map((c) => c.sede),
      values: data.cafeterias.map((c) => c.summary.ticketPct ?? 0),
    },
  ], {
    x: MX, y: BODY_Y, w: 4.6, h: 3.5,
    barDir: "col",
    chartColors: [PRIMARY, "C65A3A"],
    showValue: true,
    dataLabelFormatCode: "0\\%",
    valAxisMaxVal: 120,
    valAxisMinVal: 0,
    catAxisLabelFontSize: 10,
    valAxisLabelFontSize: 9,
    dataLabelFontSize: 9,
    showLegend: true,
    legendPos: "b",
    legendFontSize: 9,
    valGridLine: { style: "dash", color: "E5E7EB", size: 0.5 },
  });
  rs.addText("100% = meta cumplida", { x: MX, y: BODY_Y + 3.5, w: 4.6, h: 0.25, fontSize: 8.5, italic: true, color: GRAY, align: "center" });

  // Tarjetas por sede a la derecha (con puntos de semáforo).
  const cardX = 5.4;
  const cardW = 10 - MX - cardX;
  const sedeBlocks: { title: string; lines: [string, string, KpiTraffic][] }[] = data.cafeterias.map((cf) => ({
    title: cf.sede.toUpperCase(),
    lines: [
      ["Ventas prom.", `${fmtS(cf.summary.ventasProm)} · ${cf.summary.ventasPct ?? "—"}%`, cf.summary.traffic.ventas],
      ["Ticket prom.", `${fmtS(cf.summary.ticketProm)} · ${cf.summary.ticketPct ?? "—"}%`, cf.summary.traffic.ticket],
      ["NPS · Mermas", `${cf.summary.npsProm ?? "—"} · ${cf.summary.mermasPct !== null ? cf.summary.mermasPct + "%" : "—"}`, cf.summary.traffic.nps],
    ],
  }));
  sedeBlocks.push({
    title: "ATELIER (B2B)",
    lines: data.atelier
      ? [["Vendido", `${fmtS(data.atelier.ventasTotal)} en ${data.atelier.daysWithData} días`, "gris"],
         ["Ticket · Mermas",
          `${data.atelier.ticketProm !== null ? fmtS(data.atelier.ticketProm) : "—"} · ${data.atelier.mermasPct !== null ? data.atelier.mermasPct + "%" : "—"}`,
          "gris"]]
      : [["Sin registro en el periodo", "", "gris"]],
  });
  let by = BODY_Y;
  for (const b of sedeBlocks) {
    const blockH = 0.34 + b.lines.length * 0.3 + 0.08;
    rs.addShape("roundRect", { x: cardX, y: by, w: cardW, h: blockH, fill: { color: "F8FAF9" }, line: { color: "E5E7EB" }, rectRadius: 0.04 });
    rs.addText(b.title, { x: cardX + 0.15, y: by + 0.05, w: cardW - 0.3, h: 0.3, fontSize: 11, bold: true, color: PRIMARY });
    b.lines.forEach(([label, value, traffic], j) => {
      const ly = by + 0.36 + j * 0.3;
      dot(rs, cardX + 0.15, ly + 0.06, traffic);
      rs.addText(label, { x: cardX + 0.38, y: ly, w: 1.35, h: 0.28, fontSize: 9, color: GRAY });
      rs.addText(value, { x: cardX + 1.73, y: ly, w: cardW - 1.9, h: 0.28, fontSize: 10, bold: true, color: INK });
    });
    by += blockH + 0.14;
  }

  // 2b · Ventas del mes (Byte): acumulado + comparativos, las 3 sedes
  if (data.ventas) ventasSlide(pptx, sub, data.ventas, data.weekEnd);

  // 3-4 · Detalle por cafetería
  for (const cf of data.cafeterias) {
    sedeDetailSlide(pptx, sub, cf.sede, cf.summary, cf.targets);
  }

  // 5 · Detalle de Atelier (faltaba en v1)
  if (data.atelier) atelierDetailSlide(pptx, sub, data.atelier);

  // 6 · Meta de ticket & plan de incentivos
  incentivesSlide(pptx, sub, data.cafeterias);

  // 7 · Qué mejoró / qué empeoró + KPI rojo priorizado
  const wowSlide = baseSlide(pptx, "¿Qué mejoró, qué empeoró y qué hacemos?", sub);
  let yy = BODY_Y;
  const halfW = (CONTENT_W - 0.3) / 2;
  wowSlide.addText("✓ ¿Qué mejoró?", { x: MX, y: yy, w: halfW, h: 0.35, fontSize: 14, bold: true, color: TRAFFIC_HEX.verde });
  wowSlide.addText("✗ ¿Qué empeoró?", { x: MX + halfW + 0.3, y: yy, w: halfW, h: 0.35, fontSize: 14, bold: true, color: TRAFFIC_HEX.rojo });
  yy += 0.45;
  const mejoras = data.cafeterias.flatMap((cf) => cf.wow.filter((w) => w.direction === "mejoro").map((w) => `${cf.sede} — ${w.text}`));
  const retrocesos = data.cafeterias.flatMap((cf) => cf.wow.filter((w) => w.direction === "empeoro").map((w) => `${cf.sede} — ${w.text}`));
  (mejoras.length ? mejoras : ["Sin cambios relevantes vs el periodo anterior."]).slice(0, 5).forEach((t, i) => {
    wowSlide.addText(t, { x: MX, y: yy + i * 0.42, w: halfW, h: 0.4, fontSize: 10, color: INK });
  });
  (retrocesos.length ? retrocesos : ["Sin retrocesos relevantes."]).slice(0, 5).forEach((t, i) => {
    wowSlide.addText(t, { x: MX + halfW + 0.3, y: yy + i * 0.42, w: halfW, h: 0.4, fontSize: 10, color: INK });
  });
  wowSlide.addShape("roundRect", { x: MX, y: 3.85, w: CONTENT_W, h: 1.4, fill: { color: "FEF2F2" }, line: { color: "FECACA" }, rectRadius: 0.05 });
  wowSlide.addText(
    data.priorityRed
      ? `KPI en rojo priorizado: ${data.priorityRed.sede} — ${data.priorityRed.kpi} (${data.priorityRed.detail})`
      : "Sin KPIs en rojo este periodo 👏 — usar la reunión para consolidar.",
    { x: MX + 0.2, y: 3.95, w: CONTENT_W - 0.4, h: 0.4, fontSize: 13, bold: true, color: TRAFFIC_HEX.rojo },
  );
  wowSlide.addText("Decisión / acción única: ______________________________ · Responsable: ____________ ", {
    x: MX + 0.2, y: 4.45, w: CONTENT_W - 0.4, h: 0.4, fontSize: 11, color: INK,
  });
  wowSlide.addText("Un solo KPI en rojo · una sola acción · un responsable", { x: MX + 0.2, y: 4.9, w: CONTENT_W - 0.4, h: 0.3, fontSize: 9, italic: true, color: GRAY });

  // 8 · Kaizen
  const kz = baseSlide(pptx, "Kaizen: una mejora por semana", sub);
  kz.addText(
    data.priorityRed ? `Foco: ${data.priorityRed.sede} — ${data.priorityRed.kpi} · revisión la próxima reunión` : "Foco libre · revisión la próxima reunión",
    { x: MX, y: 2.3, w: CONTENT_W, h: 0.6, fontSize: 18, bold: true, color: INK, align: "center" },
  );

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  const filename = `KPIs_Yayis_${data.weekStart}_${data.weekEnd}.pptx`;
  return { blob, filename };
}
