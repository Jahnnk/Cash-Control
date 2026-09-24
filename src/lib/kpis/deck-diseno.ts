/**
 * Diseño del deck de la Reunión Semanal (rediseño del 24-sep-2026).
 *
 * Decisiones de Jahnn: barra verde oscuro con el logo crema en TODAS las
 * diapositivas (como sus referencias), fondo crema de la marca con tarjetas
 * blancas, tipografía Lato y los colores de la guía yayis-pptx-style
 * (verde medio 098B5F, verde oscuro 004C40, rojo C0392B, ámbar D9A441).
 *
 * Todo lo que dibuja más de una diapositiva vive acá: la cabecera, las
 * tarjetas, las pastillas de semáforo y los recuadros de "Lectura".
 */

import type PptxGenJS from "pptxgenjs";
import { ICONOS, LOGO, type ColorIcono, type IconoDeck } from "./deck-assets";
import type { Hallazgo, LecturaSede, Tono } from "./lectura-semana";

export const C = {
  crema: "F9F6EB",
  blanco: "FFFFFF",
  oscuro: "004C40",
  verde: "098B5F",
  tinta: "1A1A1A",
  gris: "5C5C5C",
  grisClaro: "8C8C8C",
  borde: "E0DDD1",
  rojo: "C0392B",
  ambar: "D9A441",
  /** Ámbar para TEXTO sobre fondo claro (el D9A441 no se lee en letras finas). */
  ambarTexto: "A7771B",
} as const;

/** Fondos suaves de cada estado (cabeceras de tarjeta y pastillas). */
export const SUAVE: Record<Tono, string> = { verde: "E4F1EA", ambar: "FBF0DA", rojo: "FAE6E3", gris: "EFEDE6" };
export const FUERTE: Record<Tono, string> = { verde: C.verde, ambar: C.ambar, rojo: C.rojo, gris: "9A9A94" };
export const TEXTO: Record<Tono, string> = { verde: C.verde, ambar: C.ambarTexto, rojo: C.rojo, gris: C.gris };
const ICONO_COLOR: Record<Tono, ColorIcono> = { verde: "verde", ambar: "ambar", rojo: "rojo", gris: "gris" };

export const FONT = "Lato";
export const W = 10;
export const H = 5.625;
export const MX = 0.4;
export const ANCHO = W - MX * 2;

const LOGO_RATIO = 2.954;

/** Sombra suave de tarjeta (factory: pptxgenjs muta el objeto si se reutiliza). */
export const sombra = (): PptxGenJS.ShadowProps => ({ type: "outer", color: "000000", blur: 5, offset: 1.5, angle: 90, opacity: 0.07 });

export function texto(s: PptxGenJS.Slide, t: string | PptxGenJS.TextProps[], o: PptxGenJS.TextPropsOptions) {
  s.addText(t, { fontFace: FONT, margin: 0, valign: "middle", ...o });
}

export function icono(s: PptxGenJS.Slide, nombre: IconoDeck, color: ColorIcono, x: number, y: number, tam: number) {
  s.addImage({ data: ICONOS[nombre][color], x, y, w: tam, h: tam });
}

export const iconoTono = (t: Tono): ColorIcono => ICONO_COLOR[t];

/**
 * Diapositiva de contenido: barra verde con el logo, el período y una
 * etiqueta a la derecha; título grande y subtítulo.
 */
export function diapositiva(
  pptx: PptxGenJS,
  o: { titulo: string; subtitulo?: string; periodo: string; derecha?: string },
): PptxGenJS.Slide {
  const s = pptx.addSlide();
  s.background = { color: C.crema };
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.46, fill: { color: C.oscuro }, line: { color: C.oscuro } });
  const lw = 0.92;
  s.addImage({ data: LOGO.crema, x: MX, y: 0.23 - lw / LOGO_RATIO / 2, w: lw, h: lw / LOGO_RATIO });
  s.addShape("line", { x: MX + lw + 0.14, y: 0.12, w: 0, h: 0.22, line: { color: C.crema, width: 0.75, transparency: 40 } });
  texto(s, `Reunión Semanal · ${o.periodo}`, { x: MX + lw + 0.28, y: 0, w: 6, h: 0.46, fontSize: 11, color: C.crema });
  if (o.derecha) texto(s, o.derecha, { x: W - MX - 3.2, y: 0, w: 3.2, h: 0.46, fontSize: 11, color: C.crema, align: "right" });
  texto(s, o.titulo, { x: MX, y: 0.56, w: ANCHO, h: 0.5, fontSize: 26, bold: true, color: C.oscuro, fit: "shrink" });
  if (o.subtitulo) texto(s, o.subtitulo, { x: MX, y: 1.04, w: ANCHO, h: 0.26, fontSize: 11.5, color: C.gris });
  return s;
}

