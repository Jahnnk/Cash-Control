/**
 * Diseño del deck de la Reunión Semanal (rediseño del 24-sep-2026).
 *
 * Decisiones de Jahnn: barra verde oscuro con el logo crema en TODAS las
 * diapositivas (como sus referencias), fondo crema de la marca con tarjetas
 * blancas y los colores de la guía yayis-pptx-style (verde medio 098B5F,
 * verde oscuro 004C40, rojo C0392B, ámbar D9A441).
 *
 * Tipografía: Arial, no Lato. Lato no viene instalada en las computadoras
 * (tampoco en la de Jahnn): PowerPoint la reemplazaba por una letra con
 * serifa más ancha y los textos se salían de sus recuadros. Arial está en
 * toda Mac y todo Windows, así que lo que entra aquí entra en cualquier lado.
 *
 * Escala fija (pt): título 20 · cifra principal 15–16 · cifra de fila 13 ·
 * encabezado de tarjeta 10–11 · texto 8–9 · notas 6.5–7.5. Nada de "encoger
 * para que entre": los altos se calculan con lineasEstimadas.
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

export const FONT = "Arial";
export const W = 10;
export const H = 5.625;
export const MX = 0.4;
export const ANCHO = W - MX * 2;
/** Dónde empieza el contenido, bajo el título y el subtítulo. */
export const Y0 = 1.3;
/** Último punto útil de la diapositiva (margen inferior). */
export const YMAX = 5.5;

const LOGO_RATIO = 2.954;

/** Sombra suave de tarjeta (factory: pptxgenjs muta el objeto si se reutiliza). */
export const sombra = (): PptxGenJS.ShadowProps => ({ type: "outer", color: "000000", blur: 4, offset: 1, angle: 90, opacity: 0.06 });

export function texto(s: PptxGenJS.Slide, t: string | PptxGenJS.TextProps[], o: PptxGenJS.TextPropsOptions) {
  s.addText(t, { fontFace: FONT, margin: 0, valign: "middle", ...o });
}

export function icono(s: PptxGenJS.Slide, nombre: IconoDeck, color: ColorIcono, x: number, y: number, tam: number) {
  s.addImage({ data: ICONOS[nombre][color], x, y, w: tam, h: tam });
}

export const iconoTono = (t: Tono): ColorIcono => ICONO_COLOR[t];

/**
 * Líneas que ocupará un texto en Arial (estimado por palabras, hacia
 * arriba). PowerPoint no avisa si un texto salta de línea, así que lo que va
 * debajo se corre según este cálculo para que nada se pise.
 */
export function lineasEstimadas(t: string, fontSize: number, ancho: number, negrita = false): number {
  const porLinea = Math.max(1, Math.floor(ancho / ((fontSize / 72) * (negrita ? 0.57 : 0.52))));
  let lineas = 0;
  for (const parrafo of t.split("\n")) {
    let actual = 0;
    let n = 1;
    for (const palabra of parrafo.split(" ")) {
      const largo = palabra.length + (actual > 0 ? 1 : 0);
      if (actual + largo > porLinea && actual > 0) { n++; actual = palabra.length; } else actual += largo;
    }
    lineas += n;
  }
  return Math.max(1, lineas);
}

/** Alto de una línea de texto (pulgadas) para un tamaño en pt. */
export const altoLinea = (fontSize: number) => (fontSize / 72) * 1.22;

/**
 * Diapositiva de contenido: barra verde con el logo, el período y una
 * etiqueta a la derecha; título y subtítulo.
 */
