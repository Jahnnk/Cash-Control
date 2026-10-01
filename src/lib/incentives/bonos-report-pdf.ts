/**
 * Reporte de Bonos e Incentivos · PDF (renderer tonto, jsPDF).
 *
 * Nació como el reporte del piloto de julio (01-ago-2026: "lujo de detalle"
 * para cada administrador) y se rehízo el 1-oct-2026 para el cierre de
 * septiembre, a pedido de Jahnn y de Kelly (Gerencia de Finanzas):
 *
 *   · Cada sede en sus propias páginas y con su propio color, para que el
 *     bono de Fonavi no se confunda con el del Centro.
 *   · Las dos metas explicadas: la de ticket (tres niveles) y la de ventas
 *     (una sola por sede, que NO sube con los niveles).
 *   · El detalle día por día, ahora también contra la meta de ventas.
 *   · Cuánto se reparte por sede y cuánto le toca a cada persona, con las
 *     horas de Planilla, y una hoja final de transferencias para Kelly.
 *   · Gráficos (llegan ya hechos como imagen: este archivo solo los pega).
 *
 * Función de presentación: recibe el reporte ya armado (reporte-bonos.ts) y
 * solo lo dibuja. Cero lógica de negocio aquí. Solo usa caracteres que la
 * fuente estándar del PDF dibuja bien (nada de flechas ni palomitas).
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BRAND, PDF, fmtSoles } from "../report/renderers/design-system";
import type { ReporteBonos, SedeReporte, FilaDia } from "./reporte-bonos";
import type { PagoColaborador } from "./reporte-bonos-tipos";

export type ImagenGrafico = { dataUrl: string; width: number; height: number };
export type GraficosPdf = {
  comparativo: ImagenGrafico | null;
  porSede: Record<number, { ticket: ImagenGrafico | null; ventas: ImagenGrafico | null; bonos: ImagenGrafico | null }>;
};

const A4 = { w: 210, h: 297 };
const M = PDF.margin;
const LIMITE = 275; // última línea útil de una página vertical

const JORNADA: Record<string, string> = {
  tiempo_completo: "Tiempo completo",
  medio_turno: "Medio turno",
  administrador: "Administrador",
};
const ORIGEN_CORTO: Record<string, string> = { reloj: "reloj", registrada: "registradas", horario: "horario" };

const FRANJA: Record<string, string> = { mañana: "Mañana", tarde: "Tarde", completo: "Turno completo" };
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const entero = (n: number) => fmtSoles(n).replace(/\.00$/, "");
const num1 = (n: number) => (Math.round(n * 100) / 100).toString();

type Ctx = {
  doc: jsPDF;
  /** Orientación de cada página, para dibujar el pie al final. */
  paginas: { horizontal: boolean }[];
  y: number;
};

function nuevaPagina(c: Ctx, horizontal = false): void {
  // La primera hoja ya viene con el documento.
  if (c.paginas.length > 0) c.doc.addPage("a4", horizontal ? "landscape" : "portrait");
  c.paginas.push({ horizontal });
}

const ancho = (h: boolean) => (h ? A4.h : A4.w);
const alto = (h: boolean) => (h ? A4.w : A4.h);

/** Cinta de la página: oscura (general) o del color de la sede. */
function cinta(c: Ctx, o: { color: string; titulo: string; subtitulo: string; alta?: boolean; horizontal?: boolean }): number {
  const w = ancho(o.horizontal ?? false);
  const h = o.alta ? 28 : 15;
  c.doc.setFillColor(o.color);
  c.doc.rect(0, 0, w, h, "F");
  c.doc.setTextColor("#FFFFFF");
  if (o.alta) {
    c.doc.setFont("helvetica", "bold").setFontSize(20).text(o.titulo, M, 13);
    c.doc.setFont("helvetica", "normal").setFontSize(9.5).text(o.subtitulo, M, 21);
  } else {
    c.doc.setFont("helvetica", "bold").setFontSize(9.5).text(o.titulo, M, 9.5);
    c.doc.setFont("helvetica", "normal").setFontSize(8.5).text(o.subtitulo, w - M, 9.5, { align: "right" });
  }
  return h + 8;
}

function titulo(c: Ctx, texto: string, color: string = BRAND.primary): void {
  c.y += 3; // aire sobre cada título: nunca pegado a lo anterior
  c.doc.setFont("helvetica", "bold").setFontSize(PDF.h2).setTextColor(color);
  c.doc.text(texto, M, c.y);
  c.y += 6.5;
}

function parrafo(c: Ctx, texto: string, o: { tam?: number; color?: string; italica?: boolean; ancho?: number; x?: number; negrita?: boolean } = {}): void {
  const tam = o.tam ?? PDF.body;
  c.doc.setFont("helvetica", o.negrita ? "bold" : o.italica ? "italic" : "normal").setFontSize(tam).setTextColor(o.color ?? BRAND.ink);
  const lineas = c.doc.splitTextToSize(texto, o.ancho ?? ancho(false) - M * 2);
  c.doc.text(lineas, o.x ?? M, c.y);
  c.y += lineas.length * (tam * 0.42 + 0.9) + 1.5;
}

