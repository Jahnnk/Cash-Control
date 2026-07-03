/**
 * KPIs · Renderer del deck de la reunión de los lunes (renderer tonto).
 * Reproduce la estructura del deck real de Jahnn (21-27 jun): portada →
 * resumen ejecutivo por sede → detalle por cafetería → qué mejoró/empeoró
 * → UN KPI rojo priorizado + decisión única → kaizen.
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

const fmtS = (n: number | null) =>
  n === null ? "—" : `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function weekLabel(ws: string, we: string): string {
  const d1 = new Date(ws + "T12:00:00Z");
  const d2 = new Date(we + "T12:00:00Z");
  const mes = d2.toLocaleDateString("es-PE", { month: "long", timeZone: "UTC" });
  return `Semana ${d1.getUTCDate()} – ${d2.getUTCDate()} de ${mes} ${d2.getUTCFullYear()}`;
}

function dayShort(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()}`;
}

function baseSlide(pptx: PptxGenJS, title: string, sub: string) {
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape("rect", { x: 0, y: 0, w: 10, h: 0.5, fill: { color: PRIMARY } });
  s.addText(`Yayi's · Reunión semanal de KPIs · ${sub}`, { x: 0.2, y: 0.02, w: 8, h: 0.45, fontSize: 10, color: "FFFFFF", bold: true });
  s.addText(title, { x: 0.4, y: 0.65, w: 9.2, h: 0.6, fontSize: 24, bold: true, color: PRIMARY });
  return s;
}

function kpiCard(
  s: PptxGenJS.Slide,
  x: number, y: number, w: number,
  big: string, label: string, meta: string, traffic: KpiTraffic,
  extra1: string, extra2: string,
) {
  s.addShape("roundRect", { x, y, w, h: 1.9, fill: { color: "F8FAF9" }, line: { color: "E5E7EB" }, rectRadius: 0.05 });
  s.addShape("rect", { x, y, w: 0.07, h: 1.9, fill: { color: TRAFFIC_HEX[traffic] } });
  s.addText(big, { x: x + 0.15, y: y + 0.08, w: w - 0.25, h: 0.45, fontSize: 20, bold: true, color: INK });
  s.addText(label, { x: x + 0.15, y: y + 0.55, w: w - 0.25, h: 0.3, fontSize: 10, bold: true, color: GRAY });
  s.addText(meta, { x: x + 0.15, y: y + 0.85, w: w - 0.25, h: 0.3, fontSize: 9.5, color: TRAFFIC_HEX[traffic], bold: true });
  s.addText(extra1, { x: x + 0.15, y: y + 1.18, w: w - 0.25, h: 0.3, fontSize: 8.5, color: GRAY });
  s.addText(extra2, { x: x + 0.15, y: y + 1.45, w: w - 0.25, h: 0.3, fontSize: 8.5, color: GRAY });
}

function sedeDetailSlide(pptx: PptxGenJS, sub: string, sede: string, s2: KpiWeekSummary, targets: { ventaDiaria: number; ticketRef: number; npsMin: number; mermasMaxPct: number }) {
  const s = baseSlide(pptx, `${sede} — Resumen de KPIs`, sub);
  const y = 1.5;
  kpiCard(s, 0.4, y, 2.2,
    fmtS(s2.ventasProm), "VENTAS DIARIAS (prom.)",
    `Meta ${fmtS(targets.ventaDiaria)} · ${s2.ventasPct ?? "—"}%`, s2.traffic.ventas,
    s2.best.ventas ? `Alto ${dayShort(s2.best.ventas.date)} ${fmtS(s2.best.ventas.value)}` : "",
    s2.worst.ventas ? `Bajo ${dayShort(s2.worst.ventas.date)} ${fmtS(s2.worst.ventas.value)}` : "");
  kpiCard(s, 2.8, y, 2.2,
    fmtS(s2.ticketProm), "TICKET PROMEDIO",
    `Ref. ${fmtS(targets.ticketRef)} · ${s2.ticketPct ?? "—"}%`, s2.traffic.ticket,
    s2.best.ticket ? `Alto ${dayShort(s2.best.ticket.date)} ${fmtS(s2.best.ticket.value)}` : "",
    s2.worst.ticket ? `Bajo ${dayShort(s2.worst.ticket.date)} ${fmtS(s2.worst.ticket.value)}` : "");
  kpiCard(s, 5.2, y, 2.2,
    s2.npsProm !== null ? String(s2.npsProm) : "—", "NPS (prom.)",
    `Meta ≥${targets.npsMin} ${s2.traffic.nps === "verde" ? "✓" : s2.traffic.nps === "gris" ? "· sin dato" : "✗"}`, s2.traffic.nps,
    s2.worst.nps ? `Bajo ${dayShort(s2.worst.nps.date)} = ${s2.worst.nps.value}` : "",
    "");
  kpiCard(s, 7.6, y, 2.0,
    s2.mermasPct !== null ? `${s2.mermasPct}%` : "—", "MERMAS (% ventas)",
    `Meta ≤${Math.round(targets.mermasMaxPct * 100)}% ${s2.traffic.mermas === "verde" ? "✓" : s2.traffic.mermas === "gris" ? "· sin dato" : "✗"} · ${fmtS(s2.mermasTotal)}`, s2.traffic.mermas,
    s2.best.mermas ? `Mejor ${dayShort(s2.best.mermas.date)} ${fmtS(s2.best.mermas.value)}` : "",
    s2.worst.mermas ? `Alto ${dayShort(s2.worst.mermas.date)} ${fmtS(s2.worst.mermas.value)}` : "");

  // Mini tabla diaria (la del cuadro de Notion, ahora en el deck)
  const rows: PptxGenJS.TableRow[] = [
    ["Día", "Ventas", "Ticket", "NPS", "Mermas"].map((t) => ({
      text: t, options: { bold: true, color: "FFFFFF", fill: { color: PRIMARY } as PptxGenJS.ShapeFillProps },
    })),
    ...s2.days.map((d): PptxGenJS.TableRow => [
      { text: dayShort(d.date) },
      { text: fmtS(d.ventas), options: { color: TRAFFIC_HEX[d.traffic.ventas], bold: d.traffic.ventas === "rojo" } },
      { text: d.ticket !== null ? fmtS(d.ticket) : "—", options: { color: TRAFFIC_HEX[d.traffic.ticket] } },
      { text: d.nps !== null ? String(d.nps) : "—", options: { color: TRAFFIC_HEX[d.traffic.nps] } },
      { text: d.mermasSoles !== null ? fmtS(d.mermasSoles) : "—", options: { color: TRAFFIC_HEX[d.traffic.mermas] } },
    ]),
  ];
  s.addTable(rows, { x: 0.4, y: 3.6, w: 9.2, fontSize: 9, color: INK, border: { pt: 0.5, color: "E5E7EB" }, autoPage: false });
}

export async function renderWeeklyKpiDeck(data: BoardDeckData): Promise<{ blob: Blob; filename: string }> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 10, height: 5.625 });
  pptx.layout = "WIDE";
  const sub = weekLabel(data.weekStart, data.weekEnd);

  // 1 · Portada
  const cover = pptx.addSlide();
  cover.background = { color: PRIMARY };
  cover.addText("Reunión Semanal de KPIs & Mermas", { x: 0.5, y: 1.9, w: 9, h: 0.8, fontSize: 34, bold: true, color: "FFFFFF", align: "center" });
  cover.addText(`Grupo Yayi's · ${sub}`, { x: 0.5, y: 2.8, w: 9, h: 0.5, fontSize: 16, color: "FFFFFF", align: "center" });
  cover.addText("Fonavi · Atelier · Centro", { x: 0.5, y: 3.4, w: 9, h: 0.4, fontSize: 12, color: "FFFFFF", align: "center" });

  // 2 · Resumen ejecutivo
  const rs = baseSlide(pptx, "Resumen ejecutivo de la semana", sub);
  const colW = 3.0;
  data.cafeterias.forEach((cf, i) => {
    const x = 0.4 + i * 3.2;
    rs.addText(cf.sede.toUpperCase(), { x, y: 1.4, w: colW, h: 0.35, fontSize: 14, bold: true, color: PRIMARY });
    const lines = [
      [`Ventas prom.`, `${fmtS(cf.summary.ventasProm)} · ${cf.summary.ventasPct ?? "—"}% meta`, cf.summary.traffic.ventas],
      [`Ticket prom.`, `${fmtS(cf.summary.ticketProm)} · ${cf.summary.ticketPct ?? "—"}% ref.`, cf.summary.traffic.ticket],
      [`NPS`, cf.summary.npsProm !== null ? `${cf.summary.npsProm} ${cf.summary.traffic.nps === "verde" ? "✓" : ""}` : "sin dato", cf.summary.traffic.nps],
      [`Mermas`, cf.summary.mermasPct !== null ? `${cf.summary.mermasPct}% ${cf.summary.traffic.mermas === "verde" ? "✓" : ""}` : "sin dato", cf.summary.traffic.mermas],
    ] as const;
    lines.forEach(([label, value, traffic], j) => {
      const y = 1.85 + j * 0.62;
      rs.addText(label, { x, y, w: 1.3, h: 0.3, fontSize: 10, color: GRAY });
      rs.addText(value, { x: x + 1.3, y, w: colW - 1.3, h: 0.3, fontSize: 11, bold: true, color: TRAFFIC_HEX[traffic] });
    });
  });
  const ax = 0.4 + data.cafeterias.length * 3.2;
  rs.addText("ATELIER", { x: ax, y: 1.4, w: colW, h: 0.35, fontSize: 14, bold: true, color: PRIMARY });
  if (data.atelier) {
    rs.addText(`Ventas prom./día`, { x: ax, y: 1.85, w: 1.5, h: 0.3, fontSize: 10, color: GRAY });
    rs.addText(fmtS(data.atelier.ventasProm), { x: ax + 1.5, y: 1.85, w: 1.5, h: 0.3, fontSize: 11, bold: true, color: INK });
    rs.addText(`Vendido sem.`, { x: ax, y: 2.47, w: 1.5, h: 0.3, fontSize: 10, color: GRAY });
    rs.addText(fmtS(data.atelier.ventasTotal), { x: ax + 1.5, y: 2.47, w: 1.5, h: 0.3, fontSize: 11, bold: true, color: INK });
  } else {
    rs.addText("Sin registro esta semana", { x: ax, y: 1.85, w: colW, h: 0.3, fontSize: 10, italic: true, color: GRAY });
  }

  // 3-4 · Detalle por cafetería
  for (const cf of data.cafeterias) {
    sedeDetailSlide(pptx, sub, cf.sede, cf.summary, cf.targets);
  }

  // 5 · Qué mejoró / qué empeoró
  const wowSlide = baseSlide(pptx, "¿Qué mejoró, qué empeoró y qué hacemos?", sub);
  let yy = 1.4;
  wowSlide.addText("✓ ¿Qué mejoró?", { x: 0.4, y: yy, w: 4.5, h: 0.35, fontSize: 14, bold: true, color: TRAFFIC_HEX.verde });
  wowSlide.addText("✗ ¿Qué empeoró?", { x: 5.2, y: yy, w: 4.4, h: 0.35, fontSize: 14, bold: true, color: TRAFFIC_HEX.rojo });
  yy += 0.45;
  const mejoras = data.cafeterias.flatMap((cf) => cf.wow.filter((w) => w.direction === "mejoro").map((w) => `${cf.sede} — ${w.text}`));
  const retrocesos = data.cafeterias.flatMap((cf) => cf.wow.filter((w) => w.direction === "empeoro").map((w) => `${cf.sede} — ${w.text}`));
  (mejoras.length ? mejoras : ["Sin cambios relevantes vs la semana anterior."]).slice(0, 5).forEach((t, i) => {
    wowSlide.addText(t, { x: 0.4, y: yy + i * 0.42, w: 4.6, h: 0.4, fontSize: 10.5, color: INK });
  });
  (retrocesos.length ? retrocesos : ["Sin retrocesos relevantes."]).slice(0, 5).forEach((t, i) => {
    wowSlide.addText(t, { x: 5.2, y: yy + i * 0.42, w: 4.4, h: 0.4, fontSize: 10.5, color: INK });
  });
  wowSlide.addShape("roundRect", { x: 0.4, y: 3.9, w: 9.2, h: 1.4, fill: { color: "FEF2F2" }, line: { color: "FECACA" }, rectRadius: 0.05 });
  wowSlide.addText(
    data.priorityRed
      ? `KPI en rojo priorizado: ${data.priorityRed.sede} — ${data.priorityRed.kpi} (${data.priorityRed.detail})`
      : "Sin KPIs en rojo esta semana 👏 — usar la reunión para consolidar.",
    { x: 0.6, y: 4.0, w: 8.8, h: 0.4, fontSize: 13, bold: true, color: TRAFFIC_HEX.rojo },
  );
  wowSlide.addText("Decisión / acción única: ______________________________ · Responsable: ____________ ", {
    x: 0.6, y: 4.5, w: 8.8, h: 0.4, fontSize: 11, color: INK,
  });
  wowSlide.addText("Un solo KPI en rojo · una sola acción · un responsable", { x: 0.6, y: 4.95, w: 8.8, h: 0.3, fontSize: 9, italic: true, color: GRAY });

  // 6 · Kaizen
  const kz = baseSlide(pptx, "Kaizen: una mejora por semana", sub);
  kz.addText(
    data.priorityRed ? `Foco: ${data.priorityRed.sede} — ${data.priorityRed.kpi} · revisión el próximo lunes` : "Foco libre esta semana · revisión el próximo lunes",
    { x: 0.4, y: 2.3, w: 9.2, h: 0.6, fontSize: 18, bold: true, color: INK, align: "center" },
  );

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  const filename = `KPIs_Yayis_Semana_${data.weekStart}_${data.weekEnd}.pptx`;
  return { blob, filename };
}
