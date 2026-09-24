/**
 * Las 8 primeras diapositivas de la Reunión Semanal (rediseño del 24-sep-2026,
 * sobre las referencias que armó Jahnn): portada, la semana en una mirada,
 * ventas del mes, detalle de Fonavi, detalle de Centro, Atelier B2B,
 * incentivos y punto de equilibrio.
 *
 * Renderer tonto: los números llegan calculados (actions/kpis.ts,
 * actions/breakeven.ts); las "Lecturas" salen de reglas fijas
 * (lectura-semana.ts). Diseño compartido en deck-diseno.ts.
 */

import type PptxGenJS from "pptxgenjs";
import type { BoardDeckData } from "@/app/actions/kpis";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import type { BreakevenEstado } from "@/lib/breakeven";
import type { KpiTraffic, KpiWeekSummary } from "./engine";
import { LOGO } from "./deck-assets";
import {
  C, FONT, FUERTE, MX, ANCHO, SUAVE, TEXTO, W, H,
  diapositiva, tarjeta, pastilla, texto, icono, iconoTono, lecturaPorSede, hallazgosEnColumna, hallazgosEnFila, lineasEstimadas,
  periodoLargo, rangoCorto, solesDeck, solesDeck0,
} from "./deck-diseno";
import {
  avanceNivel, hallazgosAtelier, hallazgosCafeteria, hallazgosEquilibrio, hallazgosIncentivos,
  lecturaAtelier, lecturaCafeteria, lecturaVentas, peorTono, type Tono,
} from "./lectura-semana";
import { anchoBarra, faltaParaEquilibrio, POS_META, diaCorto } from "./breakeven-slide";
import { monthLabel } from "@/lib/utils";

type Cafeteria = BoardDeckData["cafeterias"][number];
type Atelier = NonNullable<BoardDeckData["atelier"]>;
type Ventas = NonNullable<BoardDeckData["ventas"]>[number];