function ultimaTabla(c: Ctx): number {
  return (c.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function imagen(c: Ctx, img: ImagenGrafico | null, anchoMm = ancho(false) - M * 2): void {
  if (!img) return;
  const h = (anchoMm * img.height) / img.width;
  if (c.y + h > LIMITE) { nuevaPagina(c); c.y = cinta(c, { color: BRAND.primary, titulo: "Bonos e Incentivos", subtitulo: "" }); }
  c.doc.addImage(img.dataUrl, "PNG", M, c.y, anchoMm, h);
  c.y += h + 5;
}

/** Una cajita con etiqueta, valor grande y detalle: los indicadores de cada sede. */
function indicador(c: Ctx, o: { x: number; y: number; w: number; h: number; etiqueta: string; valor: string; detalle?: string; color: string; fondo?: string; colorValor?: string }): void {
  const d = c.doc;
  d.setFillColor(o.fondo ?? "#FFFFFF").setDrawColor(BRAND.grayLight).setLineWidth(0.3);
  d.roundedRect(o.x, o.y, o.w, o.h, 2, 2, "FD");
  d.setFont("helvetica", "bold").setFontSize(6.8).setTextColor(BRAND.gray);
  d.text(o.etiqueta.toUpperCase(), o.x + 3, o.y + 5.5);
  d.setFont("helvetica", "bold").setFontSize(o.valor.length > 12 ? 11.5 : 14).setTextColor(o.colorValor ?? o.color);
  d.text(o.valor, o.x + 3, o.y + 13.5);
  if (o.detalle) {
    d.setFont("helvetica", "normal").setFontSize(7).setTextColor(BRAND.gray);
    d.text(d.splitTextToSize(o.detalle, o.w - 6), o.x + 3, o.y + 18.5);
  }
}

// ─────────────────────────────────────────────────────────────────
// Página 1 · resumen
// ─────────────────────────────────────────────────────────────────

function paginaResumen(c: Ctx, r: ReporteBonos, g: GraficosPdf): void {
  nuevaPagina(c);
  const d = c.doc;
  d.setFillColor(BRAND.primary).rect(0, 0, A4.w, 38, "F");
  d.setTextColor("#FFFFFF").setFont("helvetica", "bold").setFontSize(22).text("Bonos e Incentivos", M, 17);
  d.setFont("helvetica", "normal").setFontSize(11.5).text(`${r.periodoLabel} · Fonavi y Centro`, M, 26);
  d.setFontSize(8.5).text(`Generado el ${r.generadoEn}`, M, 33);
  c.y = 48;

  // Una tarjeta por sede, cada una con SU color.
  const gap = 6;
  const wCard = (A4.w - M * 2 - gap) / 2;
  r.sedes.forEach((s, i) => {
    const x = M + i * (wCard + gap);
    const y0 = c.y;
    d.setFillColor("#FFFFFF").setDrawColor(s.color).setLineWidth(0.5).roundedRect(x, y0, wCard, 62, 2.5, 2.5, "FD");
    d.setFillColor(s.color).roundedRect(x, y0, wCard, 10, 2.5, 2.5, "F").rect(x, y0 + 6, wCard, 4, "F");
    d.setTextColor("#FFFFFF").setFont("helvetica", "bold").setFontSize(12).text(s.sede, x + 4, y0 + 7);

    d.setTextColor(BRAND.gray).setFont("helvetica", "bold").setFontSize(6.8).text("TICKET DEL PROGRAMA", x + 4, y0 + 16);
    d.setTextColor(BRAND.ink).setFontSize(20).text(s.ticket.actual !== null ? fmtSoles(s.ticket.actual) : "Sin datos", x + 4, y0 + 25);
    d.setFont("helvetica", "normal").setFontSize(7.8).setTextColor(BRAND.gray);
    const dif = s.ticket.delta !== null ? ` (${s.ticket.delta >= 0 ? "+" : ""}${fmtSoles(s.ticket.delta)})` : "";
    d.text(`Base ${fmtSoles(s.ticket.base)}${dif}`, x + 4, y0 + 30);

    const nivel = s.ticket.nivel ?? "Sin nivel";
    d.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(s.ticket.nivel ? "#0E7A55" : BRAND.tone.riesgo);
    d.text(`Nivel alcanzado: ${nivel}`, x + 4, y0 + 38);
    d.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(BRAND.gray);
    if (s.ticket.proximo) d.text(`Para ${s.ticket.proximo.nombre} faltan ${fmtSoles(s.ticket.proximo.falta)}`, x + 4, y0 + 43);

    if (s.ventas && s.ventas.meta !== null) {
      const ok = s.ventas.cumple;
      d.setFont("helvetica", "bold").setFontSize(8.2).setTextColor(ok ? "#0E7A55" : BRAND.tone.atencion);
      d.text(`Ventas ${entero(s.ventas.vendido)} de ${entero(s.ventas.meta)}`, x + 4, y0 + 50);
      d.setFont("helvetica", "normal").setFontSize(7.2).setTextColor(BRAND.gray);
      d.text(`${s.ventas.avancePct !== null ? `${s.ventas.avancePct.toFixed(1)}%` : ""} de la meta de ventas${s.ventas.vinculante ? "" : " (práctica)"}`, x + 4, y0 + 54);
    }
    if (!r.esRango && s.pagos) {
      d.setFillColor(s.colorSuave).rect(x + 0.4, y0 + 56.2, wCard - 0.8, 5.4, "F");
      d.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(s.color);
      d.text(`A repartir: ${entero(s.pagos.totalBonos)}`, x + 4, y0 + 60);
    }
  });
  c.y += 70;

  imagen(c, g.comparativo);

  titulo(c, "Lo más importante");
  for (const s of r.sedes) {
    d.setFillColor(s.color).circle(M + 1.6, c.y - 1.2, 1.3, "F");
    d.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(s.color).text(s.sede, M + 5, c.y);
    c.y += 4.6;
    for (const f of s.frases) parrafo(c, f, { x: M + 5, ancho: A4.w - M * 2 - 5, tam: 9 });
    c.y += 1;
  }

  if (!r.esRango && r.totalARepartir !== null) {
    if (c.y > LIMITE - 24) { nuevaPagina(c); c.y = cinta(c, { color: BRAND.primary, titulo: "Bonos e Incentivos", subtitulo: r.periodoLabel }); }
    d.setFillColor("#F3F4F6").setDrawColor(BRAND.grayLight).roundedRect(M, c.y, A4.w - M * 2, 21, 2, 2, "FD");
    d.setFont("helvetica", "bold").setFontSize(7).setTextColor(BRAND.gray).text("PARA GERENCIA DE FINANZAS (KELLY)", M + 4, c.y + 5.5);
    const partes = r.sedes.map((s) => `${s.sede} ${entero(s.pagos?.totalBonos ?? 0)}`).join("  +  ");
    d.setFont("helvetica", "bold").setFontSize(12).setTextColor(BRAND.ink).text(`Total a transferir: ${entero(r.totalARepartir)}`, M + 4, c.y + 12.5);
    d.setFont("helvetica", "normal").setFontSize(8).setTextColor(BRAND.gray).text(`${partes}.  El detalle por persona está en cada sede y en la hoja de transferencias.`, M + 4, c.y + 18);
  }
}

// ─────────────────────────────────────────────────────────────────
// Página 2 · cómo funciona
// ─────────────────────────────────────────────────────────────────

const ROL_LLAVE: Record<string, { texto: string; color: string }> = {
  monto: { texto: "DEFINE EL MONTO", color: "#0E7A55" },
  requisito: { texto: "REQUISITO", color: "#B91C1C" },
  practica: { texto: "SOLO PRÁCTICA", color: "#B45309" },
  "no-aplica": { texto: "AÚN NO APLICA", color: "#6B7280" },
};

function paginaReglas(c: Ctx, r: ReporteBonos): void {
  nuevaPagina(c);
  c.y = cinta(c, { color: BRAND.primary, titulo: "Bonos e Incentivos · Cómo funciona", subtitulo: r.periodoLabel });
  const d = c.doc;

  if (r.llaves.length > 0) {
    titulo(c, "Las llaves del bono");
    parrafo(c, "El ticket define cuánto se paga; las demás llaves son condiciones: si una falla, no hay bono aunque el ticket haya subido.", { tam: 8.6, color: BRAND.gray });
    autoTable(d, {
      startY: c.y,
      margin: { left: M, right: M },
      head: [["Llave", "Cómo funciona", `En ${r.periodoLabel}`]],
      body: r.llaves.map((l) => [l.nombre, l.texto, ROL_LLAVE[l.rol].texto]),
      styles: { fontSize: 8.2, cellPadding: 2.2, valign: "middle" },
      headStyles: { fillColor: BRAND.primary, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 32, fontStyle: "bold" }, 2: { cellWidth: 34, fontStyle: "bold", halign: "center" } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 2) {
          data.cell.styles.textColor = ROL_LLAVE[r.llaves[data.row.index].rol].color;
        }
      },
    });
    c.y = ultimaTabla(c) + 8;
  }

  // La meta de ticket de cada sede, lado a lado.
  titulo(c, "Meta de ticket: tres niveles por sede");
  const sedes = r.sedes;
  const head: string[][] = [[
    "", ...sedes.flatMap((s) => [`${s.sede}: ticket meta`, `${s.sede}: se reparte`]),
  ]];
  const body: string[][] = [[
    "Base (punto de partida)", ...sedes.flatMap((s) => [fmtSoles(s.ticket.base), "-"]),
  ]];
  const nNiv = Math.max(...sedes.map((s) => s.ticket.niveles.length));
  for (let i = 0; i < nNiv; i++) {
    body.push([
      sedes[0].ticket.niveles[i]?.nombre ?? "",
      ...sedes.flatMap((s) => {
        const n = s.ticket.niveles[i];
        return n ? [`${fmtSoles(n.metaTicket)}  (+${fmtSoles(n.delta)})`, entero(n.seReparte)] : ["-", "-"];
      }),
    ]);
  }
  autoTable(d, {
    startY: c.y,
    margin: { left: M, right: M },
    head,
    body,
    styles: { fontSize: 8.3, cellPadding: 2.2, halign: "center" },
    headStyles: { fontSize: 7.6, textColor: "#FFFFFF" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold", cellWidth: 40 } },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index > 0) {
        data.cell.styles.fillColor = sedes[Math.floor((data.column.index - 1) / 2)].color;
      } else if (data.section === "head") {
        data.cell.styles.fillColor = BRAND.primary;
      }
      if (data.section === "body" && data.row.index > 0 && data.column.index > 0) {
        const s = sedes[Math.floor((data.column.index - 1) / 2)];
        const alcanzado = s.ticket.niveles[data.row.index - 1]?.alcanzado;
        if (alcanzado) { data.cell.styles.fillColor = s.colorSuave; data.cell.styles.fontStyle = "bold"; }
      }
    },
  });
  c.y = ultimaTabla(c) + 3;
  parrafo(c, "Ticket del programa = venta presencial (mostrador y mesa) entre las personas atendidas; delivery y consumo del personal no cuentan. Cada nivel exige subir el ticket sobre la base de la sede. \"Se reparte\" = bonos de todo el equipo con las horas de Planilla + premio al mejor vendedor. En color: el nivel alcanzado.", { tam: 7.8, italica: true, color: BRAND.gray });

  // La meta de ventas: la pregunta de Jahnn.
  if (r.sedes.some((s) => s.ventas)) {
    titulo(c, "Meta de ventas: una sola por sede");
    parrafo(c, "La meta de ventas es UNA cifra por mes y por sede. NO cambia cuando se sube de nivel: los niveles solo cambian cuánto se paga por el ticket. La meta es el promedio de lo vendido en los últimos tres meses cerrados (redondeado hacia arriba a los S/ 100, sin porcentaje de crecimiento) y queda fija desde el primer lunes del mes.", { tam: 8.8 });
    autoTable(d, {
      startY: c.y,
      margin: { left: M, right: M },
      head: [["Sede", "Meta del mes", "Sale del promedio de", "Vendido", "Avance", "Estado"]],
      body: r.sedes.map((s) => {
        const v = s.ventas;
        if (!v || v.meta === null) return [s.sede, "sin meta", "-", "-", "-", "-"];
        return [
          s.sede,
          entero(v.meta),
          v.mesesReferencia.map(mesCorto).join(", ") || "-",
          fmtSoles(v.vendido),
          v.avancePct !== null ? `${v.avancePct.toFixed(1)}%` : "-",
          v.cumple ? "Cumplida" : "No se llegó",
        ];
      }),
      styles: { fontSize: 8.3, cellPadding: 2.2 },
      headStyles: { fillColor: BRAND.primary, fontSize: 8 },
      columnStyles: { 0: { fontStyle: "bold" } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 0) data.cell.styles.textColor = sedes[data.row.index].color;
        if (data.section === "body" && data.column.index === 5) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = sedes[data.row.index].ventas?.cumple ? "#0E7A55" : BRAND.tone.atencion;
        }
      },
    });
    c.y = ultimaTabla(c) + 3;
    const vinc = r.sedes.some((s) => s.ventas?.vinculante);
    parrafo(c, vinc
      ? "Este mes la meta de ventas es requisito: sin ella no hay bono aunque el ticket haya subido."
      : "Este mes la meta de ventas es solo de práctica: se mide y se reporta, pero no cambia el bono. Desde octubre es requisito (todo o nada).", { tam: 8.3, italica: true, color: BRAND.gray });
    c.y += 3;
  }

  if (!r.esRango && r.sedes.some((s) => s.pagos)) {
    if (c.y > LIMITE - 54) { nuevaPagina(c); c.y = cinta(c, { color: BRAND.primary, titulo: "Bonos e Incentivos · Cómo funciona", subtitulo: r.periodoLabel }); }
    titulo(c, "Cómo se calcula lo que le toca a cada persona");
    const tarifa = r.sedes.find((s) => s.pagos?.tarifaHora)?.pagos?.tarifaHora;
    const pasos = [
      `1.  Horas del mes: se toman de Planilla. Si el administrador registró las horas del mes de la persona, se usan esas; si no, su horario por 4 semanas. Las faltas y tardanzas restan; el tiempo extra y las horas no marcadas suman.`,
      `2.  Tarifa por hora: el bono de un medio turno en el nivel alcanzado dividido entre 94 horas${tarifa ? ` (ejemplo: S/ ${tarifa.toFixed(4)} la hora en el nivel de este mes)` : ""}.`,
      "3.  Bono de la persona = sus horas del mes x la tarifa por hora. Quien trabajó más horas gana más; quien faltó, menos. Los administradores reciben un monto fijo por nivel.",
      "4.  Premio al mejor vendedor: un monto fijo por nivel, para una sola persona de la sede.",
      "5.  Tope: lo que se reparte nunca debe superar el pozo (40% de la utilidad nueva que dejó el aumento del ticket). Si lo supera, el sistema lo avisa antes de pagar.",
    ];
    for (const p of pasos) parrafo(c, p, { tam: 8.4 });
  }
}

