/**
 * Lámina de la Reunión Semanal: «Acuerdos: ¿cumplimos lo prometido?» (fase 4 de Acuerdos y tareas, 19-nov-2026).
 * Mismos datos que Grupo → Acuerdos y tareas → Resumen semanal (lib/acuerdos.ts → resumenSemanal): el deck nunca
 * contradice a la pantalla. Va al final del deck: la reunión cierra revisando compromisos y fijando los nuevos.
 */

import type { ResumenSemanal } from "@/lib/acuerdos";
import { C, MX, ANCHO, Y0, YMAX, SUAVE, diapositiva, cajaFecha, tarjeta, texto, icono, pastilla, lineasEstimadas, altoLinea, rangoCorto } from "./deck-diseno";
import type { Ctx } from "./deck-semanal";
import type { Tono } from "./lectura-semana";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const dia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;

function cortar(t: string, fontSize: number, ancho: number): string {
  const a = ancho * 0.95;
  if (lineasEstimadas(t, fontSize, a) <= 1) return t;
  let s = t;
  while (s.length > 4 && lineasEstimadas(`${s}…`, fontSize, a) > 1) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

const tonoPct = (p: number | null): Tono => (p === null ? "gris" : p >= 80 ? "verde" : p >= 60 ? "ambar" : "rojo");

export function acuerdosDeLaSemana(ctx: Ctx, r: ResumenSemanal) {
  const c = r.cumplimiento;
  const s = diapositiva(ctx.pptx, {
    titulo: "Acuerdos: ¿cumplimos lo prometido?",
    subtitulo: c.juzgados
      ? `De lo que vencía la semana, el ${c.pctATiempo}% se cumplió a tiempo${r.pctAnterior !== null ? ` (la anterior: ${r.pctAnterior}%)` : ""}.`
      : "La semana no tenía acuerdos con fecha límite.",
    periodo: ctx.periodo,
  });
  cajaFecha(s, `${rangoCorto(r.semana.desde, r.semana.hasta)} ${r.semana.hasta.slice(0, 4)}`, "Acuerdos y tareas", "diana");

  // Fila de cifras
  const cifras: { et: string; v: string; tono: Tono; det: string }[] = [
    { et: "A tiempo", v: c.pctATiempo === null ? "—" : `${c.pctATiempo}%`, tono: tonoPct(c.pctATiempo), det: c.juzgados ? `${c.aTiempo} de ${c.juzgados}` : "nada vencía" },
    { et: "Siguen vencidos", v: String(r.arrastrados.length), tono: r.arrastrados.length ? "rojo" : "verde", det: "hoy, de cualquier semana" },
    { et: "Vencen esta semana", v: String(r.proximos.length), tono: "gris", det: `hasta el ${dia(r.proximos.length ? r.proximos[r.proximos.length - 1].fechaLimite : r.semana.hasta)}` },
    { et: "Tareas nuevas", v: String(r.nuevos), tono: "gris", det: "creadas en la semana" },
  ];
  const gap = 0.16, wc = (ANCHO - gap * 3) / 4, hc = 0.72;
  cifras.forEach((k, i) => {
    const x = MX + i * (wc + gap);
    tarjeta(s, x, Y0, wc, hc);
    texto(s, k.et.toUpperCase(), { x: x + 0.14, y: Y0 + 0.08, w: wc - 0.28, h: 0.16, fontSize: 7.5, bold: true, color: C.gris });
    pastilla(s, x + 0.14, Y0 + 0.28, 0.8, 0.3, k.v, k.tono, { tam: 13 });
    texto(s, k.det, { x: x + 1.02, y: Y0 + 0.28, w: wc - 1.12, h: 0.3, fontSize: 7.5, color: C.gris });
  });

  // Columna izquierda: vencidos que arrastramos
  const y1 = Y0 + hc + 0.18, alto = YMAX - y1, wl = ANCHO * 0.52, xr = MX + wl + 0.2, wr = ANCHO - wl - 0.2;
  const fila = 0.27;
  tarjeta(s, MX, y1, wl, alto, { cabecera: { alto: 0.38, color: SUAVE.rojo } });
  icono(s, "alerta", "rojo", MX + 0.12, y1 + 0.08, 0.22);
  texto(s, `Vencidos que arrastramos (${r.arrastrados.length})`, { x: MX + 0.42, y: y1 + 0.04, w: wl - 0.5, h: 0.3, fontSize: 10, bold: true, color: C.tinta });
  const maxL = Math.floor((alto - 0.5) / fila);
  if (!r.arrastrados.length) texto(s, "Ninguno: todo lo vencido se cumplió.", { x: MX + 0.16, y: y1 + 0.5, w: wl - 0.3, h: fila, fontSize: 8.5, color: C.gris });
  r.arrastrados.slice(0, r.arrastrados.length > maxL ? maxL - 1 : maxL).forEach((a, i) => {
    const y = y1 + 0.48 + i * fila;
    const derecha = `${a.responsableNombre} · ${a.diasAtraso} d`;
    texto(s, derecha, { x: MX + wl - 1.5, y, w: 1.36, h: fila, fontSize: 8, bold: true, color: C.rojo, align: "right" });
    texto(s, cortar(a.que, 8.5, wl - 1.8), { x: MX + 0.16, y, w: wl - 1.8, h: fila, fontSize: 8.5, color: C.tinta });
  });
  if (r.arrastrados.length > maxL) texto(s, `y ${r.arrastrados.length - maxL + 1} más en el sistema`, { x: MX + 0.16, y: y1 + 0.48 + (maxL - 1) * fila, w: wl - 0.3, h: fila, fontSize: 8, color: C.gris });

  // Columna derecha arriba: vencen esta semana
  const altoProx = alto * 0.45;
  tarjeta(s, xr, y1, wr, altoProx, { cabecera: { alto: 0.38, color: SUAVE.gris } });
  icono(s, "calendario", "oscuro", xr + 0.12, y1 + 0.08, 0.22);
  texto(s, `Vencen esta semana (${r.proximos.length})`, { x: xr + 0.42, y: y1 + 0.04, w: wr - 0.5, h: 0.3, fontSize: 10, bold: true, color: C.tinta });
  const maxP = Math.floor((altoProx - 0.5) / fila);
  if (!r.proximos.length) texto(s, "Nada vence esta semana.", { x: xr + 0.16, y: y1 + 0.5, w: wr - 0.3, h: fila, fontSize: 8.5, color: C.gris });
  r.proximos.slice(0, maxP).forEach((a, i) => {
    const y = y1 + 0.48 + i * fila;
    texto(s, dia(a.fechaLimite), { x: xr + 0.16, y, w: 0.5, h: fila, fontSize: 8, bold: true, color: C.oscuro });
    texto(s, cortar(`${a.que} · ${a.responsableNombre}`, 8.5, wr - 0.85), { x: xr + 0.68, y, w: wr - 0.82, h: fila, fontSize: 8.5, color: C.tinta });
  });

  // Columna derecha abajo: qué recomendamos
  const y2 = y1 + altoProx + 0.16, alto2 = YMAX - y2;
  tarjeta(s, xr, y2, wr, alto2, { cabecera: { alto: 0.38, color: SUAVE.verde } });
  icono(s, "lectura", "verde", xr + 0.12, y2 + 0.08, 0.22);
  texto(s, "Qué recomendamos", { x: xr + 0.42, y: y2 + 0.04, w: wr - 0.5, h: 0.3, fontSize: 10, bold: true, color: C.tinta });
  let yy = y2 + 0.48;
  for (const [i, t] of r.recomendaciones.entries()) {
    const h = lineasEstimadas(t, 8, wr - 0.5) * altoLinea(8) + 0.04;
    if (yy + h > YMAX - 0.06) break;
    texto(s, `${i + 1}.`, { x: xr + 0.16, y: yy, w: 0.2, h: altoLinea(8), fontSize: 8, bold: true, color: C.verde, valign: "top" });
    texto(s, t, { x: xr + 0.36, y: yy, w: wr - 0.5, h, fontSize: 8, color: C.tinta, valign: "top" });
    yy += h + 0.06;
  }
}