export function diapositiva(
  pptx: PptxGenJS,
  o: { titulo: string; subtitulo?: string; periodo: string; derecha?: string },
): PptxGenJS.Slide {
  const s = pptx.addSlide();
  s.background = { color: C.crema };
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.42, fill: { color: C.oscuro }, line: { color: C.oscuro, type: "none" } });
  const lw = 0.82;
  s.addImage({ data: LOGO.crema, x: MX, y: 0.21 - lw / LOGO_RATIO / 2, w: lw, h: lw / LOGO_RATIO });
  s.addShape("line", { x: MX + lw + 0.14, y: 0.12, w: 0, h: 0.18, line: { color: C.crema, width: 0.75, transparency: 40 } });
  texto(s, `Reunión Semanal · ${o.periodo}`, { x: MX + lw + 0.28, y: 0, w: 5.2, h: 0.42, fontSize: 9.5, color: C.crema });
  if (o.derecha) texto(s, o.derecha, { x: W - MX - 3, y: 0, w: 3, h: 0.42, fontSize: 9.5, color: C.crema, align: "right" });
  texto(s, o.titulo, { x: MX, y: 0.54, w: ANCHO, h: 0.38, fontSize: 20, bold: true, color: C.oscuro });
  if (o.subtitulo) texto(s, o.subtitulo, { x: MX, y: 0.93, w: ANCHO, h: 0.22, fontSize: 9.5, color: C.gris });
  return s;
}

/** Recuadro de fecha arriba a la derecha (a la altura del título). */
export function cajaFecha(s: PptxGenJS.Slide, linea1: string, linea2: string) {
  const w = 2.2, x = W - MX - w, y = 0.54;
  tarjeta(s, x, y, w, 0.5);
  icono(s, "calendario", "oscuro", x + 0.13, y + 0.12, 0.26);
  texto(s, linea1, { x: x + 0.5, y: y + 0.07, w: w - 0.58, h: 0.2, fontSize: 9, bold: true, color: C.tinta });
  texto(s, linea2, { x: x + 0.5, y: y + 0.27, w: w - 0.58, h: 0.16, fontSize: 7.5, color: C.gris });
}

/** Tarjeta blanca con borde suave y sombra. `cabecera` = alto de la franja de color de arriba. */
export function tarjeta(
  s: PptxGenJS.Slide, x: number, y: number, w: number, h: number,
  o: { fondo?: string; cabecera?: { alto: number; color: string } } = {},
) {
  s.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.06, fill: { color: o.fondo ?? C.blanco }, line: { color: C.borde, width: 0.75 }, shadow: sombra(),
  });
  if (o.cabecera) {
    // Franja superior DENTRO del borde: redondeada arriba y recta abajo.
    const i = 0.012;
    s.addShape("roundRect", { x: x + i, y: y + i, w: w - 2 * i, h: o.cabecera.alto - i, rectRadius: 0.055, fill: { color: o.cabecera.color }, line: { color: o.cabecera.color, type: "none" } });
    s.addShape("rect", { x: x + i, y: y + o.cabecera.alto - 0.08, w: w - 2 * i, h: 0.08, fill: { color: o.cabecera.color }, line: { color: o.cabecera.color, type: "none" } });
  }
}

/** Pastilla de semáforo: fondo suave, texto fuerte y flecha opcional. */
export function pastilla(
  s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, t: string, tono: Tono,
  o: { flecha?: "arriba" | "abajo" | null; tam?: number; check?: boolean } = {},
) {
  s.addShape("roundRect", { x, y, w, h, rectRadius: 0.05, fill: { color: SUAVE[tono] }, line: { color: SUAVE[tono], type: "none" } });
  const tam = o.tam ?? 9;
  const partes: PptxGenJS.TextProps[] = [];
  if (o.check) partes.push({ text: "✓ ", options: { bold: true, color: TEXTO[tono] } });
  partes.push({ text: t, options: { bold: true, color: TEXTO[tono] } });
  if (o.flecha) partes.push({ text: o.flecha === "arriba" ? " ▲" : " ▼", options: { color: FUERTE[tono], fontSize: tam - 3 } });
  texto(s, partes, { x, y, w, h, fontSize: tam, align: "center" });
}