function mesCorto(m: string): string {
  const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${nombres[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
}

// ─────────────────────────────────────────────────────────────────
// Páginas de cada sede
// ─────────────────────────────────────────────────────────────────

function paginaResultadoSede(c: Ctx, r: ReporteBonos, s: SedeReporte, g: GraficosPdf["porSede"][number] | undefined): void {
  nuevaPagina(c);
  c.y = cinta(c, { color: s.color, titulo: `Yayi's ${s.sede}`, subtitulo: `Bonos e Incentivos · ${r.periodoLabel}`, alta: true });
  if (s.ticket.actual === null) {
    parrafo(c, "Sin días registrados en este periodo.");
    return;
  }

  const gap = 3.5;
  const w = (A4.w - M * 2 - gap * 3) / 4;
  const y0 = c.y;
  indicador(c, {
    x: M, y: y0, w, h: 25, color: s.color, etiqueta: "Ticket del programa", valor: fmtSoles(s.ticket.actual),
    detalle: `Base ${fmtSoles(s.ticket.base)}${s.ticket.delta !== null ? ` (${s.ticket.delta >= 0 ? "+" : ""}${fmtSoles(s.ticket.delta)})` : ""}`,
  });
  indicador(c, {
    x: M + (w + gap), y: y0, w, h: 25, color: s.color, etiqueta: "Nivel alcanzado", valor: s.ticket.nivel ?? "Sin nivel",
    colorValor: s.ticket.nivel ? "#0E7A55" : BRAND.tone.riesgo,
    detalle: s.ticket.proximo ? `Para ${s.ticket.proximo.nombre} faltan ${fmtSoles(s.ticket.proximo.falta)}` : "Nivel más alto",
  });
  if (s.ventas && s.ventas.meta !== null) {
    indicador(c, {
      x: M + (w + gap) * 2, y: y0, w, h: 25, color: s.color, etiqueta: s.ventas.vinculante ? "Meta de ventas" : "Meta de ventas (práctica)",
      valor: s.ventas.avancePct !== null ? `${s.ventas.avancePct.toFixed(1)}%` : "-",
      colorValor: s.ventas.cumple ? "#0E7A55" : BRAND.tone.atencion,
      detalle: `${entero(s.ventas.vendido)} de ${entero(s.ventas.meta)}`,
    });
  } else {
    indicador(c, { x: M + (w + gap) * 2, y: y0, w, h: 25, color: s.color, etiqueta: "Venta del período", valor: entero(s.ventaTotal), detalle: `${s.personas.toLocaleString("es-PE")} personas` });
  }
  indicador(c, {
    x: M + (w + gap) * 3, y: y0, w, h: 25, color: s.color, etiqueta: s.trafico.piso !== null ? "Personas por día" : "Personas atendidas",
    valor: s.trafico.piso !== null ? String(s.trafico.personasPorDia ?? "-") : s.personas.toLocaleString("es-PE"),
    colorValor: s.trafico.piso !== null ? (s.trafico.cumple ? "#0E7A55" : BRAND.tone.riesgo) : s.color,
    detalle: s.trafico.piso !== null ? `Mínimo ${s.trafico.piso}${s.trafico.cumple ? "" : " - NO se cumple"}` : `${s.diasConDatos} días con datos`,
  });
  c.y = y0 + 31;

  imagen(c, g?.ticket ?? null);
  imagen(c, g?.ventas ?? null);

  // Los niveles de la sede, con lo que está en juego.
  if (c.y > LIMITE - 38) { nuevaPagina(c); c.y = cinta(c, { color: s.color, titulo: `Yayi's ${s.sede}`, subtitulo: r.periodoLabel }); }
  titulo(c, "Niveles de ticket y lo que se reparte en cada uno", s.color);
  autoTable(c.doc, {
    startY: c.y,
    margin: { left: M, right: M },
    head: [["Nivel", "Ticket meta", "Aumento sobre la base", "Se reparte entre el equipo", "Colchón vs. pozo"]],
    body: s.ticket.niveles.map((n) => [
      `${n.alcanzado ? "> " : ""}${n.nombre}`,
      fmtSoles(n.metaTicket),
      `+${fmtSoles(n.delta)}`,
      entero(n.seReparte),
      n.colchon !== null ? fmtSoles(n.colchon) : "-",
    ]),
    styles: { fontSize: 8.3, cellPadding: 2.1 },
    headStyles: { fillColor: s.color, fontSize: 7.8 },
    didParseCell: (data) => {
      if (data.section === "body" && s.ticket.niveles[data.row.index]?.alcanzado) {
        data.cell.styles.fillColor = s.colorSuave;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  c.y = ultimaTabla(c) + 3;
  parrafo(c, "El colchón es lo que queda del pozo después de pagar los bonos de ese nivel.", { tam: 7.8, italica: true, color: BRAND.gray });
}

function columnasDia(s: SedeReporte): { head: string[]; fila: (d: FilaDia) => string[]; pie: string[] } {
  const conMeta = !!s.ventas?.meta;
  const head = ["Día", "Personas", "Venta del día", "Delivery (ped. / S/)", "Personal (ped. / S/)", "Ticket del día", "Ticket acumulado", "Dif. vs Nivel 1", "Venta acumulada", ...(conMeta ? ["% meta ventas"] : [])];
  const fila = (d: FilaDia) => [
    d.etiqueta,
    String(d.personas),
    fmtSoles(d.venta),
    d.deliveryPedidos > 0 ? `${d.deliveryPedidos} / ${fmtSoles(d.deliveryVenta)}` : "-",
    d.personalPedidos > 0 ? `${d.personalPedidos} / ${fmtSoles(d.personalVenta)}` : "-",
    d.ticketDia !== null ? fmtSoles(d.ticketDia) : "-",
    d.ticketAcum !== null ? fmtSoles(d.ticketAcum) : "-",
    d.difNivel1 !== null ? `${d.difNivel1 >= 0 ? "+" : ""}${fmtSoles(d.difNivel1)}` : "-",
    fmtSoles(d.ventaAcum),
    ...(conMeta ? [d.pctMeta !== null ? pct(d.pctMeta) : "-"] : []),
  ];
  const ult = s.dias[s.dias.length - 1];
  const pie = [
    "TOTAL", String(s.personas), fmtSoles(s.ventaTotal), "", "",
    "", s.ticket.actual !== null ? fmtSoles(s.ticket.actual) : "-",
    ult?.difNivel1 != null ? `${ult.difNivel1 >= 0 ? "+" : ""}${fmtSoles(ult.difNivel1)}` : "-",
    fmtSoles(s.ventaTotal), ...(conMeta ? [ult?.pctMeta != null ? pct(ult.pctMeta) : "-"] : []),
  ];
  return { head, fila, pie };
}

function paginaDetalleDia(c: Ctx, r: ReporteBonos, s: SedeReporte): void {
  if (s.dias.length === 0) return;
  nuevaPagina(c, true);
  c.y = cinta(c, { color: s.color, titulo: `Yayi's ${s.sede} · Detalle día por día`, subtitulo: r.periodoLabel, horizontal: true });
  const { head, fila, pie } = columnasDia(s);
  const conMeta = !!s.ventas?.meta;
  autoTable(c.doc, {
    startY: c.y,
    margin: { left: M, right: M, top: 20, bottom: 14 },
    head: [head],
    body: s.dias.map(fila),
    foot: [pie],
    showFoot: "lastPage",
    styles: { fontSize: 7.2, cellPadding: 0.95, halign: "right" },
    headStyles: { fillColor: s.color, fontSize: 7, halign: "center" },
    footStyles: { fillColor: "#F3F4F6", textColor: BRAND.ink, fontStyle: "bold" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.section === "foot" && data.column.index > 0) data.cell.styles.halign = "right";
      if (data.section !== "body") return;
      const d = s.dias[data.row.index];
      if (data.column.index === 7 && d.difNivel1 !== null) {
        data.cell.styles.textColor = d.difNivel1 >= 0 ? "#0E7A55" : BRAND.tone.riesgo;
      }
      if (conMeta && data.column.index === 9 && d.pctMeta !== null && d.pctMeta >= 1) data.cell.styles.textColor = "#0E7A55";
    },
  });
  c.y = ultimaTabla(c) + 4;
  c.y += 1;
  parrafo(c, "Ticket del día = venta presencial / personas presenciales (sin delivery ni consumo del personal). Ticket acumulado = el del mes hasta ese día: es el que se compara con las metas. Dif. vs Nivel 1: positivo = ya supera la meta del primer nivel.", { tam: 7.6, italica: true, color: BRAND.gray, ancho: A4.h - M * 2 });
}

function textoHoras(l: PagoColaborador): string {
  if (l.jornada === "administrador") return "monto fijo";
  if (l.horasMes === null) return "tabla fija";
  const marca = l.horasReales ? (l.origenHoras ? ORIGEN_CORTO[l.origenHoras] : "Planilla") : "contrato";
  return `${num1(l.horasMes)} h (${marca})`;
}

function paginaPagos(c: Ctx, r: ReporteBonos, s: SedeReporte, g: GraficosPdf["porSede"][number] | undefined): void {
  const pg = s.pagos;
  if (!pg) return;
  nuevaPagina(c);
  c.y = cinta(c, { color: s.color, titulo: `Yayi's ${s.sede} · A repartir`, subtitulo: r.periodoLabel });
  const d = c.doc;

  // Resumen en una franja.
  d.setFillColor(s.colorSuave).setDrawColor(s.color).setLineWidth(0.3).roundedRect(M, c.y, A4.w - M * 2, 24, 2, 2, "FD");
  d.setFont("helvetica", "bold").setFontSize(7).setTextColor(BRAND.gray).text("TOTAL A REPARTIR EN " + s.sede.toUpperCase(), M + 4, c.y + 5.5);
  d.setFont("helvetica", "bold").setFontSize(18).setTextColor(s.color).text(entero(pg.totalBonos), M + 4, c.y + 14.5);
  d.setFont("helvetica", "normal").setFontSize(8).setTextColor(BRAND.ink);
  const nivelTxt = pg.nivel ? `Nivel alcanzado: ${pg.nivel}` : "Sin nivel de ticket: no hay bono";
  d.text(nivelTxt, M + 62, c.y + 8);
  d.text(pg.tarifaHora ? `Tarifa por hora: S/ ${pg.tarifaHora.toFixed(4)}  (bono de medio turno / 94 h)` : "Tarifa por hora: -", M + 62, c.y + 13);
  d.text(`Pozo del mes (techo): ${pg.pozo !== null ? fmtSoles(pg.pozo) : "-"}${pg.pozo !== null ? `   Colchón: ${fmtSoles(Math.round((pg.pozo - pg.totalBonos) * 100) / 100)}` : ""}`, M + 62, c.y + 18);
  d.setFontSize(7.2).setTextColor(BRAND.gray).text(pg.fuente === "acta" ? `Mes cerrado el ${pg.cerradaEn?.slice(0, 10) ?? ""}: cifras del acta.` : "Cálculo de hoy (el mes aún no está cerrado en el acta).", M + 62, c.y + 22);
  c.y += 30;

  if (pg.lines.length === 0) {
    parrafo(c, "No hay colaboradores activos en esta sede.");
  } else {
    autoTable(d, {
      startY: c.y,
      margin: { left: M, right: M },
      head: [["Colaborador", "DNI", "Jornada", "Horas del bono", "Faltas y tard.", "Extra", "Bono", "Premio MV", "Total a transferir"]],
      body: pg.lines.map((l) => [
        l.name,
        l.dni ?? "sin DNI",
        JORNADA[l.jornada] ?? l.jornada,
        textoHoras(l),
        l.jornada === "administrador" || l.horasMenos === 0 ? "-" : `-${num1(l.horasMenos)} h`,
        l.jornada === "administrador" || l.horasMas === 0 ? "-" : `+${num1(l.horasMas)} h`,
        entero(l.bono),
        l.premioMv > 0 ? entero(l.premioMv) : "-",
        entero(l.total),
      ]),
      foot: [["TOTAL", "", "", "", "", "", entero(pg.lines.reduce((t, l) => t + l.bono, 0)), pg.mejorVendedor.premio > 0 ? entero(pg.mejorVendedor.premio) : "-", entero(pg.totalBonos)]],
      styles: { fontSize: 7.7, cellPadding: 1.9 },
      headStyles: { fillColor: s.color, fontSize: 7.2 },
      footStyles: { fillColor: "#F3F4F6", textColor: BRAND.ink, fontStyle: "bold" },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right", fontStyle: "bold" } },
      didParseCell: (data) => {
        if (data.section === "foot" && data.column.index >= 3) data.cell.styles.halign = "right";
      },
    });
    c.y = ultimaTabla(c) + 3;
    parrafo(c, "Horas del bono: «registradas» = las horas del mes que el administrador registró en Planilla; «horario» = el horario de Planilla por 4 semanas; «reloj» = el reloj de Byte; «contrato» = las del contrato, porque Planilla no las tiene. Las faltas y tardanzas restan; el tiempo extra suma. El bono de cada persona se redondea al sol.", { tam: 7.4, italica: true, color: BRAND.gray });
  }

  if (pg.mejorVendedor.usado) {
    parrafo(c, `Premio al mejor vendedor: ${pg.mejorVendedor.usado} (${entero(pg.mejorVendedor.premio)}).`, { tam: 8.6, negrita: true });
  } else if (pg.nivel) {
    parrafo(c, "Premio al mejor vendedor: sin asignar. Elige a la persona antes de exportar para que el total incluya el premio.", { tam: 8.6, color: BRAND.tone.atencion });
  }

  imagen(c, g?.bonos ?? null);

  // Si no hubo nivel, mostrar lo que estaba en juego.
  if (!pg.nivel) {
    if (c.y > LIMITE - 30) { nuevaPagina(c); c.y = cinta(c, { color: s.color, titulo: `Yayi's ${s.sede} · A repartir`, subtitulo: r.periodoLabel }); }
    titulo(c, "Lo que se habría repartido en cada nivel", s.color);
    autoTable(d, {
      startY: c.y,
      margin: { left: M, right: M },
      head: [["Nivel", "Ticket meta", "Faltaba de ticket", "Se habría repartido"]],
      body: s.ticket.niveles.map((n) => [
        n.nombre, fmtSoles(n.metaTicket),
        s.ticket.actual !== null ? fmtSoles(Math.max(0, Math.round((n.metaTicket - s.ticket.actual) * 100) / 100)) : "-",
        entero(n.seReparte),
      ]),
      styles: { fontSize: 8.3, cellPadding: 2.1 },
      headStyles: { fillColor: s.color, fontSize: 7.8 },
    });
    c.y = ultimaTabla(c) + 4;
  }

  // Observaciones del cálculo, tal cual las dejó el sistema.
  const avisos = [...pg.blockers.map((b) => `Pendiente: ${b}`), ...pg.warnings];
  if (avisos.length > 0) {
    if (c.y > LIMITE - 24) { nuevaPagina(c); c.y = cinta(c, { color: s.color, titulo: `Yayi's ${s.sede} · A repartir`, subtitulo: r.periodoLabel }); }
    titulo(c, "Observaciones del cálculo", s.color);
    for (const a of avisos) parrafo(c, `- ${a}`, { tam: 7.8, color: BRAND.tone.atencion, italica: true });
  }
  if (pg.sincronizadoEn) {
    parrafo(c, `Equipo y horas comprobados contra Planilla el ${new Date(pg.sincronizadoEn).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short", hour12: false })}`, { tam: 7.4, color: BRAND.gray });
  }
}

function paginaMejorVendedor(c: Ctx, r: ReporteBonos, s: SedeReporte): void {
  const mv = s.mejorVendedor;
  // Con la explicación y ocho filas mide unos 85 mm: si no cabe, va en hoja propia.
  if (c.y > LIMITE - 86) { nuevaPagina(c); c.y = cinta(c, { color: s.color, titulo: `Yayi's ${s.sede} · Mejor vendedor`, subtitulo: r.periodoLabel }); }
  const d = c.doc;
  const rango = s.mvPeriodEnd ? ` (${s.mvPeriodStart ? `${ddmm(s.mvPeriodStart)}-` : "al "}${ddmm(s.mvPeriodEnd)})` : "";
  titulo(c, `Mejor vendedor${rango}`, s.color);
  parrafo(c, "Gana quien más levanta su ticket sobre lo normal de SU turno (mañana o tarde), no quien tiene el ticket más alto en bruto: así las horas bajas no son una desventaja. Para entrar al ranking hay que atender un mínimo de mesas en el periodo. El premio es un monto fijo según el nivel alcanzado: " + s.ticket.niveles.map((n) => `${n.nombre} ${entero(n.premioMv)}`).join(", ") + ".", { tam: 8.4, color: BRAND.gray });
  if (!mv || mv.ranking.length === 0) {
    parrafo(c, "Sin reporte de trabajadores en este periodo.", { color: BRAND.gray });
    return;
  }
  autoTable(d, {
    startY: c.y,
    margin: { left: M, right: M },
    head: [["#", "Colaborador", "Turno", "Mesas", "Ticket propio", "Levantamiento", "Elegible"]],
    body: mv.ranking.slice(0, 8).map((x, i) => [
      x.elegible ? String(i + 1) : "-",
      x.seller,
      x.porFranja.map((f) => FRANJA[f.franja] ?? f.franja).join(", "),
      String(x.totalClientes),
      x.ticketGlobal !== null ? fmtSoles(x.ticketGlobal) : "-",
      x.liftPromedio !== null ? `${x.liftPromedio >= 0 ? "+" : ""}${fmtSoles(x.liftPromedio)}` : "-",
      x.elegible ? "Sí" : "No",
    ]),
    styles: { fontSize: 7.7, cellPadding: 1.8 },
    headStyles: { fillColor: s.color, fontSize: 7.4 },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === 0 && mv.ranking[0]?.elegible) data.cell.styles.fillColor = "#FFFBEB";
    },
  });
  c.y = ultimaTabla(c) + 3;
  if (s.noElegibles > 0) {
    parrafo(c, `${s.noElegibles} colaborador${s.noElegibles === 1 ? "" : "es"} quedaron fuera del ranking por atender menos de ${s.minMesas} mesas.`, { tam: 7.6, italica: true, color: BRAND.gray });
  }
}

// ─────────────────────────────────────────────────────────────────
// Hoja final · transferencias para Kelly
// ─────────────────────────────────────────────────────────────────

function paginaTransferencias(c: Ctx, r: ReporteBonos): void {
  nuevaPagina(c);
  c.y = cinta(c, { color: BRAND.primary, titulo: "Hoja de transferencias · para Gerencia de Finanzas", subtitulo: r.periodoLabel, alta: true });
  parrafo(c, "Una fila por persona con lo que se le transfiere. Marca cada transferencia cuando la hagas y anota el número de operación.", { tam: 8.8, color: BRAND.gray });
  c.y += 1;

  for (const s of r.sedes) {
    const pg = s.pagos;
    if (!pg) continue;
    const filas = pg.lines.filter((l) => l.total > 0);
    if (c.y > LIMITE - 36) { nuevaPagina(c); c.y = cinta(c, { color: BRAND.primary, titulo: "Hoja de transferencias", subtitulo: r.periodoLabel }); }
    c.doc.setFillColor(s.color).rect(M, c.y, A4.w - M * 2, 7, "F");
    c.doc.setTextColor("#FFFFFF").setFont("helvetica", "bold").setFontSize(10).text(`${s.sede}   ·   total a transferir ${entero(pg.totalBonos)}`, M + 3, c.y + 5);
    c.y += 8;
    if (filas.length === 0) {
      c.y += 4;
      parrafo(c, pg.nivel ? "Sin transferencias." : "Sin bono este mes: no hay transferencias.", { tam: 8.8, color: BRAND.gray });
      c.y += 4;
      continue;
    }
    autoTable(c.doc, {
      startY: c.y,
      margin: { left: M, right: M },
      head: [["Colaborador", "DNI", "Monto a transferir", "Hecha", "N.º de operación"]],
      body: [...filas.map((l) => [l.name, l.dni ?? "sin DNI", entero(l.total), "[   ]", ""]), ["TOTAL " + s.sede.toUpperCase(), "", entero(pg.totalBonos), "", ""]],
      styles: { fontSize: 8.6, cellPadding: 2.3, minCellHeight: 7.5 },
      headStyles: { fillColor: "#374151", fontSize: 7.8 },
      columnStyles: { 2: { halign: "right", fontStyle: "bold" }, 3: { halign: "center", cellWidth: 18 }, 4: { cellWidth: 42 } },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === filas.length) {
          data.cell.styles.fillColor = s.colorSuave;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    c.y = ultimaTabla(c) + 7;
  }

  if (r.totalARepartir !== null) {
    if (c.y > LIMITE - 14) { nuevaPagina(c); c.y = cinta(c, { color: BRAND.primary, titulo: "Hoja de transferencias", subtitulo: r.periodoLabel }); }
    c.doc.setFillColor(BRAND.primary).roundedRect(M, c.y, A4.w - M * 2, 12, 2, 2, "F");
    c.doc.setTextColor("#FFFFFF").setFont("helvetica", "bold").setFontSize(12).text(`TOTAL GENERAL A TRANSFERIR: ${entero(r.totalARepartir)}`, M + 5, c.y + 8);
  }
}

// ─────────────────────────────────────────────────────────────────
// Armado
// ─────────────────────────────────────────────────────────────────

export function renderBonosReportPdf(r: ReporteBonos, g: GraficosPdf): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c: Ctx = { doc, paginas: [], y: 0 };

  paginaResumen(c, r, g);
  paginaReglas(c, r);
  for (const s of r.sedes) {
    paginaResultadoSede(c, r, s, g.porSede[s.businessId]);
    paginaDetalleDia(c, r, s);
    paginaPagos(c, r, s, g.porSede[s.businessId]);
    paginaMejorVendedor(c, r, s);
  }
  if (!r.esRango && r.sedes.some((s) => s.pagos)) paginaTransferencias(c, r);

  // Pie de página con la numeración: recién ahora se sabe cuántas hojas son.
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const info = doc.getPageInfo(i);
    const horizontal = info.pageContext.mediaBox.topRightX > info.pageContext.mediaBox.topRightY;
    const w = ancho(horizontal);
    const h = alto(horizontal);
    doc.setDrawColor(BRAND.grayLight).setLineWidth(0.2).line(M, h - 12, w - M, h - 12);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(BRAND.gray);
    doc.text("Yayi's · mismos números que ve cada admin en su panel; el pago usa las horas de Planilla.", M, h - 6.5);
    doc.text(`pág. ${i} / ${total}`, w - M, h - 6.5, { align: "right" });
  }

  const etiqueta = r.periodoLabel.replace(/[^\w-]+/g, "-");
  return { blob: doc.output("blob"), filename: `Bonos-Incentivos-${etiqueta}.pdf` };
}