const t2t = (t: KpiTraffic): Tono => t;
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const diaCortoSemana = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`; };
const pctTxt = (p: number | null) => (p === null ? "—" : `${p.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
const deltaTxt = (p: number | null) => (p === null ? "—" : `${p > 0 ? "+" : ""}${p.toLocaleString("es-PE", { maximumFractionDigits: 2 })}%`);
const MERMA_ATELIER_MAX = 0.04;

/** Contexto común a todas las diapositivas. */
export type Ctx = { pptx: PptxGenJS; periodo: string; ws: string; we: string };

export function contexto(pptx: PptxGenJS, ws: string, we: string): Ctx {
  return { pptx, periodo: periodoLargo(ws, we), ws, we };
}

/* ─────────────────────────── 1 · Portada ─────────────────────────── */

export function portada(ctx: Ctx, personalizado: boolean) {
  const s = ctx.pptx.addSlide();
  s.background = { color: C.oscuro };
  const lw = 2.0;
  s.addImage({ data: LOGO.crema, x: W - lw - 0.4, y: 0.35, w: lw, h: lw / 2.954 });
  texto(s, personalizado ? "Yayi's | Reporte de KPIs" : "Yayi's | Reunión Semanal", {
    x: MX, y: 1.9, w: ANCHO, h: 0.9, fontSize: 40, bold: true, color: C.crema, align: "center",
  });
  s.addShape("line", { x: W / 2 - 0.7, y: 2.95, w: 1.4, h: 0, line: { color: C.verde, width: 3 } });
  texto(s, ctx.periodo, { x: MX, y: 3.08, w: ANCHO, h: 0.5, fontSize: 18, color: "6DB08A", align: "center" });
  texto(s, "Fonavi · Centro · Atelier", { x: MX, y: 3.6, w: ANCHO, h: 0.4, fontSize: 12, color: C.crema, align: "center" });
}

/* ──────────────────── 2 · La semana en una mirada ──────────────────── */

type Fila = { icono: Parameters<typeof icono>[1]; etiqueta: string; valor: string; pill: string; tono: Tono; flecha?: "arriba" | "abajo" | null; nota: string };

function tarjetaSede(s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, o: {
  nombre: string; tipo: string; iconoSede: "tienda" | "fabrica"; tono: Tono; filas: Fila[];
}) {
  const cab = 0.52;
  tarjeta(s, x, y, w, h, { cabecera: { alto: cab, color: SUAVE[o.tono] } });
  icono(s, o.iconoSede, "oscuro", x + 0.16, y + 0.1, 0.32);
  texto(s, o.nombre.toUpperCase(), { x: x + 0.58, y: y + 0.06, w: w - 0.9, h: 0.24, fontSize: 12.5, bold: true, color: C.tinta });
  texto(s, o.tipo, { x: x + 0.58, y: y + 0.28, w: w - 0.9, h: 0.18, fontSize: 8.5, color: C.gris });
  texto(s, "›", { x: x + w - 0.36, y: y + 0.06, w: 0.2, h: 0.36, fontSize: 18, color: C.oscuro, align: "center" });
  const fh = (h - cab - 0.06) / o.filas.length;
  o.filas.forEach((f, i) => {
    const fy = y + cab + 0.03 + i * fh;
    if (i > 0) s.addShape("line", { x: x + 0.14, y: fy, w: w - 0.28, h: 0, line: { color: C.borde, width: 0.5 } });
    icono(s, f.icono, "oscuro", x + 0.16, fy + fh / 2 - 0.13, 0.26);
    texto(s, f.etiqueta, { x: x + 0.55, y: fy + fh / 2 - 0.2, w: w - 1.7, h: 0.17, fontSize: 8.5, color: C.gris });
    texto(s, f.valor, { x: x + 0.55, y: fy + fh / 2 - 0.02, w: w - 1.6, h: 0.26, fontSize: 14.5, bold: true, color: C.tinta });
    pastilla(s, x + w - 1.08, fy + fh / 2 - 0.2, 0.92, 0.24, f.pill, f.tono, { flecha: f.flecha, tam: 10 });
    texto(s, f.nota, { x: x + w - 1.2, y: fy + fh / 2 + 0.06, w: 1.16, h: 0.16, fontSize: 7.5, color: C.gris, align: "center" });
  });
}

function filaPct(etiqueta: string, icon: Fila["icono"], valor: string, pct: number | null, traffic: KpiTraffic, nota: string): Fila {
  return {
    icono: icon, etiqueta, valor, pill: pct === null ? "—" : pctTxt(pct), tono: pct === null ? "gris" : t2t(traffic),
    flecha: pct === null ? null : pct >= 100 ? "arriba" : "abajo", nota: pct === null ? "(sin dato)" : nota,
  };
}

function filasCafeteria(cf: Cafeteria): Fila[] {
  const sm = cf.summary;
  const tg = cf.targets;
  const merma = sm.mermasPct === null ? { pill: "—", tono: "gris" as Tono }
    : { pill: sm.traffic.mermas === "verde" ? "En rango" : sm.traffic.mermas === "ambar" ? "Cerca del límite" : "Fuera de rango", tono: t2t(sm.traffic.mermas) };
  return [
    filaPct("Ventas promedio diario", "barras", solesDeck(sm.ventasProm), sm.ventasPct, sm.traffic.ventas, "vs. meta"),
    filaPct("Ticket promedio", "carrito", solesDeck(sm.ticketProm), sm.ticketPct, sm.traffic.ticket, "vs. referencia"),
    {
      icono: "estrella", etiqueta: "NPS (satisfacción)", valor: sm.npsProm === null ? "—" : String(sm.npsProm),
      pill: sm.npsProm === null ? "—" : sm.traffic.nps === "verde" ? "En meta" : "Bajo meta", tono: sm.npsProm === null ? "gris" : t2t(sm.traffic.nps),
      nota: `(meta ≥ ${tg.npsMin})`,
    },
    { icono: "torta", etiqueta: "Mermas", valor: sm.mermasPct === null ? "—" : `${sm.mermasPct}%`, pill: merma.pill, tono: merma.tono, nota: `(≤ ${Math.round(tg.mermasMaxPct * 100)}%)` },
  ];
}

export function laSemanaEnUnaMirada(ctx: Ctx, d: BoardDeckData) {
  const s = diapositiva(ctx.pptx, {
    titulo: "La semana en una mirada", subtitulo: "Principales indicadores por unidad y cumplimiento de metas.",
    periodo: ctx.periodo, derecha: "Fonavi · Centro · Atelier",
  });
  // Leyenda del semáforo.
  const lx = 5.55, ly = 0.62;
  tarjeta(s, lx, ly, W - MX - lx, 0.38);
  const items: [Tono, string][] = [["verde", "En meta"], ["ambar", "Cerca de meta"], ["rojo", "Bajo meta"], ["gris", "Sin referencia"]];
  let ix = lx + 0.16;
  for (const [t, l] of items) {
    s.addShape("ellipse", { x: ix, y: ly + 0.12, w: 0.14, h: 0.14, fill: { color: FUERTE[t] }, line: { color: FUERTE[t] } });
    texto(s, l, { x: ix + 0.19, y: ly, w: 0.85, h: 0.38, fontSize: 8.5, color: C.tinta });
    ix += l.length > 10 ? 1.08 : 0.86;
  }

  const y = 1.36, h = 2.3, gap = 0.2;
  const w = (ANCHO - gap * 2) / 3;
  d.cafeterias.forEach((cf, i) => {
    tarjetaSede(s, MX + i * (w + gap), y, w, h, {
      nombre: cf.sede, tipo: "Cafetería", iconoSede: "tienda",
      tono: cf.summary.ventasPct === null ? "gris" : peorTono(t2t(cf.summary.traffic.ventas), t2t(cf.summary.traffic.ticket)),
      filas: filasCafeteria(cf),
    });
  });
  const at = d.atelier;
  const ax = MX + d.cafeterias.length * (w + gap);
  const mermaAt: Tono = at?.mermasPct == null ? "gris" : at.mermasPct <= MERMA_ATELIER_MAX * 100 ? "verde" : "rojo";
  tarjetaSede(s, ax, y, w, h, {
    nombre: "Atelier (B2B)", tipo: "Producción", iconoSede: "fabrica", tono: "gris",
    filas: [
      { icono: "barras", etiqueta: `Ventas (${at?.daysWithData ?? 0} días)`, valor: solesDeck(at?.ventasTotal ?? null), pill: "—", tono: "gris", nota: "(sin meta)" },
      { icono: "carrito", etiqueta: "Ticket promedio", valor: solesDeck(at?.ticketProm ?? null), pill: "—", tono: "gris", nota: "(sin referencia)" },
      { icono: "torta", etiqueta: "Mermas", valor: at?.mermasPct == null ? "—" : `${at.mermasPct}%`, pill: mermaAt === "verde" ? "En rango" : mermaAt === "rojo" ? "Fuera de rango" : "—", tono: mermaAt, nota: `(≤ ${MERMA_ATELIER_MAX * 100}%)` },
    ],
  });

  const lecturas = [
    ...d.cafeterias.map((cf) => lecturaCafeteria({
      sede: cf.sede, ventasPct: cf.summary.ventasPct, ticketPct: cf.summary.ticketPct, nps: cf.summary.npsProm, npsMin: cf.targets.npsMin,
      mermasPct: cf.summary.mermasPct, mermasMaxPct: cf.targets.mermasMaxPct, traffic: cf.summary.traffic,
    })),
    ...(at ? [lecturaAtelier({ ventasTotal: at.ventasTotal, dias: at.daysWithData, ticketProm: at.ticketProm, mermasPct: at.mermasPct, mermasMaxPct: MERMA_ATELIER_MAX })] : []),
  ];
  lecturaPorSede(s, MX, 3.78, ANCHO, H - 3.78 - 0.1, lecturas, { conAccion: true });
}

/* ──────────────────────── 3 · Ventas del mes ──────────────────────── */

export function ventasDelMes(ctx: Ctx, ventas: Ventas[], weekEnd: string) {
  const dia = Number(weekEnd.slice(8, 10));
  const s = diapositiva(ctx.pptx, {
    titulo: "Ventas del mes (Byte) — ¿cómo vamos vs antes?",
    subtitulo: `Comparativo a mismos días transcurridos del mes (día 1 al ${dia}). Fuente: Byte.`,
    periodo: ctx.periodo, derecha: "Ventas (Byte)",
  });
  const orden = ["Atelier", "Fonavi", "Centro"];
  const lista = [...ventas].sort((a, b) => orden.findIndex((o) => a.sede.includes(o)) - orden.findIndex((o) => b.sede.includes(o)));
  const y = 1.36, h = 2.56, gap = 0.2;
  const w = (ANCHO - gap * 2) / lista.length;
  const mesAct = weekEnd.slice(0, 7);
  const [yy, mm] = mesAct.split("-").map(Number);
  const prev = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, "0")}`;
  const MES = (m: string) => ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"][Number(m.slice(5, 7)) - 1] + " " + m.slice(0, 4);

  const lecturas = lista.map((v) => lecturaVentas({ sede: v.sede, deltaSemanaPct: v.deltaRangoPct, deltaMesPct: v.deltaMesPct, esAtelier: v.sede.includes("Atelier") }));

  lista.forEach((v, i) => {
    const x = MX + i * (w + gap);
    const lec = lecturas[i];
    const esAt = v.sede.includes("Atelier");
    tarjeta(s, x, y, w, h, { cabecera: { alto: 0.5, color: SUAVE[lec.tono] } });
    icono(s, esAt ? "fabrica" : "tienda", "oscuro", x + 0.16, y + 0.09, 0.32);
    texto(s, v.sede.toUpperCase(), { x: x + 0.6, y: y + 0.05, w: w - 0.8, h: 0.24, fontSize: 13, bold: true, color: C.oscuro });
    texto(s, esAt ? "Producción (B2B)" : "Cafetería", { x: x + 0.6, y: y + 0.28, w: w - 0.8, h: 0.17, fontSize: 8.5, color: C.gris });
    if (v.hasta === null) {
      texto(s, "Sin reporte de ventas subido.", { x: x + 0.2, y: y + 0.8, w: w - 0.4, h: 0.3, fontSize: 10, italic: true, color: C.gris });
      return;
    }
    // Honestidad del dato: reporte atrasado o fuente de respaldo.
    const aviso = v.hasta < weekEnd ? `⚠ datos al ${diaCorto(v.hasta)}` : v.fuente === "registro" ? "⚠ registro diario" : v.fuente === "mixta" ? "fuentes combinadas" : "";
    if (aviso) texto(s, aviso, { x: x + w - 1.5, y: y + 0.28, w: 1.36, h: 0.17, fontSize: 7, italic: true, color: C.ambarTexto, align: "right" });

    // Bloque: rótulo, monto grande y a su derecha la pastilla del cambio.
    const bloque = (by: number, titulo: string, valor: number, delta: number | null, nota: string | null) => {
      texto(s, titulo, { x: x + 0.2, y: by, w: w - 0.4, h: 0.18, fontSize: 8.5, color: C.gris });
      texto(s, solesDeck(valor), { x: x + 0.2, y: by + 0.19, w: w - 1.3, h: 0.34, fontSize: 16, bold: true, color: C.tinta });
      const tono: Tono = delta === null ? "gris" : delta >= 0 ? "verde" : "rojo";
      pastilla(s, x + w - 1.12, by + 0.23, 0.94, 0.27, deltaTxt(delta), tono, { flecha: delta === null ? null : delta >= 0 ? "arriba" : "abajo", tam: 10.5 });
      if (nota) texto(s, nota, { x: x + 0.2, y: by + 0.55, w: w - 0.4, h: 0.16, fontSize: 7.5, color: C.gris });
    };
    bloque(y + 0.58, `Venta del periodo (${rangoCorto(ctx.ws, ctx.we)})`, v.rango, v.deltaRangoPct,
      v.rangoPrev !== null ? `vs. periodo anterior: ${solesDeck(v.rangoPrev)}` : "vs. periodo anterior");
    s.addShape("line", { x: x + 0.18, y: y + 1.36, w: w - 0.36, h: 0, line: { color: C.borde, width: 0.5 } });
    bloque(y + 1.42, `Acumulado del mes (1–${dia} ${["ene","feb","mar","abr","may","jun","jul","ago","set","oct","nov","dic"][mm - 1]}) vs. mismos días`, v.mes, v.deltaMesPct, null);

    // Barras: este mes vs el anterior, a mismos días.
    const maxV = Math.max(v.mes, v.mesPrev ?? 0, 1);
    const bx = x + 1.08, bw = w - 2.1;
    const filas: [string, number | null, string][] = [[`${MES(mesAct)} (1–${dia})`, v.mes, C.oscuro], [`${MES(prev)} (1–${dia})`, v.mesPrev, "C9C6BB"]];
    filas.forEach(([lab, val, col], k) => {
      const ry = y + 2.02 + k * 0.24;
      texto(s, lab, { x: x + 0.2, y: ry, w: 0.86, h: 0.2, fontSize: 7, bold: k === 0, color: C.tinta });
      if (val !== null && val > 0) {
        s.addShape("rect", { x: bx, y: ry + 0.03, w: Math.max(0.05, bw * (val / maxV)), h: 0.15, fill: { color: col }, line: { color: col } });
        texto(s, solesDeck0(val), { x: bx + bw * (val / maxV) + 0.06, y: ry, w: 0.95, h: 0.2, fontSize: 8, bold: k === 0, color: C.tinta });
      } else {
        texto(s, "sin datos", { x: bx, y: ry, w: 1, h: 0.2, fontSize: 7.5, italic: true, color: C.gris });
      }
    });
  });

  lecturaPorSede(s, MX, 4.02, ANCHO, H - 4.02 - 0.08, lecturas.map((l) => ({ ...l, puntos: [...l.puntos, l.accion ?? ""].filter(Boolean) })), {
    signo: (l) => (l.tono === "verde" ? "flechaArriba" : l.tono === "gris" ? "alerta" : "flechaAbajo"),
  });
}

/* ───────────────── 4 y 5 · Detalle de KPIs de una cafetería ───────────────── */

function cajaSemana(s: PptxGenJS.Slide, ctx: Ctx, rotulo: string) {
  const x = 6.95, y = 0.58, w = W - MX - x;
  tarjeta(s, x, y, w, 0.52);
  icono(s, "calendario", "oscuro", x + 0.14, y + 0.11, 0.3);
  const [, m, d1] = ctx.ws.split("-").map(Number);
  const d2 = Number(ctx.we.slice(8, 10));
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","setiembre","octubre","noviembre","diciembre"];
  texto(s, `${rotulo}: ${d1} – ${d2} de ${MESES[Number(ctx.we.slice(5, 7)) - 1]} ${ctx.we.slice(0, 4)}`, { x: x + 0.52, y: y + 0.05, w: w - 0.6, h: 0.24, fontSize: 9, bold: true, color: C.tinta, fit: "shrink" });
  void m;
  texto(s, "Fuente: Byte", { x: x + 0.52, y: y + 0.28, w: w - 0.6, h: 0.18, fontSize: 8, color: C.gris });
}

function tarjetaKpi(s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, o: {
  iconoK: Parameters<typeof icono>[1]; etiqueta: string; valor: string; tono: Tono; pill: string; flecha?: "arriba" | "abajo" | null; check?: boolean;
  meta: string; lineas: [string, string, string][];
}) {
  tarjeta(s, x, y, w, h, { fondo: SUAVE[o.tono] === SUAVE.gris ? C.blanco : SUAVE[o.tono] });
  icono(s, o.iconoK, "oscuro", x + 0.15, y + 0.13, 0.3);
  texto(s, o.etiqueta, { x: x + 0.55, y: y + 0.12, w: w - 0.65, h: 0.3, fontSize: 10, bold: true, color: C.tinta });
  texto(s, o.valor, { x: x + 0.15, y: y + 0.4, w: w - 0.3, h: 0.36, fontSize: 20, bold: true, color: C.tinta, align: "center" });
  pastilla(s, x + 0.15, y + 0.8, 0.95, 0.27, o.pill, o.tono, { flecha: o.flecha, check: o.check, tam: 10.5 });
  texto(s, o.meta, { x: x + 1.16, y: y + 0.76, w: w - 1.25, h: 0.35, fontSize: 7.5, color: C.gris });
  s.addShape("line", { x: x + 0.14, y: y + 1.13, w: w - 0.28, h: 0, line: { color: C.borde, width: 0.5 } });
  o.lineas.forEach(([a, b, c], k) => {
    const ly = y + 1.16 + k * 0.16;
    texto(s, a, { x: x + 0.15, y: ly, w: 0.7, h: 0.16, fontSize: 7.5, color: C.gris });
    texto(s, b, { x: x + 0.82, y: ly, w: 0.65, h: 0.16, fontSize: 7.5, color: C.tinta });
    texto(s, c, { x: x + 1.4, y: ly, w: w - 1.5, h: 0.16, fontSize: 7.5, color: C.tinta, align: "right" });
  });
}

function tablaDiaria(s: PptxGenJS.Slide, x: number, y: number, w: number, filaH: number, sm: KpiWeekSummary, tg: Cafeteria["targets"]) {
  const tc = (t: KpiTraffic) => (t === "gris" ? C.tinta : TEXTO[t2t(t)]);
  // Encabezados cortos: una sola línea aunque la columna sea angosta.
  const lim = (n: number | null) => (n === null ? "" : ` <${n}m`);
  const hdr = ["Día", "Ventas", "Ticket", "NPS", "Mermas", `Mostr.${lim(tg.tiempoMaxMin)}`, `Mesa${lim(tg.tiempoMesaMaxMin)}`, `Deliv.${lim(tg.tiempoDeliveryMaxMin)}`];
  const rows: PptxGenJS.TableRow[] = [
    hdr.map((t) => ({ text: t, options: { bold: true, color: C.blanco, fill: { color: C.oscuro }, fontSize: 7.5 } })),
    ...sm.days.map((d, i): PptxGenJS.TableRow => {
      const f = { fill: { color: i % 2 ? "F7F5EE" : C.blanco } };
      return [
        { text: diaCortoSemana(d.date), options: { ...f } },
        { text: solesDeck(d.ventas), options: { ...f, color: tc(d.traffic.ventas), bold: d.traffic.ventas === "rojo" } },
        { text: d.ticket !== null ? solesDeck(d.ticket) : "—", options: { ...f, color: tc(d.traffic.ticket), bold: d.traffic.ticket === "rojo" } },
        { text: d.nps !== null ? String(d.nps) : "—", options: { ...f, color: tc(d.traffic.nps), bold: true } },
        { text: d.mermasSoles !== null ? solesDeck(d.mermasSoles) : "—", options: { ...f, color: tc(d.traffic.mermas) } },
        { text: d.tiempoMin !== null ? `${d.tiempoMin} min` : "—", options: { ...f, color: tc(d.traffic.tiempo) } },
        { text: d.tiempoMesaMin !== null ? `${d.tiempoMesaMin} min` : "—", options: { ...f, color: tc(d.traffic.tiempoMesa) } },
        { text: d.tiempoDeliveryMin !== null ? `${d.tiempoDeliveryMin} min` : "—", options: { ...f, color: tc(d.traffic.tiempoDelivery) } },
      ];
    }),
  ];
  s.addTable(rows, {
    x, y, w, rowH: filaH, fontFace: FONT, fontSize: 8, color: C.tinta, valign: "middle",
    border: { type: "solid", pt: 0.5, color: C.borde }, autoPage: false, margin: [0.02, 0.06, 0.02, 0.06],
    colW: [0.12, 0.16, 0.13, 0.08, 0.13, 0.13, 0.13, 0.12].map((p) => p * w),
  });
}

export function detalleCafeteria(ctx: Ctx, cf: Cafeteria, variante: "columna" | "fila") {
  const s = diapositiva(ctx.pptx, {
    titulo: `${cf.sede} — Detalle de KPIs`, subtitulo: "Resultados de la semana y comparación con referencias.",
    periodo: ctx.periodo, derecha: `${cf.sede} · Detalle de KPIs`,
  });
  cajaSemana(s, ctx, "Semana");
  const sm = cf.summary, tg = cf.targets;
  const y = 1.36, h = 1.5, gap = 0.15;
  const w = (ANCHO - gap * 3) / 4;
  const pctPill = (p: number | null) => (p === null ? "—" : pctTxt(p));
  const fl = (p: number | null) => (p === null ? null : p >= 100 ? "arriba" as const : "abajo" as const);
  const ex = (e: { date: string; value: number } | null, fmt: (n: number) => string) => (e ? [diaCortoSemana(e.date), fmt(e.value)] as const : ["—", "—"] as const);
  const bV = ex(sm.best.ventas, (n) => solesDeck(n)), wV = ex(sm.worst.ventas, (n) => solesDeck(n));
  const bT = ex(sm.best.ticket, (n) => solesDeck(n)), wT = ex(sm.worst.ticket, (n) => solesDeck(n));
  const bN = ex(sm.best.nps, String), wN = ex(sm.worst.nps, String);
  // En mermas "mejor" es el día con MENOS merma.
  const bM = ex(sm.worst.mermas, (n) => solesDeck(n)), wM = ex(sm.best.mermas, (n) => solesDeck(n));
  const difV = sm.ventasPct === null ? "" : ` (${deltaTxt(Math.round((sm.ventasPct - 100) * 10) / 10)})`;
  const difT = sm.ticketPct === null ? "" : ` (${deltaTxt(Math.round((sm.ticketPct - 100) * 10) / 10)})`;
  tarjetaKpi(s, MX, y, w, h, {
    iconoK: "barras", etiqueta: "Ventas diarias (prom.)", valor: solesDeck(sm.ventasProm), tono: sm.ventasPct === null ? "gris" : t2t(sm.traffic.ventas),
    pill: pctPill(sm.ventasPct), flecha: fl(sm.ventasPct), meta: `Meta: ${solesDeck(tg.ventaDiaria)}${difV}`,
    lineas: [["Mejor día", bV[0], bV[1]], ["Peor día", wV[0], wV[1]]],
  });
  tarjetaKpi(s, MX + (w + gap), y, w, h, {
    iconoK: "carrito", etiqueta: "Ticket promedio", valor: solesDeck(sm.ticketProm), tono: sm.ticketPct === null ? "gris" : t2t(sm.traffic.ticket),
    pill: pctPill(sm.ticketPct), flecha: fl(sm.ticketPct), meta: `Referencia: ${solesDeck(tg.ticketRef)}${difT}`,
    lineas: [["Más alto", bT[0], bT[1]], ["Más bajo", wT[0], wT[1]]],
  });
  tarjetaKpi(s, MX + (w + gap) * 2, y, w, h, {
    iconoK: "estrella", etiqueta: "NPS (prom.)", valor: sm.npsProm === null ? "—" : String(sm.npsProm), tono: sm.npsProm === null ? "gris" : t2t(sm.traffic.nps),
    pill: sm.npsProm === null ? "Sin dato" : sm.traffic.nps === "verde" ? "En meta" : "Bajo meta", check: sm.traffic.nps === "verde",
    meta: `Meta: ≥ ${tg.npsMin}`, lineas: [["Más alto", bN[0], bN[1]], ["Más bajo", wN[0], wN[1]]],
  });
  tarjetaKpi(s, MX + (w + gap) * 3, y, w, h, {
    iconoK: "torta", etiqueta: "Mermas (% ventas)", valor: sm.mermasPct === null ? "—" : `${sm.mermasPct}%`, tono: sm.mermasPct === null ? "gris" : t2t(sm.traffic.mermas),
    pill: sm.mermasPct === null ? "Sin dato" : sm.traffic.mermas === "verde" ? "En meta" : "Fuera de meta", check: sm.traffic.mermas === "verde",
    meta: `Meta: ≤ ${Math.round(tg.mermasMaxPct * 100)}%\n${solesDeck(sm.mermasTotal)}`, lineas: [["Más alto", bM[0], bM[1]], ["Más bajo", wM[0], wM[1]]],
  });

  const hs = hallazgosCafeteria({
    sede: cf.sede, ventasPct: sm.ventasPct, ticketPct: sm.ticketPct, nps: sm.npsProm, npsMin: tg.npsMin, mermasPct: sm.mermasPct,
    mermasMaxPct: tg.mermasMaxPct, traffic: sm.traffic, ventasProm: sm.ventasProm, ticketProm: sm.ticketProm,
    peorDiaVentas: sm.worst.ventas ? { dia: diaCortoSemana(sm.worst.ventas.date), valor: sm.worst.ventas.value } : null,
  });
  const ty = y + h + 0.1;
  if (variante === "columna") {
    texto(s, "Detalle diario de la semana", { x: MX, y: ty, w: 5, h: 0.26, fontSize: 12, bold: true, color: C.oscuro });
    tablaDiaria(s, MX, ty + 0.3, 5.95, 0.23, sm, tg);
    hallazgosEnColumna(s, 6.5, ty, W - MX - 6.5, H - ty - 0.08, hs);
  } else {
    texto(s, "Detalle diario de la semana", { x: MX, y: ty, w: 5, h: 0.24, fontSize: 12, bold: true, color: C.oscuro });
    tablaDiaria(s, MX, ty + 0.26, ANCHO, 0.19, sm, tg);
    const hy = ty + 0.26 + 0.19 * (sm.days.length + 1) + 0.1;
    hallazgosEnFila(s, MX, hy, ANCHO, H - hy - 0.08, hs, { anchoCabecera: 1.75 });
  }
}

/* ─────────────────────── 6 · Atelier (B2B) ─────────────────────── */

export function detalleAtelier(ctx: Ctx, at: Atelier, ventasAt: Ventas | null) {
  const s = diapositiva(ctx.pptx, {
    titulo: "Atelier — Detalle de ventas (B2B)", subtitulo: "Resultados de la semana. Producción y ventas a clientes B2B.",
    periodo: ctx.periodo, derecha: "Atelier (B2B) · Detalle de ventas",
  });
  cajaSemana(s, ctx, "Semana");
  const y = 1.4, h = 1.32, gap = 0.15;
  const w = (ANCHO - gap * 3) / 4;
  const dSem = ventasAt?.deltaRangoPct ?? null;
  // El % compara el MISMO número que muestra la tarjeta (promedio por día de
  // la semana) contra el promedio por día del mes anterior a mismos días.
  const promMesPrev = ventasAt && ventasAt.mesPrev !== null && ventasAt.mesPrevDias > 0 ? ventasAt.mesPrev / ventasAt.mesPrevDias : null;
  const dMes = at.ventasProm !== null && promMesPrev ? Math.round(((at.ventasProm - promMesPrev) / promMesPrev) * 1000) / 10 : null;

  const card = (i: number, ic: Parameters<typeof icono>[1], et: string, val: string, sub: string, tono: Tono, delta?: { p: number | null; nota: string }) => {
    const x = MX + i * (w + gap);
    tarjeta(s, x, y, w, h, { fondo: tono === "gris" ? C.blanco : SUAVE[tono] });
    icono(s, ic, tono === "gris" ? "oscuro" : iconoTono(tono), x + 0.15, y + 0.13, 0.3);
    texto(s, et, { x: x + 0.55, y: y + 0.12, w: w - 0.65, h: 0.3, fontSize: 10, bold: true, color: C.tinta });
    texto(s, val, { x: x + 0.15, y: y + 0.45, w: w - 0.3, h: 0.4, fontSize: 20, bold: true, color: C.tinta, align: delta ? "center" : "left" });
    texto(s, sub, { x: x + 0.15, y: y + 0.84, w: w - 0.3, h: 0.2, fontSize: 9, bold: !delta, color: delta ? C.gris : TEXTO[tono], align: delta ? "center" : "left" });
    if (delta) {
      pastilla(s, x + 0.15, y + 1.02 - 0.0, 0.9, 0.24, deltaTxt(delta.p), delta.p === null ? "gris" : delta.p >= 0 ? "verde" : "rojo", { flecha: delta.p === null ? null : delta.p >= 0 ? "arriba" : "abajo", tam: 10 });
      texto(s, delta.nota, { x: x + 1.1, y: y + 0.98, w: w - 1.18, h: 0.3, fontSize: 7, color: C.gris });
    }
  };
  card(0, "barras", "Ventas del período", solesDeck(at.ventasTotal), `${at.daysWithData} días con venta`, "gris",
    { p: dSem, nota: `vs. periodo anterior${ventasAt?.rangoPrev != null ? `\n(${solesDeck(ventasAt.rangoPrev)})` : ""}` });
  card(1, "carrito", "Promedio por día", solesDeck(at.ventasProm), "sobre días con venta", "gris",
    { p: dMes, nota: `vs. prom. mes anterior${promMesPrev !== null ? `\n(${solesDeck(Math.round(promMesPrev * 100) / 100)})` : ""}` });
  card(2, "flechaArriba", "Mejor día", at.best ? solesDeck(at.best.value) : "—", at.best ? diaCortoSemana(at.best.date) : "", "verde");
  card(3, "flechaAbajo", "Día más bajo", at.worst ? solesDeck(at.worst.value) : "—", at.worst ? diaCortoSemana(at.worst.date) : "", "ambar");

  const by = y + h + 0.16, bh = H - by - 0.1;
  // Gráfico de barras de la venta diaria.
  tarjeta(s, MX, by, 3.65, bh);
  texto(s, "Ventas diarias (S/)", { x: MX + 0.2, y: by + 0.1, w: 3, h: 0.26, fontSize: 11.5, bold: true, color: C.tinta });
  if (at.days.length > 0) {
    s.addChart("bar", [{ name: "Venta", labels: at.days.map((d) => diaCortoSemana(d.date)), values: at.days.map((d) => Math.round(d.value)) }], {
      x: MX + 0.1, y: by + 0.4, w: 3.45, h: bh - 0.5, barDir: "col", chartColors: [C.oscuro],
      showValue: true, dataLabelFontFace: FONT, dataLabelFontSize: 8, dataLabelColor: C.tinta, dataLabelPosition: "outEnd",
      catAxisLabelFontFace: FONT, catAxisLabelFontSize: 8, catAxisLabelColor: C.gris,
      valAxisLabelFontFace: FONT, valAxisLabelFontSize: 7, valAxisLabelColor: C.gris,
      valGridLine: { color: C.borde, size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, barGapWidthPct: 60,
    });
  }
  // Tabla del detalle diario.
  texto(s, "Detalle diario", { x: 4.2, y: by + 0.02, w: 2.4, h: 0.26, fontSize: 11.5, bold: true, color: C.tinta });
  s.addTable([
    ["Día", "Venta Byte (S/)"].map((t) => ({ text: t, options: { bold: true, color: C.blanco, fill: { color: C.oscuro } } })),
    ...at.days.map((d, i): PptxGenJS.TableRow => [
      { text: diaCortoSemana(d.date), options: { fill: { color: i % 2 ? "F7F5EE" : C.blanco } } },
      { text: d.value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), options: { fill: { color: i % 2 ? "F7F5EE" : C.blanco }, align: "right" } },
    ]),
  ], { x: 4.2, y: by + 0.32, w: 2.3, rowH: Math.min(0.27, (bh - 0.4) / (at.days.length + 1)), fontFace: FONT, fontSize: 8.5, color: C.tinta, valign: "middle", border: { type: "solid", pt: 0.5, color: C.borde }, autoPage: false });
  hallazgosEnColumna(s, 6.7, by, W - MX - 6.7, bh, hallazgosAtelier({
    ventasTotal: at.ventasTotal, dias: at.daysWithData, deltaSemanaPct: dSem, promDia: at.ventasProm, deltaPromMesPct: dMes,
    ticketProm: at.ticketProm, mermasTotal: at.mermasTotal, mermasPct: at.mermasPct,
  }));
}

/* ──────────────── 7 · Meta de ticket & plan de incentivos ──────────────── */

export function incentivos(ctx: Ctx, cafeterias: Cafeteria[]) {
  const s = diapositiva(ctx.pptx, {
    titulo: "Meta de ticket & plan de incentivos (mes en curso)", subtitulo: "Avance por nivel vs. meta del mes y bonos proyectados.",
    periodo: ctx.periodo,
  });
  const y = 1.36, h = 2.66, gap = 0.25;
  const w = (ANCHO - gap) / 2;
  cafeterias.forEach((cf, i) => {
    const x = MX + i * (w + gap);
    const inc = cf.incentives;
    const tono: Tono = !inc || inc.deltaActual === null ? "gris" : inc.deltaActual > 0 ? "verde" : "rojo";
    tarjeta(s, x, y, w, h, { cabecera: { alto: 0.72, color: SUAVE[tono] } });
    icono(s, "tienda", "oscuro", x + 0.18, y + 0.16, 0.42);
    texto(s, cf.sede.toUpperCase(), { x: x + 0.72, y: y + 0.12, w: 2, h: 0.5, fontSize: 16, bold: true, color: C.tinta });
    if (!inc) {
      texto(s, "Sin configuración de incentivos.", { x: x + 0.2, y: y + 0.9, w: w - 0.4, h: 0.3, fontSize: 10, italic: true, color: C.gris });
      return;
    }
    // Ticket actual vs base.
    const bx = x + w - 1.95;
    s.addShape("roundRect", { x: bx, y: y + 0.08, w: 1.8, h: 0.58, rectRadius: 0.06, fill: { color: C.blanco, transparency: 30 }, line: { color: SUAVE[tono] } });
    texto(s, "Ticket actual vs. base", { x: bx + 0.1, y: y + 0.1, w: 1.6, h: 0.16, fontSize: 7.5, color: C.gris });
    texto(s, inc.deltaActual === null ? "—" : `${inc.deltaActual >= 0 ? "↗ +" : "↘ −"}${solesDeck(Math.abs(inc.deltaActual))}`, {
      x: bx + 0.1, y: y + 0.26, w: 1.6, h: 0.24, fontSize: 13, bold: true, color: TEXTO[tono],
    });
    texto(s, `${solesDeck(inc.ticketBase)} → ${solesDeck(inc.ticketActual)}`, { x: bx + 0.1, y: y + 0.48, w: 1.6, h: 0.15, fontSize: 7, color: C.gris });

    // Tres datos: venta nueva, candado (piso de tráfico o meta de ventas), pozo.
    const sy = y + 0.82, sw = (w - 0.3) / 3;
    const cv = inc.candadoVentas;
    const candado = cv && cv.meta !== null
      ? { et: "Meta de ventas", val: `${solesDeck0(cv.ventas)} de ${solesDeck0(cv.meta)}`, nota: cv.cumple ? "✓ cubierta" : `al ritmo ${solesDeck0(cv.proyeccion)} ${cv.enCamino ? "✓" : "✗"}`, ok: cv.cumple || cv.enCamino }
      : inc.trafficFloor !== null
        ? { et: "Piso de tráfico", val: `${inc.personasPorDia ?? "—"} pers/día`, nota: `(mín. ${inc.trafficFloor}) ${inc.trafficOk ? "✓" : "✗"}`, ok: inc.trafficOk }
        : { et: "Piso de tráfico", val: "—", nota: "no aplica este mes", ok: true };
    const datos: [Parameters<typeof icono>[1], string, string, string, string][] = [
      ["personas", "Venta nueva por cliente", inc.deltaActual === null ? "—" : `${inc.deltaActual >= 0 ? "+" : "−"}${solesDeck(Math.abs(inc.deltaActual))}`, "", TEXTO[tono]],
      ["barras", candado.et, candado.val, candado.nota, candado.ok ? C.verde : C.rojo],
      ["diana", "Pozo proyectado al cierre", solesDeck(inc.pozoProyectado), "(techo 40% de la utilidad nueva)", C.tinta],
    ];
    datos.forEach(([ic, et, val, nota, col], k) => {
      const dx = x + 0.15 + k * sw;
      if (k > 0) s.addShape("line", { x: dx - 0.05, y: sy + 0.04, w: 0, h: 0.52, line: { color: C.borde, width: 0.5 } });
      icono(s, ic, "oscuro", dx + 0.02, sy + 0.04, 0.3);
      texto(s, et, { x: dx + 0.38, y: sy, w: sw - 0.42, h: 0.26, fontSize: 7.5, color: C.tinta, bold: true, valign: "top" });
      texto(s, val, { x: dx + 0.38, y: sy + 0.25, w: sw - 0.42, h: 0.2, fontSize: 11, bold: true, color: k === 0 ? col : C.tinta, fit: "shrink" });
      if (nota) texto(s, nota, { x: dx + 0.38, y: sy + 0.45, w: sw - 0.42, h: 0.16, fontSize: 6.5, color: k === 1 ? col : C.gris });
    });

    // Tabla de niveles con la barra de avance (dibujada a mano: las tablas no llevan barras).
    const ty = y + 1.52, rh = 0.27;
    const cols = [0.26, 0.22, 0.24, 0.28].map((p) => p * (w - 0.3));
    const cx = [x + 0.15, x + 0.15 + cols[0], x + 0.15 + cols[0] + cols[1], x + 0.15 + cols[0] + cols[1] + cols[2]];
    s.addShape("rect", { x: x + 0.15, y: ty, w: w - 0.3, h: rh, fill: { color: C.oscuro }, line: { color: C.oscuro } });
    ["Nivel", "Ticket meta (S/)", "Bonos a pagar (S/)", "Avance"].forEach((t, k) => {
      texto(s, t, { x: cx[k] + 0.08, y: ty, w: cols[k] - 0.1, h: rh, fontSize: 8, bold: true, color: C.blanco });
    });
    inc.niveles.forEach((n, r) => {
      const ry = ty + rh * (r + 1);
      const actual = inc.nivelAlcanzado === n.nombre;
      s.addShape("rect", { x: x + 0.15, y: ry, w: w - 0.3, h: rh, fill: { color: r % 2 ? "F7F5EE" : C.blanco }, line: { color: C.borde, width: 0.5 } });
      texto(s, `${actual ? "✓ " : ""}${n.nombre}`, { x: cx[0] + 0.08, y: ry, w: cols[0] - 0.1, h: rh, fontSize: 8.5, bold: actual, color: C.tinta });
      texto(s, (inc.ticketBase + n.delta).toFixed(2), { x: cx[1] + 0.08, y: ry, w: cols[1] - 0.1, h: rh, fontSize: 8.5, color: C.tinta });
      texto(s, n.sumaBonos.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { x: cx[2] + 0.08, y: ry, w: cols[2] - 0.1, h: rh, fontSize: 8.5, color: C.tinta });
      const av = avanceNivel(inc.deltaActual, n.delta);
      const barW = cols[3] - 0.55;
      s.addShape("rect", { x: cx[3] + 0.08, y: ry + 0.08, w: barW, h: 0.11, fill: { color: "E7E4DA" }, line: { color: "E7E4DA" } });
      if (av > 0) s.addShape("rect", { x: cx[3] + 0.08, y: ry + 0.08, w: barW * (av / 100), h: 0.11, fill: { color: av >= 100 ? C.verde : av >= 80 ? C.verde : "9A9A94" }, line: { color: av >= 80 ? C.verde : "9A9A94" } });
      texto(s, `${av}%`, { x: cx[3] + 0.1 + barW, y: ry, w: 0.4, h: rh, fontSize: 8, color: C.tinta, align: "right" });
    });
  });

  const prox = (cf: Cafeteria) => {
    const inc = cf.incentives;
    if (!inc) return null;
    const siguiente = inc.niveles.find((n) => avanceNivel(inc.deltaActual, n.delta) < 100);
    return siguiente ? { nivel: siguiente.nombre, pct: avanceNivel(inc.deltaActual, siguiente.delta) } : null;
  };
  hallazgosEnFila(s, MX, 4.1, ANCHO, 1.1, hallazgosIncentivos(cafeterias.filter((cf) => cf.incentives).map((cf) => ({
    sede: cf.sede, deltaActual: cf.incentives!.deltaActual, personasPorDia: cf.incentives!.personasPorDia, trafficFloor: cf.incentives!.trafficFloor,
    trafficOk: cf.incentives!.trafficOk,
    candado: cf.incentives!.candadoVentas && cf.incentives!.candadoVentas.meta !== null
      ? { meta: cf.incentives!.candadoVentas.meta, proyeccion: cf.incentives!.candadoVentas.proyeccion, cumple: cf.incentives!.candadoVentas.cumple, enCamino: cf.incentives!.candadoVentas.enCamino }
      : null,
    avanceProximo: prox(cf), nivelAlcanzado: cf.incentives!.nivelAlcanzado,
  }))), { numerados: true, anchoCabecera: 1.75 });
  texto(s, "El bono se paga solo con la VENTA NUEVA (subir el ticket) y con el candado del mes cumplido — nunca con la utilidad de hoy.", {
    x: MX, y: 5.27, w: ANCHO, h: 0.22, fontSize: 8, italic: true, color: C.gris,
  });
}

/* ──────────────────── 8 · Punto de equilibrio ──────────────────── */

const TONO_ESTADO: Record<BreakevenEstado, Tono> = { superado: "verde", en_camino: "ambar", en_riesgo: "rojo", sin_datos: "gris" };
const FRASE_ESTADO: Record<BreakevenEstado, string> = {
  superado: "Ya cubrió sus costos", en_camino: "Va a cubrirlos al ritmo actual", en_riesgo: "No llega al ritmo actual", sin_datos: "Faltan datos para calcularlo",
};

export function puntoDeEquilibrio(ctx: Ctx, be: GroupBreakeven) {
  const s = diapositiva(ctx.pptx, {
    titulo: "Punto de equilibrio del mes por sede",
    subtitulo: `${monthLabel(be.month)}${be.isCurrent ? " (mes en curso)" : ""}. La línea es lo que hay que vender para no perder plata. Pasar la línea = ganancia.`,
    periodo: ctx.periodo,
  });
  const hastaMax = be.sedes.map((x) => x.ventasHasta).filter((x): x is string => !!x).sort().pop() ?? null;
  const bx = 6.95, byy = 0.58;
  tarjeta(s, bx, byy, W - MX - bx, 0.52);
  icono(s, "calendario", "oscuro", bx + 0.14, byy + 0.11, 0.3);
  texto(s, hastaMax ? `Al ${Number(hastaMax.slice(8, 10))} de ${["enero","febrero","marzo","abril","mayo","junio","julio","agosto","setiembre","octubre","noviembre","diciembre"][Number(hastaMax.slice(5, 7)) - 1]} ${hastaMax.slice(0, 4)}` : "Sin ventas cargadas", {
    x: bx + 0.52, y: byy + 0.05, w: 2, h: 0.24, fontSize: 9.5, bold: true, color: C.tinta,
  });
  texto(s, "Fuente: Byte", { x: bx + 0.52, y: byy + 0.28, w: 2, h: 0.18, fontSize: 8, color: C.gris });

  const filaH = 0.8, gap = 0.09;
  const orden = ["Atelier", "Fonavi", "Centro"];
  const sedes = [...be.sedes].sort((a, b) => orden.findIndex((o) => a.name.includes(o)) - orden.findIndex((o) => b.name.includes(o)));
  sedes.forEach((sd, i) => {
    const y = 1.4 + i * (filaH + gap);
    const r = sd.result;
    const tono = TONO_ESTADO[r.estado];
    tarjeta(s, MX, y, ANCHO, filaH);
    icono(s, sd.name.includes("Atelier") ? "fabrica" : "tienda", iconoTono(tono === "gris" ? "gris" : tono), MX + 0.2, y + 0.18, 0.42);
    texto(s, sd.name.replace("Yayi's ", ""), { x: MX + 0.78, y: y + 0.06, w: 1.6, h: 0.3, fontSize: 15, bold: true, color: C.tinta });
    texto(s, FRASE_ESTADO[r.estado], { x: MX + 0.78, y: y + 0.36, w: 1.75, h: 0.18, fontSize: 8.5, bold: true, color: TEXTO[tono] });
    if (sd.ventasHasta) texto(s, `Ventas al ${diaCorto(sd.ventasHasta)}`, { x: MX + 0.78, y: y + 0.55, w: 1.6, h: 0.16, fontSize: 7.5, color: C.gris });

    const lx = MX + 2.6, lw = 4.35, lh = 0.34, ly = y + 0.14;
    s.addShape("roundRect", { x: lx, y: ly, w: lw, h: lh, rectRadius: 0.05, fill: { color: "EFEDE6" }, line: { color: "EFEDE6" } });
    if (r.breakEven === null) {
      texto(s, r.warnings[0] ?? "Sin costos fijos clasificados: no hay punto de equilibrio que calcular.", { x: lx + 0.1, y: ly, w: lw - 0.2, h: lh, fontSize: 8, color: C.gris });
    } else {
      const frac = anchoBarra(r.avancePct);
      if (frac > 0) s.addShape("roundRect", { x: lx, y: ly, w: lw * frac, h: lh, rectRadius: 0.05, fill: { color: FUERTE[tono] }, line: { color: FUERTE[tono] } });
      const dentro = frac >= 0.25;
      texto(s, solesDeck0(r.ventas), { x: dentro ? lx + 0.12 : lx + lw * frac + 0.08, y: ly, w: 1.3, h: lh, fontSize: 11, bold: true, color: dentro ? C.blanco : C.tinta });
      const mx = lx + lw * POS_META;
      s.addShape("rect", { x: mx - 0.012, y: ly - 0.08, w: 0.024, h: lh + 0.16, fill: { color: C.tinta }, line: { color: C.tinta } });
      texto(s, [{ text: solesDeck0(r.breakEven), options: { bold: true, breakLine: true } }, { text: "(punto de equilibrio)" }], {
        x: mx - 0.9, y: ly + lh + 0.08, w: 1.8, h: 0.26, fontSize: 7, color: C.tinta, align: "center",
      });
    }
    // Recuadro derecho: porcentaje y lo que falta.
    const rx = MX + 7.15, rw = ANCHO - 7.3;
    s.addShape("roundRect", { x: rx, y: y + 0.08, w: rw, h: filaH - 0.16, rectRadius: 0.06, fill: { color: SUAVE[tono] }, line: { color: SUAVE[tono] } });
    texto(s, r.avancePct === null ? "—" : `${Math.round(r.avancePct)}%`, { x: rx + 0.1, y: y + 0.1, w: rw - (r.estado === "superado" ? 0.6 : 0.2), h: 0.36, fontSize: 18, bold: true, color: TEXTO[tono], align: "center" });
    const falta = faltaParaEquilibrio(r);
    const pie = r.estado === "superado" ? "Meta cubierta" : r.estado === "sin_datos" ? "" : r.diaEstimadoCruce !== null ? `Cruza el día ${r.diaEstimadoCruce}` : falta !== null ? `Faltan ${solesDeck0(falta)} para cubrir costos` : "";
    texto(s, pie, { x: rx + 0.08, y: y + 0.45, w: rw - (r.estado === "superado" ? 0.6 : 0.16), h: 0.22, fontSize: 7.5, color: C.tinta, align: "center", fit: "shrink" });
    if (r.estado === "superado") {
      s.addShape("ellipse", { x: rx + rw - 0.48, y: y + 0.22, w: 0.36, h: 0.36, fill: { color: C.verde }, line: { color: C.verde } });
      texto(s, "✓", { x: rx + rw - 0.48, y: y + 0.22, w: 0.36, h: 0.36, fontSize: 14, bold: true, color: C.blanco, align: "center" });
    }
  });

  // Consolidado del grupo + lectura.
  const gy = 1.4 + sedes.length * (filaH + gap) + 0.02, gh = H - gy - 0.34;
  const g = be.grupo;
  const tg = TONO_ESTADO[g.estado];
  tarjeta(s, MX, gy, ANCHO, gh, { fondo: "FBF7EE" });
  icono(s, "grupo", "oscuro", MX + 0.2, gy + 0.2, 0.42);
  texto(s, "Grupo", { x: MX + 0.75, y: gy + 0.14, w: 2.4, h: 0.28, fontSize: 13, bold: true, color: C.tinta });
  if (g.breakEven !== null) {
    texto(s, `Vendido: ${solesDeck0(g.ventas)} de ${solesDeck0(g.breakEven)} necesarios`, { x: MX + 0.75, y: gy + 0.44, w: 2.75, h: 0.22, fontSize: 9, bold: true, color: C.tinta, fit: "shrink" });
    const fg = faltaParaEquilibrio(g);
    texto(s, `${Math.round(g.avancePct ?? 0)}%${g.estado !== "superado" && fg !== null ? ` · Faltan ${solesDeck0(fg)} para cubrir costos fijos` : " · costos fijos cubiertos"}`, {
      x: MX + 0.75, y: gy + 0.66, w: 2.75, h: 0.22, fontSize: 8.5, bold: true, color: TEXTO[tg], fit: "shrink",
    });
  } else {
    texto(s, "Aún no se puede calcular el consolidado.", { x: MX + 0.75, y: gy + 0.44, w: 2.7, h: 0.22, fontSize: 9, color: C.gris });
  }
  s.addShape("line", { x: MX + 3.6, y: gy + 0.14, w: 0, h: gh - 0.28, line: { color: C.borde, width: 0.75 } });
  const hs = hallazgosEquilibrio(
    sedes.map((sd) => ({ nombre: sd.name.replace("Yayi's ", ""), avancePct: sd.result.avancePct, falta: faltaParaEquilibrio(sd.result), superado: sd.result.estado === "superado", sinDatos: sd.result.breakEven === null })),
    { nombre: "Grupo", avancePct: g.avancePct, falta: faltaParaEquilibrio(g), superado: g.estado === "superado", sinDatos: g.breakEven === null },
  );
  // Lectura dentro del mismo recuadro, a la derecha del consolidado.
  const lx0 = MX + 3.75;
  s.addShape("roundRect", { x: lx0, y: gy + 0.12, w: 0.3, h: 0.3, rectRadius: 0.05, fill: { color: C.oscuro }, line: { color: C.oscuro } });
  icono(s, "lectura", "blanco", lx0 + 0.05, gy + 0.17, 0.2);
  texto(s, "Lectura de la semana", { x: lx0 + 0.4, y: gy + 0.12, w: 2.5, h: 0.3, fontSize: 11.5, bold: true, color: C.oscuro });
  const colW = (MX + ANCHO - 0.15 - lx0) / Math.max(1, hs.length);
  hs.forEach((hz, i) => {
    const cx = lx0 + i * colW, cy = gy + 0.5;
    s.addShape("ellipse", { x: cx, y: cy, w: 0.3, h: 0.3, fill: { color: FUERTE[hz.tono] }, line: { color: FUERTE[hz.tono] } });
    texto(s, String(i + 1), { x: cx, y: cy, w: 0.3, h: 0.3, fontSize: 10, bold: true, color: C.blanco, align: "center" });
    const th = 0.15 * lineasEstimadas(hz.titulo, 9, colW - 0.45, true);
    texto(s, hz.titulo, { x: cx + 0.38, y: cy - 0.02, w: colW - 0.45, h: th + 0.04, fontSize: 9, bold: true, color: C.oscuro, valign: "top" });
    texto(s, hz.texto, { x: cx + 0.38, y: cy + th + 0.03, w: colW - 0.45, h: gy + gh - 0.06 - (cy + th + 0.03), fontSize: 7.5, color: C.gris, valign: "top" });
  });
  const avisos = [...new Set([...g.warnings, ...be.sedes.flatMap((x) => x.result.warnings)])];
  if (avisos.length > 0) texto(s, `⚠ ${avisos[0]}`, { x: MX, y: H - 0.3, w: ANCHO, h: 0.22, fontSize: 7.5, color: C.ambarTexto, fit: "shrink" });
}