/** Círculo lleno con un número o un signo, para hallazgos numerados. */
export function circulo(s: PptxGenJS.Slide, x: number, y: number, d: number, t: string, tono: Tono) {
  s.addShape("ellipse", { x, y, w: d, h: d, fill: { color: FUERTE[tono] }, line: { color: FUERTE[tono], type: "none" } });
  texto(s, t, { x, y, w: d, h: d, fontSize: Math.round(d * 36), bold: true, color: C.blanco, align: "center" });
}

/** Encabezado "Lectura de la semana" con su icono (ocupa ~0.36" de alto). */
export function cabeceraLectura(s: PptxGenJS.Slide, x: number, y: number, w: number, sub?: string) {
  s.addShape("roundRect", { x, y, w: 0.32, h: 0.32, rectRadius: 0.05, fill: { color: C.oscuro }, line: { color: C.oscuro, type: "none" } });
  icono(s, "lectura", "blanco", x + 0.06, y + 0.06, 0.2);
  texto(s, "Lectura de la semana", { x: x + 0.42, y: sub ? y - 0.01 : y, w: w - 0.42, h: sub ? 0.2 : 0.32, fontSize: 11, bold: true, color: C.oscuro });
  if (sub) texto(s, sub, { x: x + 0.42, y: y + 0.19, w: w - 0.42, h: 0.15, fontSize: 7.5, color: C.gris });
}

/** Viñetas como líneas de texto con "•" (se ven igual en cualquier programa). */
function vinetas(puntos: string[]): PptxGenJS.TextProps[] {
  return puntos.map((p, i) => ({ text: `•  ${p}`, options: { breakLine: i < puntos.length - 1 } }));
}

/**
 * Recuadro de lectura por sede (diapositivas 2 y 3): columnas con un
 * círculo de estado, el nombre, viñetas y la acción resaltada al pie.
 */
export function lecturaPorSede(
  s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, cols: LecturaSede[],
  o: { signo?: (l: LecturaSede) => "alerta" | "flechaArriba" | "flechaAbajo"; sub?: string } = {},
) {
  tarjeta(s, x, y, w, h);
  cabeceraLectura(s, x + 0.18, y + 0.12, 4, o.sub);
  const top = y + 0.58;
  const colW = (w - 0.36) / cols.length;
  cols.forEach((c, i) => {
    const cx = x + 0.18 + i * colW;
    const tw = colW - 0.5;
    if (i > 0) s.addShape("line", { x: cx - 0.1, y: top, w: 0, h: y + h - 0.12 - top, line: { color: C.borde, width: 0.75 } });
    const sg = o.signo?.(c) ?? "alerta";
    s.addShape("ellipse", { x: cx, y: top, w: 0.26, h: 0.26, fill: { color: FUERTE[c.tono] }, line: { color: FUERTE[c.tono], type: "none" } });
    if (sg === "alerta") texto(s, "!", { x: cx, y: top, w: 0.26, h: 0.26, fontSize: 11, bold: true, color: C.blanco, align: "center" });
    else icono(s, sg, "blanco", cx + 0.05, top + 0.05, 0.16);
    texto(s, c.titulo, { x: cx + 0.36, y: top, w: tw, h: 0.26, fontSize: 10.5, bold: true, color: C.oscuro });
    // La acción va en una franja al pie, con alto según su texto.
    const accionH = c.accion ? altoLinea(8) * lineasEstimadas(c.accion, 8, tw - 0.16) + 0.1 : 0;
    const ay = y + h - 0.12 - accionH;
    const py = top + 0.33;
    texto(s, vinetas(c.puntos), { x: cx + 0.36, y: py, w: tw, h: Math.max(0.2, ay - 0.05 - py), fontSize: 8.5, color: C.tinta, valign: "top" });
    if (c.accion) {
      s.addShape("roundRect", { x: cx + 0.36, y: ay, w: tw, h: accionH, rectRadius: 0.04, fill: { color: SUAVE[c.tono] }, line: { color: SUAVE[c.tono], type: "none" } });
      texto(s, c.accion, { x: cx + 0.44, y: ay, w: tw - 0.16, h: accionH, fontSize: 8, color: TEXTO[c.tono] });
    }
  });
}

