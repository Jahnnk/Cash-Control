/**
 * Las 8 primeras diapositivas de la Reunión Semanal (rediseño del 24-sep-2026,
 * sobre las referencias que armó Jahnn): portada, la semana en una mirada,
 * ventas del mes, detalle de Fonavi, detalle de Centro, Atelier B2B,
 * incentivos y punto de equilibrio.
 *
 * Renderer tonto: los números llegan calculados (actions/kpis.ts,
 * actions/breakeven.ts); las "Lecturas" salen de reglas fijas
 * (lectura-semana.ts). Diseño y escala tipográfica en deck-diseno.ts.
 *
 * Segunda pasada (mismo día): Jahnn abrió el PPT y los textos se salían de
 * sus recuadros. Todo se midió de nuevo en Arial con menos texto por tarjeta;
 * los gráficos son formas dibujadas (no gráficos nativos) para que se vean
 * igual en cualquier programa.
 */

import type PptxGenJS from "pptxgenjs";
import type { BoardDeckData } from "@/app/actions/kpis";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import type { BreakevenEstado } from "@/lib/breakeven";
import type { KpiTraffic, KpiWeekSummary } from "./engine";
import { LOGO } from "./deck-assets";
import {
  C, FONT, FUERTE, MX, ANCHO, SUAVE, TEXTO, W, Y0, YMAX,
  diapositiva, cajaFecha, tarjeta, pastilla, texto, icono, iconoTono, circulo, lecturaPorSede, hallazgosEnColumna, hallazgosEnFila,
  lineasEstimadas, altoLinea, periodoLargo, rangoCorto, solesDeck, solesDeck0,
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
type Icono = Parameters<typeof icono>[1];

const t2t = (t: KpiTraffic): Tono => t;
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const diaCortoSemana = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`; };
const pctTxt = (p: number | null) => (p === null ? "—" : `${p.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
const deltaTxt = (p: number | null) => (p === null ? "—" : `${p > 0 ? "+" : ""}${p.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
const MERMA_ATELIER_MAX = 0.04;

/** Contexto común a todas las diapositivas. */
export type Ctx = { pptx: PptxGenJS; periodo: string; ws: string; we: string };

export function contexto(pptx: PptxGenJS, ws: string, we: string): Ctx {
  return { pptx, periodo: periodoLargo(ws, we), ws, we };
}

/** "13–19 set 2026" para el recuadro de fecha. */
const semanaCorta = (ctx: Ctx) => `${rangoCorto(ctx.ws, ctx.we)} ${ctx.we.slice(0, 4)}`;

/* ─────────────────────────── 1 · Portada ─────────────────────────── */

export function portada(ctx: Ctx, personalizado: boolean) {
  const s = ctx.pptx.addSlide();
  s.background = { color: C.oscuro };
  const lw = 1.8;
  s.addImage({ data: LOGO.crema, x: W - lw - 0.4, y: 0.35, w: lw, h: lw / 2.954 });
  texto(s, personalizado ? "Yayi's | Reporte de KPIs" : "Yayi's | Reunión Semanal", {
    x: MX, y: 2.0, w: ANCHO, h: 0.7, fontSize: 34, bold: true, color: C.crema, align: "center",
  });
  s.addShape("line", { x: W / 2 - 0.6, y: 2.86, w: 1.2, h: 0, line: { color: C.verde, width: 2.5 } });
  texto(s, ctx.periodo, { x: MX, y: 3.0, w: ANCHO, h: 0.4, fontSize: 16, color: "6DB08A", align: "center" });
  texto(s, "Fonavi · Centro · Atelier", { x: MX, y: 3.42, w: ANCHO, h: 0.3, fontSize: 11, color: C.crema, align: "center" });
}

/* ──────────────────── 2 · La semana en una mirada ──────────────────── */

type Fila = { icono: Icono; etiqueta: string; valor: string; pill: string; tono: Tono; flecha?: "arriba" | "abajo" | null; nota: string };

/** Tarjeta de sede: franja de color con el nombre y filas etiqueta/cifra/pastilla. */
function tarjetaSede(s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, o: {
  nombre: string; tipo: string; iconoSede: "tienda" | "fabrica"; tono: Tono; filas: Fila[]; aviso?: string;
}) {
  const cab = 0.46;
  tarjeta(s, x, y, w, h, { cabecera: { alto: cab, color: SUAVE[o.tono] } });
  icono(s, o.iconoSede, "oscuro", x + 0.14, y + 0.1, 0.26);
  texto(s, o.nombre.toUpperCase(), { x: x + 0.5, y: y + 0.06, w: w - 0.6, h: 0.2, fontSize: 11, bold: true, color: C.tinta });
  texto(s, o.tipo, { x: x + 0.5, y: y + 0.26, w: w - 0.6, h: 0.15, fontSize: 7.5, color: C.gris });
  if (o.aviso) texto(s, o.aviso, { x: x + w - 1.45, y: y + 0.26, w: 1.33, h: 0.15, fontSize: 6.5, italic: true, color: C.ambarTexto, align: "right" });
  const fh = 0.43;
  const libre = h - cab - 0.06;
  const paso = libre / o.filas.length;
  o.filas.forEach((f, i) => {
    const fy = y + cab + 0.03 + i * paso + (paso - fh) / 2;
    if (i > 0) s.addShape("line", { x: x + 0.14, y: y + cab + 0.03 + i * paso, w: w - 0.28, h: 0, line: { color: C.borde, width: 0.5 } });
    icono(s, f.icono, "oscuro", x + 0.14, fy + 0.11, 0.2);
    texto(s, f.etiqueta, { x: x + 0.46, y: fy + 0.04, w: w - 1.5, h: 0.14, fontSize: 7.5, color: C.gris });
    texto(s, f.valor, { x: x + 0.46, y: fy + 0.18, w: w - 1.5, h: 0.22, fontSize: 13, bold: true, color: C.tinta });
    pastilla(s, x + w - 1.0, fy + 0.05, 0.86, 0.22, f.pill, f.tono, { flecha: f.flecha, tam: 8.5 });
    texto(s, f.nota, { x: x + w - 1.06, y: fy + 0.29, w: 0.98, h: 0.12, fontSize: 6.5, color: C.gris, align: "center" });
  });
}

function filaPct(etiqueta: string, icon: Icono, valor: string, pct: number | null, traffic: KpiTraffic, nota: string): Fila {
  return {
    icono: icon, etiqueta, valor, pill: pct === null ? "—" : pctTxt(pct), tono: pct === null ? "gris" : t2t(traffic),
    flecha: pct === null ? null : pct >= 100 ? "arriba" : "abajo", nota: pct === null ? "sin dato" : nota,
  };
}

function filasCafeteria(cf: Cafeteria): Fila[] {
  const sm = cf.summary;
  const tg = cf.targets;
  const merma = sm.mermasPct === null ? { pill: "—", tono: "gris" as Tono }
    : { pill: sm.traffic.mermas === "verde" ? "En rango" : sm.traffic.mermas === "ambar" ? "Al límite" : "Fuera", tono: t2t(sm.traffic.mermas) };
  return [
    filaPct("Venta promedio diaria", "barras", solesDeck(sm.ventasProm), sm.ventasPct, sm.traffic.ventas, "vs. meta"),
    filaPct("Ticket promedio", "carrito", solesDeck(sm.ticketProm), sm.ticketPct, sm.traffic.ticket, "vs. referencia"),
    {
      icono: "estrella", etiqueta: "NPS (satisfacción)", valor: sm.npsProm === null ? "—" : String(sm.npsProm),
      pill: sm.npsProm === null ? "—" : sm.traffic.nps === "verde" ? "En meta" : "Bajo meta", tono: sm.npsProm === null ? "gris" : t2t(sm.traffic.nps),
      nota: `meta ≥ ${tg.npsMin}`,
    },
    { icono: "torta", etiqueta: "Mermas", valor: sm.mermasPct === null ? "—" : `${sm.mermasPct}%`, pill: merma.pill, tono: merma.tono, nota: `máx. ${Math.round(tg.mermasMaxPct * 100)}%` },
  ];
}

export function laSemanaEnUnaMirada(ctx: Ctx, d: BoardDeckData) {
  const s = diapositiva(ctx.pptx, {
    titulo: "La semana en una mirada", subtitulo: "Indicadores principales por sede y cumplimiento de metas.",
    periodo: ctx.periodo, derecha: "Fonavi · Centro · Atelier",
  });
  // Leyenda del semáforo, a la altura del título.
  const items: [Tono, string, number][] = [["verde", "En meta", 0.62], ["ambar", "Cerca de meta", 0.95], ["rojo", "Bajo meta", 0.74], ["gris", "Sin referencia", 0.95]];
  const lw = items.reduce((a, [, , ancho]) => a + ancho, 0) + 0.2;
  const lx = W - MX - lw, ly = 0.58;
  tarjeta(s, lx, ly, lw, 0.32);
  let ix = lx + 0.14;
  for (const [t, l, ancho] of items) {
    s.addShape("ellipse", { x: ix, y: ly + 0.1, w: 0.12, h: 0.12, fill: { color: FUERTE[t] }, line: { color: FUERTE[t], type: "none" } });
    texto(s, l, { x: ix + 0.17, y: ly, w: ancho - 0.17, h: 0.32, fontSize: 7.5, color: C.tinta });
    ix += ancho;
  }

  const y = Y0, h = 2.2, gap = 0.2;
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
      { icono: "barras", etiqueta: `Ventas (${at?.daysWithData ?? 0} días)`, valor: solesDeck(at?.ventasTotal ?? null), pill: "—", tono: "gris", nota: "sin meta" },
      { icono: "carrito", etiqueta: "Ticket promedio", valor: solesDeck(at?.ticketProm ?? null), pill: "—", tono: "gris", nota: "sin referencia" },
      { icono: "torta", etiqueta: "Mermas", valor: at?.mermasPct == null ? "—" : `${at.mermasPct}%`, pill: mermaAt === "verde" ? "En rango" : mermaAt === "rojo" ? "Fuera" : "—", tono: mermaAt, nota: `máx. ${MERMA_ATELIER_MAX * 100}%` },
    ],
  });

  const lecturas = [
    ...d.cafeterias.map((cf) => lecturaCafeteria({
      sede: cf.sede, ventasPct: cf.summary.ventasPct, ticketPct: cf.summary.ticketPct, nps: cf.summary.npsProm, npsMin: cf.targets.npsMin,
      mermasPct: cf.summary.mermasPct, mermasMaxPct: cf.targets.mermasMaxPct, traffic: cf.summary.traffic,
    })),
    ...(at ? [lecturaAtelier({ ventasTotal: at.ventasTotal, dias: at.daysWithData, ticketProm: at.ticketProm, mermasPct: at.mermasPct, mermasMaxPct: MERMA_ATELIER_MAX })] : []),
  ];
  const ly2 = y + h + 0.16;
  lecturaPorSede(s, MX, ly2, ANCHO, YMAX - ly2, lecturas, { sub: "Hallazgos y acción sugerida por sede." });
}

/* ──────────────────────── 3 · Ventas del mes ──────────────────────── */

export function ventasDelMes(ctx: Ctx, ventas: Ventas[], weekEnd: string) {
  const dia = Number(weekEnd.slice(8, 10));
  const s = diapositiva(ctx.pptx, {
    titulo: "Ventas del mes (Byte): ¿cómo vamos vs. antes?",
    subtitulo: `Comparado con los mismos días del mes anterior (día 1 al ${dia}). Fuente: Byte.`,
    periodo: ctx.periodo, derecha: "Ventas (Byte)",
  });
  const orden = ["Atelier", "Fonavi", "Centro"];
  const lista = [...ventas].sort((a, b) => orden.findIndex((o) => a.sede.includes(o)) - orden.findIndex((o) => b.sede.includes(o)));
  const y = Y0, h = 2.22, gap = 0.2;
  const w = (ANCHO - gap * (lista.length - 1)) / lista.length;
  const mesAct = weekEnd.slice(0, 7);
  const [yy, mm] = mesAct.split("-").map(Number);
  const prev = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, "0")}`;
  const mesTxt = (m: string) => `${MES3[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

  const lecturas = lista.map((v) => lecturaVentas({ sede: v.sede, deltaSemanaPct: v.deltaRangoPct, deltaMesPct: v.deltaMesPct, esAtelier: v.sede.includes("Atelier") }));

  lista.forEach((v, i) => {
    const x = MX + i * (w + gap);
    const lec = lecturas[i];
    const esAt = v.sede.includes("Atelier");
    const cab = 0.46;
    tarjeta(s, x, y, w, h, { cabecera: { alto: cab, color: SUAVE[lec.tono] } });
    icono(s, esAt ? "fabrica" : "tienda", "oscuro", x + 0.14, y + 0.1, 0.26);
    texto(s, v.sede.toUpperCase(), { x: x + 0.5, y: y + 0.06, w: w - 0.6, h: 0.2, fontSize: 11, bold: true, color: C.tinta });
    texto(s, esAt ? "Producción (B2B)" : "Cafetería", { x: x + 0.5, y: y + 0.26, w: 1.3, h: 0.15, fontSize: 7.5, color: C.gris });
    if (v.hasta === null) {
      texto(s, "Sin reporte de ventas subido.", { x: x + 0.16, y: y + 0.7, w: w - 0.32, h: 0.25, fontSize: 9, italic: true, color: C.gris });
      return;
    }
    // Honestidad del dato: reporte atrasado o fuente de respaldo.
    const aviso = v.hasta < weekEnd ? `⚠ datos al ${diaCorto(v.hasta)}` : v.fuente === "registro" ? "⚠ registro diario" : v.fuente === "mixta" ? "fuentes combinadas" : "";
    if (aviso) texto(s, aviso, { x: x + w - 1.3, y: y + 0.26, w: 1.18, h: 0.15, fontSize: 6.5, italic: true, color: C.ambarTexto, align: "right" });

    const bloque = (by: number, titulo: string, valor: number, delta: number | null, nota: string | null) => {
      texto(s, titulo, { x: x + 0.16, y: by, w: w - 0.32, h: 0.14, fontSize: 7.5, color: C.gris });
      texto(s, solesDeck(valor), { x: x + 0.16, y: by + 0.16, w: w - 1.2, h: 0.26, fontSize: 15, bold: true, color: C.tinta });
      const tono: Tono = delta === null ? "gris" : delta >= 0 ? "verde" : "rojo";
      pastilla(s, x + w - 0.98, by + 0.18, 0.82, 0.22, deltaTxt(delta), tono, { flecha: delta === null ? null : delta >= 0 ? "arriba" : "abajo", tam: 8.5 });
      if (nota) texto(s, nota, { x: x + 0.16, y: by + 0.44, w: w - 0.32, h: 0.13, fontSize: 6.5, color: C.gris });
    };
    bloque(y + 0.56, `Venta del periodo (${rangoCorto(ctx.ws, ctx.we)})`, v.rango, v.deltaRangoPct,
      v.rangoPrev !== null ? `vs. periodo anterior: ${solesDeck(v.rangoPrev)}` : "vs. periodo anterior");
    s.addShape("line", { x: x + 0.14, y: y + 1.16, w: w - 0.28, h: 0, line: { color: C.borde, width: 0.5 } });
    bloque(y + 1.22, `Acumulado del mes (1–${dia} ${MES3[mm - 1]})`, v.mes, v.deltaMesPct, null);

    // Barras: este mes vs el anterior, a mismos días.
    const maxV = Math.max(v.mes, v.mesPrev ?? 0, 1);
    const bx = x + 0.86, bw = w - 1.72;
    const filas: [string, number | null, string][] = [[`${mesTxt(mesAct)}`, v.mes, C.oscuro], [`${mesTxt(prev)}`, v.mesPrev, "C9C6BB"]];
    filas.forEach(([lab, val, col], k) => {
      const ry = y + 1.74 + k * 0.2;
      texto(s, lab, { x: x + 0.16, y: ry, w: 0.68, h: 0.16, fontSize: 7, bold: k === 0, color: C.tinta });
      if (val !== null && val > 0) {
        const bwv = Math.max(0.04, bw * (val / maxV));
        s.addShape("rect", { x: bx, y: ry + 0.025, w: bwv, h: 0.11, fill: { color: col }, line: { color: col, type: "none" } });
        texto(s, solesDeck0(val), { x: bx + bwv + 0.05, y: ry, w: 0.8, h: 0.16, fontSize: 7, bold: k === 0, color: C.tinta });
      } else {
        texto(s, "sin datos", { x: bx, y: ry, w: 1, h: 0.16, fontSize: 7, italic: true, color: C.gris });
      }
    });
  });

  const ly = y + h + 0.16;
  lecturaPorSede(s, MX, ly, ANCHO, YMAX - ly, lecturas, {
    sub: "Tendencia del mes y acción sugerida por sede.",
    signo: (l) => (l.tono === "verde" ? "flechaArriba" : l.tono === "gris" ? "alerta" : "flechaAbajo"),
  });
}

/* ───────────────── 4 y 5 · Detalle de KPIs de una cafetería ───────────────── */

function tarjetaKpi(s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, o: {
  iconoK: Icono; etiqueta: string; valor: string; tono: Tono; pill: string; flecha?: "arriba" | "abajo" | null; check?: boolean;
  meta: string; lineas: [string, string, string][];
}) {
  tarjeta(s, x, y, w, h, { fondo: SUAVE[o.tono] === SUAVE.gris ? C.blanco : SUAVE[o.tono] });
  icono(s, o.iconoK, "oscuro", x + 0.12, y + 0.1, 0.22);
  texto(s, o.etiqueta, { x: x + 0.42, y: y + 0.1, w: w - 0.5, h: 0.22, fontSize: 8.5, bold: true, color: C.tinta });
  texto(s, o.valor, { x: x + 0.12, y: y + 0.36, w: w - 0.24, h: 0.3, fontSize: 16, bold: true, color: C.tinta, align: "center" });
  pastilla(s, x + 0.12, y + 0.72, 0.84, 0.22, o.pill, o.tono, { flecha: o.flecha, check: o.check, tam: 8.5 });
  texto(s, o.meta, { x: x + 1.02, y: y + 0.7, w: w - 1.1, h: 0.26, fontSize: 6.5, color: C.gris });
  s.addShape("line", { x: x + 0.12, y: y + 1.02, w: w - 0.24, h: 0, line: { color: C.borde, width: 0.5 } });
  o.lineas.forEach(([a, b, c], k) => {
    const ly = y + 1.06 + k * 0.15;
    texto(s, a, { x: x + 0.12, y: ly, w: 0.62, h: 0.14, fontSize: 7, color: C.gris });
    texto(s, b, { x: x + 0.74, y: ly, w: 0.6, h: 0.14, fontSize: 7, color: C.tinta });
    texto(s, c, { x: x + 1.2, y: ly, w: w - 1.32, h: 0.14, fontSize: 7, color: C.tinta, align: "right" });
  });
}

function tablaDiaria(s: PptxGenJS.Slide, x: number, y: number, w: number, filaH: number, sm: KpiWeekSummary, tg: Cafeteria["targets"]) {
  const tc = (t: KpiTraffic) => (t === "gris" ? C.tinta : TEXTO[t2t(t)]);
  // Encabezados cortos: una sola línea aunque la columna sea angosta.
  const lim = (n: number | null) => (n === null ? "" : ` <${n}m`);
  const hdr = ["Día", "Ventas", "Ticket", "NPS", "Mermas", `Mostr.${lim(tg.tiempoMaxMin)}`, `Mesa${lim(tg.tiempoMesaMaxMin)}`, `Deliv.${lim(tg.tiempoDeliveryMaxMin)}`];
  const rows: PptxGenJS.TableRow[] = [
    hdr.map((t) => ({ text: t, options: { bold: true, color: C.blanco, fill: { color: C.oscuro } } })),
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
    x, y, w, rowH: filaH, fontFace: FONT, fontSize: 7.5, color: C.tinta, valign: "middle",
    border: { type: "solid", pt: 0.5, color: C.borde }, autoPage: false, margin: [0.01, 0.05, 0.01, 0.05],
    colW: [0.11, 0.16, 0.13, 0.08, 0.14, 0.13, 0.13, 0.12].map((p) => p * w),
  });
}

export function detalleCafeteria(ctx: Ctx, cf: Cafeteria, variante: "columna" | "fila") {
  const s = diapositiva(ctx.pptx, {
    titulo: `${cf.sede}: detalle de KPIs`, subtitulo: "Resultados de la semana comparados con sus metas.",
    periodo: ctx.periodo, derecha: `${cf.sede} · Detalle de KPIs`,
  });
  cajaFecha(s, `Semana ${semanaCorta(ctx)}`, "Fuente: Byte y registro diario");
  const sm = cf.summary, tg = cf.targets;
  const y = Y0, h = 1.38, gap = 0.15;
  const w = (ANCHO - gap * 3) / 4;
  const pctPill = (p: number | null) => (p === null ? "—" : pctTxt(p));
  const fl = (p: number | null) => (p === null ? null : p >= 100 ? "arriba" as const : "abajo" as const);
  const ex = (e: { date: string; value: number } | null, fmt: (n: number) => string) => (e ? [diaCortoSemana(e.date), fmt(e.value)] as const : ["—", "—"] as const);
  const bV = ex(sm.best.ventas, (n) => solesDeck(n)), wV = ex(sm.worst.ventas, (n) => solesDeck(n));
  const bT = ex(sm.best.ticket, (n) => solesDeck(n)), wT = ex(sm.worst.ticket, (n) => solesDeck(n));
  const bN = ex(sm.best.nps, String), wN = ex(sm.worst.nps, String);
  // En mermas "mejor" es el día con MENOS merma.
  const bM = ex(sm.worst.mermas, (n) => solesDeck(n)), wM = ex(sm.best.mermas, (n) => solesDeck(n));
  const difV = sm.ventasPct === null ? "" : `\n${deltaTxt(Math.round((sm.ventasPct - 100) * 10) / 10)} vs. meta`;
  const difT = sm.ticketPct === null ? "" : `\n${deltaTxt(Math.round((sm.ticketPct - 100) * 10) / 10)} vs. ref.`;
  tarjetaKpi(s, MX, y, w, h, {
    iconoK: "barras", etiqueta: "Venta diaria (prom.)", valor: solesDeck(sm.ventasProm), tono: sm.ventasPct === null ? "gris" : t2t(sm.traffic.ventas),
    pill: pctPill(sm.ventasPct), flecha: fl(sm.ventasPct), meta: `Meta ${solesDeck0(tg.ventaDiaria)}${difV}`,
    lineas: [["Mejor día", bV[0], bV[1]], ["Peor día", wV[0], wV[1]]],
  });
  tarjetaKpi(s, MX + (w + gap), y, w, h, {
    iconoK: "carrito", etiqueta: "Ticket promedio", valor: solesDeck(sm.ticketProm), tono: sm.ticketPct === null ? "gris" : t2t(sm.traffic.ticket),
    pill: pctPill(sm.ticketPct), flecha: fl(sm.ticketPct), meta: `Ref. ${solesDeck(tg.ticketRef)}${difT}`,
    lineas: [["Más alto", bT[0], bT[1]], ["Más bajo", wT[0], wT[1]]],
  });
  tarjetaKpi(s, MX + (w + gap) * 2, y, w, h, {
    iconoK: "estrella", etiqueta: "NPS (prom.)", valor: sm.npsProm === null ? "—" : String(sm.npsProm), tono: sm.npsProm === null ? "gris" : t2t(sm.traffic.nps),
    pill: sm.npsProm === null ? "Sin dato" : sm.traffic.nps === "verde" ? "En meta" : "Bajo meta", check: sm.traffic.nps === "verde",
    meta: `Meta ≥ ${tg.npsMin}`, lineas: [["Más alto", bN[0], bN[1]], ["Más bajo", wN[0], wN[1]]],
  });
  tarjetaKpi(s, MX + (w + gap) * 3, y, w, h, {
    iconoK: "torta", etiqueta: "Mermas (% ventas)", valor: sm.mermasPct === null ? "—" : `${sm.mermasPct}%`, tono: sm.mermasPct === null ? "gris" : t2t(sm.traffic.mermas),
    pill: sm.mermasPct === null ? "Sin dato" : sm.traffic.mermas === "verde" ? "En meta" : "Fuera", check: sm.traffic.mermas === "verde",
    meta: `Máx. ${Math.round(tg.mermasMaxPct * 100)}%\n${solesDeck(sm.mermasTotal)} en total`, lineas: [["Más alto", bM[0], bM[1]], ["Más bajo", wM[0], wM[1]]],
  });

  const hs = hallazgosCafeteria({
    sede: cf.sede, ventasPct: sm.ventasPct, ticketPct: sm.ticketPct, nps: sm.npsProm, npsMin: tg.npsMin, mermasPct: sm.mermasPct,
    mermasMaxPct: tg.mermasMaxPct, traffic: sm.traffic, ventasProm: sm.ventasProm, ticketProm: sm.ticketProm,
    peorDiaVentas: sm.worst.ventas ? { dia: diaCortoSemana(sm.worst.ventas.date), valor: sm.worst.ventas.value } : null,
  });
  const ty = y + h + 0.14;
  texto(s, "Detalle diario de la semana", { x: MX, y: ty, w: 4, h: 0.2, fontSize: 10, bold: true, color: C.oscuro });
  // Centro usaba la lectura en fila bajo la tabla, pero con 7 días no
  // entraba sin apretar la tabla: las dos sedes usan la misma disposición.
  void variante;
  const fh = Math.min(0.26, (YMAX - (ty + 0.26)) / (sm.days.length + 1));
  tablaDiaria(s, MX, ty + 0.26, 5.95, fh, sm, tg);
  hallazgosEnColumna(s, 6.5, ty, W - MX - 6.5, YMAX - ty, hs);
}

/* ─────────────────────── 6 · Atelier (B2B) ─────────────────────── */

/** Barras verticales dibujadas con formas: se ven igual en cualquier programa. */
function barrasDiarias(s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, dias: { etiqueta: string; valor: number }[]) {
  if (dias.length === 0) return;
  const max = Math.max(...dias.map((d) => d.valor), 1);
  const col = w / dias.length;
  const bw = Math.min(0.42, col * 0.6);
  const base = y + h - 0.2;
  const alto = h - 0.42;
  s.addShape("line", { x, y: base, w, h: 0, line: { color: C.borde, width: 0.75 } });
  dias.forEach((d, i) => {
    const cx = x + i * col + col / 2;
    const bh = Math.max(0.02, alto * (d.valor / max));
    s.addShape("rect", { x: cx - bw / 2, y: base - bh, w: bw, h: bh, fill: { color: C.oscuro }, line: { color: C.oscuro, type: "none" } });
    texto(s, Math.round(d.valor).toLocaleString("es-PE"), { x: cx - col / 2, y: base - bh - 0.18, w: col, h: 0.15, fontSize: 7, bold: true, color: C.tinta, align: "center" });
    texto(s, d.etiqueta, { x: cx - col / 2, y: base + 0.04, w: col, h: 0.14, fontSize: 7, color: C.gris, align: "center" });
  });
}

export function detalleAtelier(ctx: Ctx, at: Atelier, ventasAt: Ventas | null) {
  const s = diapositiva(ctx.pptx, {
    titulo: "Atelier: detalle de ventas (B2B)", subtitulo: "Resultados de la semana en producción y ventas a clientes B2B.",
    periodo: ctx.periodo, derecha: "Atelier (B2B) · Detalle de ventas",
  });
  cajaFecha(s, `Semana ${semanaCorta(ctx)}`, "Fuente: Byte");
  const y = Y0, h = 1.2, gap = 0.15;
  const w = (ANCHO - gap * 3) / 4;
  const dSem = ventasAt?.deltaRangoPct ?? null;
  // El % compara el MISMO número que muestra la tarjeta (promedio por día de
  // la semana) contra el promedio por día del mes anterior a mismos días.
  const promMesPrev = ventasAt && ventasAt.mesPrev !== null && ventasAt.mesPrevDias > 0 ? ventasAt.mesPrev / ventasAt.mesPrevDias : null;
  const dMes = at.ventasProm !== null && promMesPrev ? Math.round(((at.ventasProm - promMesPrev) / promMesPrev) * 1000) / 10 : null;

  const card = (i: number, ic: Icono, et: string, val: string, sub: string, tono: Tono, delta?: { p: number | null; nota: string }) => {
    const x = MX + i * (w + gap);
    tarjeta(s, x, y, w, h, { fondo: tono === "gris" ? C.blanco : SUAVE[tono] });
    icono(s, ic, tono === "gris" ? "oscuro" : iconoTono(tono), x + 0.12, y + 0.1, 0.22);
    texto(s, et, { x: x + 0.42, y: y + 0.1, w: w - 0.5, h: 0.22, fontSize: 8.5, bold: true, color: C.tinta });
    texto(s, val, { x: x + 0.12, y: y + 0.38, w: w - 0.24, h: 0.3, fontSize: 16, bold: true, color: C.tinta });
    texto(s, sub, { x: x + 0.12, y: y + 0.68, w: w - 0.24, h: 0.15, fontSize: 7.5, bold: !delta, color: delta ? C.gris : TEXTO[tono] });
    if (delta) {
      pastilla(s, x + 0.12, y + 0.88, 0.76, 0.22, deltaTxt(delta.p), delta.p === null ? "gris" : delta.p >= 0 ? "verde" : "rojo", { flecha: delta.p === null ? null : delta.p >= 0 ? "arriba" : "abajo", tam: 8.5 });
      texto(s, delta.nota, { x: x + 0.94, y: y + 0.86, w: w - 1.02, h: 0.26, fontSize: 6.5, color: C.gris });
    }
  };
  card(0, "barras", "Ventas del período", solesDeck(at.ventasTotal), `${at.daysWithData} días con venta`, "gris",
    { p: dSem, nota: `vs. periodo anterior${ventasAt?.rangoPrev != null ? `\n${solesDeck(ventasAt.rangoPrev)}` : ""}` });
  card(1, "carrito", "Promedio por día", solesDeck(at.ventasProm), "sobre días con venta", "gris",
    { p: dMes, nota: `vs. prom. mes anterior${promMesPrev !== null ? `\n${solesDeck(Math.round(promMesPrev * 100) / 100)}` : ""}` });
  card(2, "flechaArriba", "Mejor día", at.best ? solesDeck(at.best.value) : "—", at.best ? diaCortoSemana(at.best.date) : "", "verde");
  card(3, "flechaAbajo", "Día más bajo", at.worst ? solesDeck(at.worst.value) : "—", at.worst ? diaCortoSemana(at.worst.date) : "", "ambar");

  const by = y + h + 0.16, bh = YMAX - by;
  // Gráfico de la venta diaria.
  tarjeta(s, MX, by, 3.4, bh);
  texto(s, "Ventas diarias (S/)", { x: MX + 0.16, y: by + 0.1, w: 3, h: 0.2, fontSize: 10, bold: true, color: C.tinta });
  barrasDiarias(s, MX + 0.16, by + 0.4, 3.08, bh - 0.5, at.days.map((d) => ({ etiqueta: diaCortoSemana(d.date), valor: d.value })));
  // Tabla del detalle diario.
  texto(s, "Detalle diario", { x: 3.95, y: by, w: 2.2, h: 0.2, fontSize: 10, bold: true, color: C.oscuro });
  s.addTable([
    ["Día", "Venta Byte (S/)"].map((t) => ({ text: t, options: { bold: true, color: C.blanco, fill: { color: C.oscuro } } })),
    ...at.days.map((d, i): PptxGenJS.TableRow => [
      { text: diaCortoSemana(d.date), options: { fill: { color: i % 2 ? "F7F5EE" : C.blanco } } },
      { text: d.value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), options: { fill: { color: i % 2 ? "F7F5EE" : C.blanco }, align: "right" } },
    ]),
  ], {
    x: 3.95, y: by + 0.26, w: 2.2, colW: [0.8, 1.4], rowH: Math.min(0.26, (bh - 0.3) / (at.days.length + 1)),
    fontFace: FONT, fontSize: 8, color: C.tinta, valign: "middle", border: { type: "solid", pt: 0.5, color: C.borde }, autoPage: false, margin: [0.01, 0.06, 0.01, 0.06],
  });
  hallazgosEnColumna(s, 6.4, by, W - MX - 6.4, bh, hallazgosAtelier({
    ventasTotal: at.ventasTotal, dias: at.daysWithData, deltaSemanaPct: dSem, promDia: at.ventasProm, deltaPromMesPct: dMes,
    ticketProm: at.ticketProm, mermasTotal: at.mermasTotal, mermasPct: at.mermasPct,
  }));
}

/* ──────────────── 7 · Meta de ticket & plan de incentivos ──────────────── */

export function incentivos(ctx: Ctx, cafeterias: Cafeteria[]) {
  const s = diapositiva(ctx.pptx, {
    titulo: "Meta de ticket y plan de incentivos", subtitulo: "Mes en curso: avance por nivel y bono proyectado de cada sede.",
    periodo: ctx.periodo, derecha: "Incentivos",
  });
  const y = Y0, h = 2.56, gap = 0.2;
  const w = (ANCHO - gap) / 2;
  cafeterias.forEach((cf, i) => {
    const x = MX + i * (w + gap);
    const inc = cf.incentives;
    const tono: Tono = !inc || inc.deltaActual === null ? "gris" : inc.deltaActual > 0 ? "verde" : "rojo";
    const cab = 0.58;
    tarjeta(s, x, y, w, h, { cabecera: { alto: cab, color: SUAVE[tono] } });
    icono(s, "tienda", "oscuro", x + 0.16, y + 0.13, 0.32);
    texto(s, cf.sede.toUpperCase(), { x: x + 0.58, y: y + 0.1, w: 1.8, h: 0.38, fontSize: 13, bold: true, color: C.tinta });
    if (!inc) {
      texto(s, "Sin configuración de incentivos.", { x: x + 0.16, y: y + 0.8, w: w - 0.32, h: 0.25, fontSize: 9, italic: true, color: C.gris });
      return;
    }
    // Ticket actual vs base, a la derecha de la franja.
    const bx = x + w - 1.72;
    s.addShape("roundRect", { x: bx, y: y + 0.07, w: 1.58, h: 0.44, rectRadius: 0.05, fill: { color: C.blanco }, line: { color: C.borde, width: 0.5 } });
    texto(s, "Ticket actual vs. base", { x: bx + 0.1, y: y + 0.09, w: 1.4, h: 0.13, fontSize: 6.5, color: C.gris });
    texto(s, inc.deltaActual === null ? "—" : `${inc.deltaActual >= 0 ? "+" : "−"}${solesDeck(Math.abs(inc.deltaActual))}`, {
      x: bx + 0.1, y: y + 0.21, w: 0.8, h: 0.2, fontSize: 11, bold: true, color: TEXTO[tono],
    });
    texto(s, `${solesDeck(inc.ticketBase)} → ${solesDeck(inc.ticketActual)}`, { x: bx + 0.7, y: y + 0.22, w: 0.84, h: 0.2, fontSize: 6.5, color: C.gris, align: "right" });

    // Tres datos: venta nueva, candado (meta de ventas o piso de tráfico), pozo.
    const sy = y + cab + 0.1, sw = (w - 0.28) / 3;
    const cv = inc.candadoVentas;
    const candado = cv && cv.meta !== null
      ? { et: "Meta de ventas", val: `${solesDeck0(cv.ventas)}`, nota: `de ${solesDeck0(cv.meta)} · ${cv.cumple ? "cubierta ✓" : cv.enCamino ? "en camino ✓" : "en riesgo ✗"}`, ok: cv.cumple || cv.enCamino }
      : inc.trafficFloor !== null
        ? { et: "Piso de tráfico", val: `${inc.personasPorDia ?? "—"} pers./día`, nota: `mín. ${inc.trafficFloor} ${inc.trafficOk ? "✓" : "✗"}`, ok: inc.trafficOk }
        : { et: "Piso de tráfico", val: "—", nota: "no aplica este mes", ok: true };
    const datos: [Icono, string, string, string, string][] = [
      ["personas", "Venta nueva por cliente", inc.deltaActual === null ? "—" : `${inc.deltaActual >= 0 ? "+" : "−"}${solesDeck(Math.abs(inc.deltaActual))}`, "vs. ticket base", TEXTO[tono]],
      ["barras", candado.et, candado.val, candado.nota, candado.ok ? C.verde : C.rojo],
      ["diana", "Pozo al cierre", solesDeck(inc.pozoProyectado), "techo: 40% de la venta nueva", C.gris],
    ];
    datos.forEach(([ic, et, val, nota, col], k) => {
      const dx = x + 0.14 + k * sw;
      if (k > 0) s.addShape("line", { x: dx - 0.05, y: sy, w: 0, h: 0.5, line: { color: C.borde, width: 0.5 } });
      icono(s, ic, "oscuro", dx + 0.02, sy + 0.02, 0.22);
      texto(s, et, { x: dx + 0.3, y: sy, w: sw - 0.34, h: 0.14, fontSize: 7, color: C.gris });
      texto(s, val, { x: dx + 0.3, y: sy + 0.15, w: sw - 0.34, h: 0.2, fontSize: 10.5, bold: true, color: k === 0 ? col : C.tinta });
      texto(s, nota, { x: dx + 0.3, y: sy + 0.36, w: sw - 0.34, h: 0.13, fontSize: 6.5, color: k === 1 ? col : C.gris });
    });

    // Tabla de niveles con la barra de avance (dibujada a mano: las tablas no llevan barras).
    const ty = sy + 0.64, rh = 0.25;
    const tw = w - 0.28;
    const cols = [0.28, 0.2, 0.22, 0.3].map((p) => p * tw);
    const cx = [x + 0.14, x + 0.14 + cols[0], x + 0.14 + cols[0] + cols[1], x + 0.14 + cols[0] + cols[1] + cols[2]];
    s.addShape("rect", { x: x + 0.14, y: ty, w: tw, h: rh, fill: { color: C.oscuro }, line: { color: C.oscuro, type: "none" } });
    ["Nivel", "Ticket meta", "Bonos (S/)", "Avance"].forEach((t, k) => {
      texto(s, t, { x: cx[k] + 0.08, y: ty, w: cols[k] - 0.1, h: rh, fontSize: 7.5, bold: true, color: C.blanco });
    });
    inc.niveles.forEach((n, r) => {
      const ry = ty + rh * (r + 1);
      const actual = inc.nivelAlcanzado === n.nombre;
      s.addShape("rect", { x: x + 0.14, y: ry, w: tw, h: rh, fill: { color: r % 2 ? "F7F5EE" : C.blanco }, line: { color: C.borde, width: 0.5 } });
      texto(s, `${actual ? "✓ " : ""}${n.nombre}`, { x: cx[0] + 0.08, y: ry, w: cols[0] - 0.1, h: rh, fontSize: 8, bold: actual, color: C.tinta });
      texto(s, solesDeck(inc.ticketBase + n.delta), { x: cx[1] + 0.08, y: ry, w: cols[1] - 0.1, h: rh, fontSize: 8, color: C.tinta });
      texto(s, n.sumaBonos.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { x: cx[2] + 0.08, y: ry, w: cols[2] - 0.1, h: rh, fontSize: 8, color: C.tinta });
      const av = avanceNivel(inc.deltaActual, n.delta);
      const barW = cols[3] - 0.56;
      s.addShape("rect", { x: cx[3] + 0.08, y: ry + 0.085, w: barW, h: 0.08, fill: { color: "E7E4DA" }, line: { color: "E7E4DA", type: "none" } });
      if (av > 0) s.addShape("rect", { x: cx[3] + 0.08, y: ry + 0.085, w: barW * (av / 100), h: 0.08, fill: { color: av >= 80 ? C.verde : "9A9A94" }, line: { color: av >= 80 ? C.verde : "9A9A94", type: "none" } });
      texto(s, `${av}%`, { x: cx[3] + 0.12 + barW, y: ry, w: 0.36, h: rh, fontSize: 7.5, color: C.tinta, align: "right" });
    });
  });

  const prox = (cf: Cafeteria) => {
    const inc = cf.incentives;
    if (!inc) return null;
    const siguiente = inc.niveles.find((n) => avanceNivel(inc.deltaActual, n.delta) < 100);
    return siguiente ? { nivel: siguiente.nombre, pct: avanceNivel(inc.deltaActual, siguiente.delta) } : null;
  };
  const ly = y + h + 0.14, lh = 0.84;
  hallazgosEnFila(s, MX, ly, ANCHO, lh, hallazgosIncentivos(cafeterias.filter((cf) => cf.incentives).map((cf) => ({
    sede: cf.sede, deltaActual: cf.incentives!.deltaActual, personasPorDia: cf.incentives!.personasPorDia, trafficFloor: cf.incentives!.trafficFloor,
    trafficOk: cf.incentives!.trafficOk,
    candado: cf.incentives!.candadoVentas && cf.incentives!.candadoVentas.meta !== null
      ? { meta: cf.incentives!.candadoVentas.meta, proyeccion: cf.incentives!.candadoVentas.proyeccion, cumple: cf.incentives!.candadoVentas.cumple, enCamino: cf.incentives!.candadoVentas.enCamino }
      : null,
    avanceProximo: prox(cf), nivelAlcanzado: cf.incentives!.nivelAlcanzado,
  }))), { numerados: true });
  texto(s, "El bono se paga solo con la venta nueva (subir el ticket) y con el candado del mes cumplido; nunca con la utilidad de hoy.", {
    x: MX, y: ly + lh + 0.06, w: ANCHO, h: 0.16, fontSize: 7, italic: true, color: C.gris,
  });
}

/* ──────────────────── 8 · Punto de equilibrio ──────────────────── */

const TONO_ESTADO: Record<BreakevenEstado, Tono> = { superado: "verde", en_camino: "ambar", en_riesgo: "rojo", sin_datos: "gris" };
const FRASE_ESTADO: Record<BreakevenEstado, string> = {
  superado: "Ya cubrió sus costos", en_camino: "Los cubre al ritmo actual", en_riesgo: "No llega al ritmo actual", sin_datos: "Faltan datos",
};

export function puntoDeEquilibrio(ctx: Ctx, be: GroupBreakeven) {
  const mesNombre = monthLabel(be.month);
  const s = diapositiva(ctx.pptx, {
    titulo: "Punto de equilibrio del mes por sede",
    subtitulo: `${mesNombre.charAt(0).toUpperCase()}${mesNombre.slice(1)}${be.isCurrent ? " (en curso)" : ""}. La línea negra es lo que hay que vender para cubrir los costos.`,
    periodo: ctx.periodo, derecha: "Punto de equilibrio",
  });
  const hastaMax = be.sedes.map((x) => x.ventasHasta).filter((x): x is string => !!x).sort().pop() ?? null;
  cajaFecha(s, hastaMax ? `Al ${Number(hastaMax.slice(8, 10))} de ${MESES[Number(hastaMax.slice(5, 7)) - 1]} ${hastaMax.slice(0, 4)}` : "Sin ventas cargadas", "Fuente: Byte");

  const filaH = 0.74, gap = 0.1;
  const orden = ["Atelier", "Fonavi", "Centro"];
  const sedes = [...be.sedes].sort((a, b) => orden.findIndex((o) => a.name.includes(o)) - orden.findIndex((o) => b.name.includes(o)));
  sedes.forEach((sd, i) => {
    const y = Y0 + i * (filaH + gap);
    const r = sd.result;
    const tono = TONO_ESTADO[r.estado];
    tarjeta(s, MX, y, ANCHO, filaH);
    icono(s, sd.name.includes("Atelier") ? "fabrica" : "tienda", iconoTono(tono), MX + 0.16, y + 0.2, 0.32);
    texto(s, sd.name.replace("Yayi's ", ""), { x: MX + 0.6, y: y + 0.1, w: 1.6, h: 0.22, fontSize: 12, bold: true, color: C.tinta });
    texto(s, FRASE_ESTADO[r.estado], { x: MX + 0.6, y: y + 0.33, w: 1.65, h: 0.15, fontSize: 7.5, bold: true, color: TEXTO[tono] });
    if (sd.ventasHasta) texto(s, `Ventas al ${diaCorto(sd.ventasHasta)}`, { x: MX + 0.6, y: y + 0.5, w: 1.6, h: 0.13, fontSize: 6.5, color: C.gris });

    const lx = MX + 2.35, lw = 4.35, lh = 0.28, ly = y + 0.12;
    s.addShape("roundRect", { x: lx, y: ly, w: lw, h: lh, rectRadius: 0.04, fill: { color: "EFEDE6" }, line: { color: "EFEDE6", type: "none" } });
    if (r.breakEven === null) {
      texto(s, r.warnings[0] ?? "Sin costos fijos clasificados: no hay punto de equilibrio que calcular.", { x: lx + 0.1, y: ly, w: lw - 0.2, h: lh, fontSize: 7.5, color: C.gris });
    } else {
      const frac = anchoBarra(r.avancePct);
      if (frac > 0) s.addShape("roundRect", { x: lx, y: ly, w: lw * frac, h: lh, rectRadius: 0.04, fill: { color: FUERTE[tono] }, line: { color: FUERTE[tono], type: "none" } });
      const dentro = frac >= 0.25;
      texto(s, solesDeck0(r.ventas), { x: dentro ? lx + 0.1 : lx + lw * frac + 0.08, y: ly, w: 1.2, h: lh, fontSize: 9.5, bold: true, color: dentro ? C.blanco : C.tinta });
      const mx = lx + lw * POS_META;
      s.addShape("rect", { x: mx - 0.01, y: ly - 0.05, w: 0.02, h: lh + 0.1, fill: { color: C.tinta }, line: { color: C.tinta, type: "none" } });
      texto(s, `Equilibrio: ${solesDeck0(r.breakEven)}`, { x: mx - 1, y: ly + lh + 0.08, w: 2, h: 0.14, fontSize: 7, color: C.tinta, align: "center" });
    }
    // Recuadro derecho: porcentaje y lo que falta.
    const rx = lx + lw + 0.2, rw = MX + ANCHO - 0.12 - rx;
    const conCheck = r.estado === "superado";
    s.addShape("roundRect", { x: rx, y: y + 0.08, w: rw, h: filaH - 0.16, rectRadius: 0.05, fill: { color: SUAVE[tono] }, line: { color: SUAVE[tono], type: "none" } });
    const tw = rw - (conCheck ? 0.5 : 0.16);
    texto(s, r.avancePct === null ? "—" : `${Math.round(r.avancePct)}%`, { x: rx + 0.08, y: y + 0.12, w: tw, h: 0.26, fontSize: 14, bold: true, color: TEXTO[tono], align: "center" });
    const falta = faltaParaEquilibrio(r);
    const pie = conCheck ? "Costos cubiertos" : r.estado === "sin_datos" ? "" : r.diaEstimadoCruce !== null ? `Cruza la línea el día ${r.diaEstimadoCruce}` : falta !== null ? `Faltan ${solesDeck0(falta)}` : "";
    texto(s, pie, { x: rx + 0.08, y: y + 0.4, w: tw, h: 0.16, fontSize: 7, color: C.tinta, align: "center" });
    if (conCheck) circulo(s, rx + rw - 0.38, y + 0.23, 0.28, "✓", "verde");
  });

  // Consolidado del grupo + lectura.
  const gy = Y0 + sedes.length * (filaH + gap) + 0.02;
  const avisos = [...new Set([...be.grupo.warnings, ...be.sedes.flatMap((x) => x.result.warnings)])];
  const gh = YMAX - gy - (avisos.length > 0 ? 0.24 : 0);
  const g = be.grupo;
  const tg = TONO_ESTADO[g.estado];
  tarjeta(s, MX, gy, ANCHO, gh, { fondo: "FBF7EE" });
  icono(s, "grupo", "oscuro", MX + 0.16, gy + 0.16, 0.32);
  texto(s, "Grupo", { x: MX + 0.6, y: gy + 0.14, w: 2.2, h: 0.24, fontSize: 12, bold: true, color: C.tinta });
  const izq = 2.55;
  if (g.breakEven !== null) {
    texto(s, `Vendido: ${solesDeck0(g.ventas)} de ${solesDeck0(g.breakEven)}`, { x: MX + 0.6, y: gy + 0.42, w: izq, h: 0.17, fontSize: 8.5, bold: true, color: C.tinta });
    const fg = faltaParaEquilibrio(g);
    const linea = `${Math.round(g.avancePct ?? 0)}% del equilibrio${g.estado !== "superado" && fg !== null ? ` · faltan ${solesDeck0(fg)}` : " · costos cubiertos"}`;
    texto(s, linea, { x: MX + 0.6, y: gy + 0.62, w: izq, h: altoLinea(8) * lineasEstimadas(linea, 8, izq, true), fontSize: 8, bold: true, color: TEXTO[tg], valign: "top" });
  } else {
    texto(s, "Aún no se puede calcular el consolidado.", { x: MX + 0.6, y: gy + 0.42, w: izq, h: 0.17, fontSize: 8.5, color: C.gris });
  }
  const lx0 = MX + 3.3;
  s.addShape("line", { x: lx0 - 0.14, y: gy + 0.14, w: 0, h: gh - 0.28, line: { color: C.borde, width: 0.75 } });
  const hs = hallazgosEquilibrio(
    sedes.map((sd) => ({ nombre: sd.name.replace("Yayi's ", ""), avancePct: sd.result.avancePct, falta: faltaParaEquilibrio(sd.result), superado: sd.result.estado === "superado", sinDatos: sd.result.breakEven === null })),
    { nombre: "Grupo", avancePct: g.avancePct, falta: faltaParaEquilibrio(g), superado: g.estado === "superado", sinDatos: g.breakEven === null },
  );
  // Lectura dentro del mismo recuadro, a la derecha del consolidado.
  s.addShape("roundRect", { x: lx0, y: gy + 0.12, w: 0.28, h: 0.28, rectRadius: 0.05, fill: { color: C.oscuro }, line: { color: C.oscuro, type: "none" } });
  icono(s, "lectura", "blanco", lx0 + 0.05, gy + 0.17, 0.18);
  texto(s, "Lectura de la semana", { x: lx0 + 0.38, y: gy + 0.12, w: 2.5, h: 0.28, fontSize: 10, bold: true, color: C.oscuro });
  const colW = (MX + ANCHO - 0.12 - lx0) / Math.max(1, hs.length);
  hs.forEach((hz, i) => {
    const cx = lx0 + i * colW, cy = gy + 0.5;
    const tw = colW - 0.42;
    circulo(s, cx, cy, 0.24, String(i + 1), hz.tono);
    const th = altoLinea(8.5) * lineasEstimadas(hz.titulo, 8.5, tw, true);
    texto(s, hz.titulo, { x: cx + 0.32, y: cy + 0.02, w: tw, h: th, fontSize: 8.5, bold: true, color: C.oscuro, valign: "top" });
    texto(s, hz.texto, { x: cx + 0.32, y: cy + th + 0.05, w: tw, h: Math.max(0.15, gy + gh - 0.08 - (cy + th + 0.05)), fontSize: 7, color: C.gris, valign: "top" });
  });
  if (avisos.length > 0) {
    texto(s, `⚠ ${avisos[0]}`, { x: MX, y: YMAX - 0.18, w: ANCHO, h: 0.2, fontSize: 6.5, color: C.ambarTexto });
  }
}