/** Tarjeta blanca con borde suave y sombra. `cabecera` = alto de la franja de color de arriba. */
export function tarjeta(
  s: PptxGenJS.Slide, x: number, y: number, w: number, h: number,
  o: { fondo?: string; cabecera?: { alto: number; color: string } } = {},
) {
  s.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.08, fill: { color: o.fondo ?? C.blanco }, line: { color: C.borde, width: 0.75 }, shadow: sombra(),
  });
  if (o.cabecera) {
    // Franja superior: redondeada arriba y recta abajo (rectángulo encima de la parte baja).
    s.addShape("roundRect", { x, y, w, h: o.cabecera.alto, rectRadius: 0.08, fill: { color: o.cabecera.color }, line: { color: o.cabecera.color } });
    s.addShape("rect", { x, y: y + o.cabecera.alto - 0.1, w, h: 0.1, fill: { color: o.cabecera.color }, line: { color: o.cabecera.color } });
    s.addShape("line", { x, y: y + o.cabecera.alto, w, h: 0, line: { color: C.borde, width: 0.75 } });
  }
}

/** Pastilla de semáforo: fondo suave, texto fuerte y flecha opcional. */
export function pastilla(
  s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, t: string, tono: Tono,
  o: { flecha?: "arriba" | "abajo" | null; tam?: number; check?: boolean } = {},
) {
  s.addShape("roundRect", { x, y, w, h, rectRadius: 0.06, fill: { color: SUAVE[tono] }, line: { color: SUAVE[tono] } });
  const partes: PptxGenJS.TextProps[] = [];
  if (o.check) partes.push({ text: "✓ ", options: { bold: true, color: TEXTO[tono] } });
  partes.push({ text: t, options: { bold: true, color: TEXTO[tono] } });
  if (o.flecha) partes.push({ text: o.flecha === "arriba" ? "  ▲" : "  ▼", options: { color: FUERTE[tono], fontSize: (o.tam ?? 12) - 3 } });
  texto(s, partes, { x, y, w, h, fontSize: o.tam ?? 12, align: "center" });
}

/** Círculo lleno con un número o un signo, para hallazgos numerados. */
export function circulo(s: PptxGenJS.Slide, x: number, y: number, d: number, t: string, tono: Tono) {
  s.addShape("ellipse", { x, y, w: d, h: d, fill: { color: FUERTE[tono] }, line: { color: FUERTE[tono] } });
  texto(s, t, { x, y, w: d, h: d, fontSize: d * 26, bold: true, color: C.blanco, align: "center" });
}

/** Encabezado "Lectura de la semana" con su icono. */
export function cabeceraLectura(s: PptxGenJS.Slide, x: number, y: number, w: number, sub = "Principales hallazgos para la toma de decisiones.") {
  s.addShape("roundRect", { x, y, w: 0.38, h: 0.38, rectRadius: 0.06, fill: { color: C.oscuro }, line: { color: C.oscuro } });
  icono(s, "lectura", "blanco", x + 0.07, y + 0.07, 0.24);
  texto(s, "Lectura de la semana", { x: x + 0.5, y: y - 0.02, w: w - 0.5, h: 0.24, fontSize: 13, bold: true, color: C.oscuro });
  texto(s, sub, { x: x + 0.5, y: y + 0.21, w: w - 0.5, h: 0.2, fontSize: 9, color: C.gris });
}