/** Hallazgos numerados en columna (detalle de Fonavi y de Atelier). */
export function hallazgosEnColumna(s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, hs: Hallazgo[]) {
  tarjeta(s, x, y, w, h, { fondo: "F4F2EA" });
  cabeceraLectura(s, x + 0.16, y + 0.14, w - 0.3);
  const tw = w - 0.64;
  const y0 = y + 0.62;
  const paso = (y + h - 0.1 - y0) / Math.max(3, hs.length);
  hs.forEach((hz, i) => {
    const y1 = y0 + i * paso;
    circulo(s, x + 0.16, y1, 0.26, String(i + 1), hz.tono);
    const th = altoLinea(9.5) * lineasEstimadas(hz.titulo, 9.5, tw, true);
    texto(s, hz.titulo, { x: x + 0.52, y: y1 + 0.02, w: tw, h: th, fontSize: 9.5, bold: true, color: TEXTO[hz.tono] === C.gris ? C.oscuro : TEXTO[hz.tono], valign: "top" });
    texto(s, hz.texto, { x: x + 0.52, y: y1 + th + 0.05, w: tw, h: Math.max(0.15, paso - th - 0.12), fontSize: 8, color: C.gris, valign: "top" });
  });
}

/**
 * Hallazgos en fila (detalle de Centro e incentivos): la cabecera angosta a
 * la izquierda y un hallazgo por columna.
 */
export function hallazgosEnFila(
  s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, hs: Hallazgo[],
  o: { numerados?: boolean; anchoCabecera?: number } = {},
) {
  tarjeta(s, x, y, w, h);
  const cab = o.anchoCabecera ?? 1.55;
  s.addShape("roundRect", { x: x + 0.16, y: y + 0.13, w: 0.32, h: 0.32, rectRadius: 0.05, fill: { color: C.oscuro }, line: { color: C.oscuro, type: "none" } });
  icono(s, "lectura", "blanco", x + 0.22, y + 0.19, 0.2);
  texto(s, "Lectura de\nla semana", { x: x + 0.56, y: y + 0.12, w: cab - 0.6, h: 0.34, fontSize: 10, bold: true, color: C.oscuro, valign: "top" });
  const x0 = x + cab + 0.1;
  const y0 = y + 0.13;
  const colW = (x + w - 0.1 - x0) / Math.max(1, hs.length);
  hs.forEach((hz, i) => {
    const cx = x0 + i * colW;
    const tw = colW - 0.46;
    s.addShape("line", { x: cx - 0.06, y: y0, w: 0, h: y + h - 0.13 - y0, line: { color: C.borde, width: 0.75 } });
    if (o.numerados) circulo(s, cx + 0.04, y0, 0.26, String(i + 1), hz.tono);
    else {
      s.addShape("ellipse", { x: cx + 0.04, y: y0, w: 0.26, h: 0.26, fill: { color: FUERTE[hz.tono] }, line: { color: FUERTE[hz.tono], type: "none" } });
      texto(s, hz.tono === "verde" ? "✓" : "!", { x: cx + 0.04, y: y0, w: 0.26, h: 0.26, fontSize: 10, bold: true, color: C.blanco, align: "center" });
    }
    const th = altoLinea(9) * lineasEstimadas(hz.titulo, 9, tw, true);
    texto(s, hz.titulo, { x: cx + 0.38, y: y0 + 0.03, w: tw, h: th, fontSize: 9, bold: true, color: C.oscuro, valign: "top" });
    texto(s, hz.texto, { x: cx + 0.38, y: y0 + th + 0.06, w: tw, h: Math.max(0.15, y + h - 0.08 - (y0 + th + 0.06)), fontSize: 7.5, color: C.gris, valign: "top" });
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