/**
 * Recuadro de lectura por sede (diapositivas 2 y 3): columnas con un
 * círculo de estado, el nombre, viñetas y (opcional) la acción resaltada.
 */
export function lecturaPorSede(
  s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, cols: LecturaSede[],
  o: { signo?: (l: LecturaSede) => "alerta" | "flechaArriba" | "flechaAbajo"; conAccion?: boolean } = {},
) {
  tarjeta(s, x, y, w, h);
  cabeceraLectura(s, x + 0.22, y + 0.14, 4, o.conAccion ? "Principales hallazgos y puntos de atención." : undefined);
  const top = y + 0.58;
  const colW = (w - 0.44) / cols.length;
  // La acción va en una franja fija al pie; las viñetas usan lo que queda.
  const ah = 0.34;
  const ay = y + h - 0.1 - ah;
  cols.forEach((c, i) => {
    const cx = x + 0.22 + i * colW;
    if (i > 0) s.addShape("line", { x: cx - 0.08, y: top + 0.05, w: 0, h: y + h - 0.14 - (top + 0.05), line: { color: C.borde, width: 0.75 } });
    const sg = o.signo?.(c) ?? "alerta";
    s.addShape("ellipse", { x: cx, y: top, w: 0.34, h: 0.34, fill: { color: FUERTE[c.tono] }, line: { color: FUERTE[c.tono] } });
    if (sg === "alerta") texto(s, "!", { x: cx, y: top, w: 0.34, h: 0.34, fontSize: 15, bold: true, color: C.blanco, align: "center" });
    else icono(s, sg, "blanco", cx + 0.06, top + 0.06, 0.22);
    texto(s, c.titulo, { x: cx + 0.44, y: top - 0.02, w: colW - 0.6, h: 0.26, fontSize: 12.5, bold: true, color: C.oscuro });
    const conCaja = o.conAccion && c.accion;
    texto(s, c.puntos.map((p) => ({ text: p, options: { bullet: { indent: 10 }, breakLine: true } })), {
      x: cx + 0.44, y: top + 0.26, w: colW - 0.6, h: (conCaja ? ay - 0.03 : y + h - 0.1) - (top + 0.26),
      fontSize: 9, color: C.tinta, valign: "top", paraSpaceAfter: 1,
    });
    if (conCaja) {
      s.addShape("roundRect", { x: cx + 0.44, y: ay, w: colW - 0.62, h: ah, rectRadius: 0.05, fill: { color: SUAVE[c.tono] }, line: { color: SUAVE[c.tono] } });
      texto(s, c.accion!, { x: cx + 0.54, y: ay, w: colW - 0.82, h: ah, fontSize: 8.5, color: TEXTO[c.tono] });
    }
  });
}

/**
 * Líneas que ocupará un texto (estimado): PowerPoint no avisa si un título
 * salta a dos líneas, así que el texto de abajo se corre según este cálculo
 * para que nunca se pisen. Lato promedia ~0.5 em por carácter (0.55 en negrita).
 */
export function lineasEstimadas(t: string, fontSize: number, ancho: number, negrita = false): number {
  const porLinea = Math.max(1, Math.floor(ancho / ((fontSize / 72) * (negrita ? 0.55 : 0.5))));
  return Math.max(1, Math.ceil(t.length / porLinea));
}

/** Hallazgos numerados en columna (detalle de Fonavi y de Atelier). */
export function hallazgosEnColumna(s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, hs: Hallazgo[]) {
  tarjeta(s, x, y, w, h, { fondo: "F4F2EA" });
  cabeceraLectura(s, x + 0.2, y + 0.16, w - 0.3, "");
  const paso = (h - 0.68) / Math.max(3, hs.length);
  hs.forEach((hz, i) => {
    const hy = y + 0.64 + i * paso;
    circulo(s, x + 0.18, hy, 0.3, String(i + 1), hz.tono);
    const th = 0.17 * lineasEstimadas(hz.titulo, 10, w - 0.7, true);
    texto(s, hz.titulo, { x: x + 0.58, y: hy - 0.02, w: w - 0.7, h: th + 0.05, fontSize: 10, bold: true, color: TEXTO[hz.tono] === C.gris ? C.oscuro : TEXTO[hz.tono], valign: "top" });
    texto(s, hz.texto, { x: x + 0.58, y: hy + th + 0.03, w: w - 0.7, h: paso - th - 0.07, fontSize: 8.5, color: C.gris, valign: "top" });
  });
}

/** Hallazgos en fila (detalle de Centro, incentivos y equilibrio). */
export function hallazgosEnFila(
  s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, hs: Hallazgo[],
  o: { numerados?: boolean; anchoCabecera?: number } = {},
) {
  tarjeta(s, x, y, w, h);
  const cab = o.anchoCabecera ?? 0;
  if (cab > 0) {
    // Cabecera angosta a la izquierda: ícono y título en dos líneas, sin bajada.
    s.addShape("roundRect", { x: x + 0.18, y: y + 0.14, w: 0.38, h: 0.38, rectRadius: 0.06, fill: { color: C.oscuro }, line: { color: C.oscuro } });
    icono(s, "lectura", "blanco", x + 0.25, y + 0.21, 0.24);
    texto(s, "Lectura de la semana", { x: x + 0.66, y: y + 0.1, w: cab - 0.7, h: 0.46, fontSize: 11.5, bold: true, color: C.oscuro, valign: "top" });
  } else cabeceraLectura(s, x + 0.2, y + 0.14, 5);
  const x0 = x + (cab > 0 ? cab + 0.15 : 0.2);
  const y0 = cab > 0 ? y + 0.12 : y + 0.64;
  const colW = (x + w - 0.15 - x0) / Math.max(1, hs.length);
  hs.forEach((hz, i) => {
    const cx = x0 + i * colW;
    if (i > 0 || cab > 0) s.addShape("line", { x: cx - 0.08, y: y0 + 0.02, w: 0, h: y + h - 0.16 - y0, line: { color: C.borde, width: 0.75 } });
    if (o.numerados) circulo(s, cx + 0.04, y0, 0.34, String(i + 1), hz.tono);
    else {
      s.addShape("ellipse", { x: cx + 0.04, y: y0, w: 0.34, h: 0.34, fill: { color: FUERTE[hz.tono] }, line: { color: FUERTE[hz.tono] } });
      texto(s, hz.tono === "verde" ? "✓" : "!", { x: cx + 0.04, y: y0, w: 0.34, h: 0.34, fontSize: 14, bold: true, color: C.blanco, align: "center" });
    }
    const th = 0.17 * lineasEstimadas(hz.titulo, 10, colW - 0.56, true);
    texto(s, hz.titulo, { x: cx + 0.46, y: y0 - 0.02, w: colW - 0.56, h: th + 0.05, fontSize: 10, bold: true, color: C.oscuro, valign: "top" });
    texto(s, hz.texto, { x: cx + 0.46, y: y0 + th + 0.04, w: colW - 0.56, h: y + h - 0.08 - (y0 + th + 0.04), fontSize: 8, color: C.gris, valign: "top" });
  });
}

/** "Del 13 al 19 de Setiembre 2026" (mes con mayúscula, como en las referencias). */
export function periodoLargo(ws: string, we: string): string {
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
  const [y1, m1, d1] = ws.split("-").map(Number);
  const [y2, m2, d2] = we.split("-").map(Number);
  if (m1 === m2 && y1 === y2) return `Del ${d1} al ${d2} de ${MESES[m2 - 1]} ${y2}`;
  return `Del ${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]} ${y2}`;
}

/** "13–19 set" */
export function rangoCorto(ws: string, we: string): string {
  const M = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  const [, m1, d1] = ws.split("-").map(Number);
  const [, m2, d2] = we.split("-").map(Number);
  return m1 === m2 ? `${d1}–${d2} ${M[m2 - 1]}` : `${d1} ${M[m1 - 1]}–${d2} ${M[m2 - 1]}`;
}

export const solesDeck = (n: number | null) =>
  n === null ? "—" : `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const solesDeck0 = (n: number | null) => (n === null ? "—" : `S/ ${Math.round(n).toLocaleString("es-PE")}`);
