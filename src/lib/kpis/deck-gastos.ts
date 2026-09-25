/**
 * Diapositivas 9 a 11 de la Reunión Semanal: los gastos (pedido de Jahnn,
 * 25-sep-2026: "saber de manera concreta a dónde se está yendo el dinero").
 *
 *   9  · ¿A dónde se fue la plata? — bolsillos del mes y costo primo, por sede.
 *   10 · Las categorías que más pesan y cuáles subieron.
 *   11 · Lo que sale todos los meses (piso mensual) y los pagos más grandes.
 *
 * Mismos datos que Grupo → Gastos (getInformeGastos): el deck nunca
 * contradice a la pantalla. Último mes cerrado contra el promedio de los 3
 * anteriores; semáforo con referencias del rubro (lib/informe-gastos.ts).
 */

import type PptxGenJS from "pptxgenjs";
import type { InformeGastos } from "@/app/actions/informe-gastos";
import type { Bolsillos, Indicador, InformeGastosSede } from "@/lib/informe-gastos";
import {
  C, MX, ANCHO, SUAVE, Y0, YMAX,
  diapositiva, cajaFecha, tarjeta, texto, icono, circulo, pastilla, lineasEstimadas, solesDeck0,
} from "./deck-diseno";
import type { Ctx } from "./deck-semanal";
import type { Tono } from "./lectura-semana";

const ORDEN = [2, 3, 1];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => MESES[Number(m.slice(5, 7)) - 1];
const mesLargo = (m: string) => `${nombreMes(m)[0].toUpperCase()}${nombreMes(m).slice(1)} ${m.slice(0, 4)}`;

const BOLSILLOS: { clave: keyof Bolsillos; nombre: string; color: string }[] = [
  { clave: "fijo", nombre: "Fijos", color: "004C40" },
  { clave: "variable", nombre: "Variables", color: "098B5F" },
  { clave: "desconocido", nombre: "Desconocido", color: "9CA3AF" },
  { clave: "deudas", nombre: "Deudas", color: "8E7CC3" },
  { clave: "inversion", nombre: "Inversión", color: "5B8DB8" },
  { clave: "noEsGasto", nombre: "No es gasto", color: "D9A441" },
  { clave: "otrasSedes", nombre: "De otras sedes", color: "CBD5E1" },
];

const CORTO: Record<Indicador["clave"], string> = { costoVendido: "Lo vendido", planilla: "Planilla", costoPrimo: "Costo primo" };

/** Categoría en tipo oración para la lámina ("PRODUCTOS ATELIER" → "Productos Atelier"). */
function legible(t: string): string {
  const chicas = new Set(["y", "de", "a", "del", "la"]);
  return t.toLowerCase().split(" ").map((p, i) => (i > 0 && chicas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}

function cortar(t: string, fontSize: number, ancho: number, lineas = 1): string {
  const a = ancho * 0.95;
  if (lineasEstimadas(t, fontSize, a) <= lineas) return t;
  let s = t;
  while (s.length > 4 && lineasEstimadas(`${s}…`, fontSize, a) > lineas) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function ordenar(sedes: InformeGastosSede[]): InformeGastosSede[] {
  return [...sedes].sort((a, b) => ORDEN.indexOf(a.businessId) - ORDEN.indexOf(b.businessId));
}

/** Las tres columnas de sede; devuelve el cuerpo de cada una. */
function tresColumnas(
  s: PptxGenJS.Slide, sedes: InformeGastosSede[],
  detalle: (d: InformeGastosSede) => string,
  cuerpo: (x: number, y: number, w: number, h: number, d: InformeGastosSede) => void,
) {
  const lista = ordenar(sedes);
  const gap = 0.2;
  const w = (ANCHO - gap * (lista.length - 1)) / lista.length;
  const h = YMAX - Y0;
  lista.forEach((d, i) => {
    const x = MX + i * (w + gap);
    tarjeta(s, x, Y0, w, h, { cabecera: { alto: 0.46, color: SUAVE.verde } });
    icono(s, d.sede.includes("Atelier") ? "fabrica" : "tienda", "oscuro", x + 0.14, Y0 + 0.1, 0.26);
    texto(s, d.sede.toUpperCase(), { x: x + 0.5, y: Y0 + 0.06, w: w - 0.6, h: 0.2, fontSize: 11, bold: true, color: C.tinta });
    texto(s, detalle(d), { x: x + 0.5, y: Y0 + 0.26, w: w - 0.6, h: 0.15, fontSize: 7.5, color: C.gris });
    const by = Y0 + 0.56;
    cuerpo(x + 0.14, by, w - 0.28, Y0 + h - 0.1 - by, d);
  });
}

const tonoIndicador = (i: Indicador): Tono => (i.estado === "ok" ? "verde" : i.estado === "alerta" ? "rojo" : "gris");
const vendio = (d: InformeGastosSede) => (d.ventas !== null ? `Vendió ${solesDeck0(d.ventas)}` : "Sin venta cargada");

function previosTexto(d: InformeGastosSede): string {
  return d.mesesPrevios.map(nombreMes).reverse().join(", ");
}

/* ───────────────────── 9 · ¿A dónde se fue la plata? ───────────────────── */

export function aDondeSeFueLaPlata(ctx: Ctx, inf: InformeGastos) {
  const s = diapositiva(ctx.pptx, {
    titulo: "¿A dónde se fue la plata?",
    subtitulo: "Lo que salió de cada sede (igual al Excel), por bolsillo, y cuánto de la venta se come lo vendido y la planilla.",
    periodo: ctx.periodo, derecha: "Gastos",
  });
  cajaFecha(s, mesLargo(inf.mes), "Último mes cerrado");
  tresColumnas(s, inf.sedes, vendio, (x, y, w, h, d) => {
    const b = d.bolsillos;
    texto(s, "Salió en el mes", { x, y, w, h: 0.14, fontSize: 7, color: C.gris });
    texto(s, solesDeck0(b.total), { x, y: y + 0.15, w, h: 0.28, fontSize: 15, bold: true, color: C.tinta });
    const cambio = d.bolsillosProm3.operacion > 0 ? Math.round(((b.operacion - d.bolsillosProm3.operacion) / d.bolsillosProm3.operacion) * 100) : null;
    texto(s, [
      { text: `Operación ${solesDeck0(b.operacion)}`, options: { color: C.gris } },
      ...(cambio !== null ? [{ text: `  ${cambio > 0 ? "+" : ""}${cambio}% vs. promedio`, options: { color: cambio > 0 ? C.rojo : C.verde, bold: true } }] : []),
    ], { x, y: y + 0.45, w, h: 0.16, fontSize: 7.5 });

    // Barra de bolsillos (formas: Quick Look no dibuja gráficos nativos).
    const by = y + 0.72;
    const partes = BOLSILLOS.filter((p) => b[p.clave] > 0);
    let bx = x;
    partes.forEach((p) => {
      const pw = (w * b[p.clave]) / b.total;
      if (pw > 0.01) s.addShape("rect", { x: bx, y: by, w: pw, h: 0.16, fill: { color: p.color }, line: { color: C.blanco, width: 1 } });
      bx += pw;
    });
    partes.forEach((p, k) => {
      const ly = by + 0.26 + k * 0.19;
      s.addShape("ellipse", { x, y: ly + 0.04, w: 0.09, h: 0.09, fill: { color: p.color }, line: { color: p.color, type: "none" } });
      texto(s, p.nombre, { x: x + 0.15, y: ly, w: w - 1.1, h: 0.17, fontSize: 7.5, color: C.tinta });
      texto(s, solesDeck0(b[p.clave]), { x: x + w - 0.95, y: ly, w: 0.95, h: 0.17, fontSize: 7.5, bold: true, color: C.tinta, align: "right" });
    });

    // Los tres indicadores del negocio de comida.
    const iy = y + h - 1.05;
    s.addShape("line", { x, y: iy - 0.08, w, h: 0, line: { color: C.borde, width: 0.5 } });
    texto(s, "% de la venta", { x, y: iy, w, h: 0.16, fontSize: 8, bold: true, color: C.oscuro });
    const pw = (w - 0.12) / 3;
    d.indicadores.forEach((i, k) => {
      const px = x + k * (pw + 0.06);
      texto(s, CORTO[i.clave], { x: px, y: iy + 0.2, w: pw, h: 0.14, fontSize: 6.5, color: C.gris, align: "center" });
      pastilla(s, px, iy + 0.36, pw, 0.3, i.pct === null ? "—" : `${i.pct}%`, tonoIndicador(i), { tam: 10.5 });
      texto(s, `ref. ≤${i.meta}%${i.pctProm3 !== null ? ` · antes ${i.pctProm3}%` : ""}`, { x: px - 0.03, y: iy + 0.7, w: pw + 0.06, h: 0.14, fontSize: 5.8, color: C.gris, align: "center" });
    });
  });
}

/* ───────────────────── 10 · Categorías que más pesan ───────────────────── */

export function categoriasQueMasPesan(ctx: Ctx, inf: InformeGastos) {
  const s = diapositiva(ctx.pptx, {
    titulo: "Las categorías que más pesan",
    subtitulo: "Gasto de la operación por categoría: cuánto fue, qué % de la venta y cuánto cambió contra el promedio.",
    periodo: ctx.periodo, derecha: "Gastos",
  });
  const ej = inf.sedes[0];
  cajaFecha(s, mesLargo(inf.mes), ej && ej.mesesPrevios.length ? `vs. promedio ${previosTexto(ej)}` : "Último mes cerrado");
  tresColumnas(s, inf.sedes, (d) => `Operación ${solesDeck0(d.bolsillos.operacion)}`, (x, y, w, h, d) => {
    const filas = d.categorias.slice(0, 7);
    const filaH = 0.36;
    const anchoCambio = 0.56;
    const anchoMonto = 0.66;
    const anchoNombre = w - 0.28 - anchoMonto - anchoCambio - 0.08;
    filas.forEach((c, i) => {
      const fy = y + i * filaH;
      if (i > 0) s.addShape("line", { x, y: fy, w, h: 0, line: { color: C.borde, width: 0.5 } });
      circulo(s, x, fy + (filaH - 0.2) / 2, 0.2, String(i + 1), i < 3 ? "verde" : "gris");
      texto(s, cortar(legible(c.categoria), 7.5, anchoNombre), { x: x + 0.28, y: fy + 0.03, w: anchoNombre, h: 0.17, fontSize: 7.5, color: C.tinta });
      texto(s, `${c.tipo ?? "—"}${c.pctVenta !== null ? ` · ${c.pctVenta}% de la venta` : ""}`, { x: x + 0.28, y: fy + 0.19, w: anchoNombre + 0.2, h: 0.14, fontSize: 6, color: C.gris });
      texto(s, solesDeck0(c.monto), { x: x + 0.28 + anchoNombre, y: fy, w: anchoMonto, h: filaH, fontSize: 8, bold: true, color: C.tinta, align: "right" });
      const v = c.variacionPct;
      const tono: Tono = v === null ? "gris" : v >= 20 ? "rojo" : v <= -10 ? "verde" : "gris";
      pastilla(s, x + w - anchoCambio + 0.04, fy + 0.08, anchoCambio - 0.04, 0.2,
        v === null ? "nuevo" : Math.abs(v) < 5 ? "≈" : `${Math.abs(Math.round(v))}%`, tono,
        { tam: 7, flecha: v === null || Math.abs(v) < 5 ? null : v > 0 ? "arriba" : "abajo" });
    });
    // Los avisos de la sede (los que no son de indicadores: esos van en la 9).
    const avisos = d.alertas.filter((a) => !/de la venta$/.test(a.titulo)).slice(0, 2);
    if (avisos.length > 0) {
      const ay = y + h - 0.2 - avisos.length * 0.36;
      s.addShape("line", { x, y: ay - 0.08, w, h: 0, line: { color: C.borde, width: 0.5 } });
      avisos.forEach((a, k) => {
        const yy = ay + k * 0.36;
        texto(s, cortar(`⚠ ${a.titulo}`, 7, w), { x, y: yy, w, h: 0.15, fontSize: 7, bold: true, color: C.ambarTexto });
        texto(s, cortar(a.detalle, 6.3, w), { x, y: yy + 0.16, w, h: 0.14, fontSize: 6.3, color: C.gris });
      });
    }
  });
}

/* ───────────────────── 11 · Lo que sale todos los meses ───────────────────── */

export function pisoYPagosGrandes(ctx: Ctx, inf: InformeGastos) {
  const s = diapositiva(ctx.pptx, {
    titulo: "Piso mensual y pagos más grandes",
    subtitulo: "Lo que sale todos los meses (fijos y cuotas, promedio de 4 meses): hay que cubrirlo antes de empezar a ganar.",
    periodo: ctx.periodo, derecha: "Gastos",
  });
  cajaFecha(s, mesLargo(inf.mes), "Último mes cerrado");
  tresColumnas(s, inf.sedes, (d) => {
    const r = d.recurrencia.pctRecurrente;
    return r !== null ? `${r}% del gasto se repite cada mes` : "Recurrencia: desde el próximo mes";
  }, (x, y, w, h, d) => {
    const r = d.recurrencia;
    texto(s, "Piso mensual", { x, y, w, h: 0.14, fontSize: 7, color: C.gris });
    texto(s, solesDeck0(r.pisoMensual.total), { x, y: y + 0.15, w, h: 0.28, fontSize: 15, bold: true, color: C.tinta });
    r.pisoMensual.detalle.slice(0, 3).forEach((p, k) => {
      const ly = y + 0.48 + k * 0.17;
      texto(s, cortar(legible(p.categoria), 7, w - 0.9), { x, y: ly, w: w - 0.9, h: 0.15, fontSize: 7, color: C.tinta });
      texto(s, solesDeck0(p.promedio), { x: x + w - 0.9, y: ly, w: 0.9, h: 0.15, fontSize: 7, bold: true, color: C.tinta, align: "right" });
    });

    const ty = y + 1.02;
    s.addShape("line", { x, y: ty - 0.06, w, h: 0, line: { color: C.borde, width: 0.5 } });
    texto(s, "Los 5 pagos más grandes", { x, y: ty, w, h: 0.18, fontSize: 8.5, bold: true, color: C.oscuro });
    const filaH = 0.38;
    d.pagos.slice(0, 5).forEach((p, i) => {
      const fy = ty + 0.22 + i * filaH;
      if (i > 0) s.addShape("line", { x, y: fy, w, h: 0, line: { color: C.borde, width: 0.5 } });
      // Sin comprobante ni proveedor entre paréntesis, y en tipo oración: el
      // Excel viene en MAYÚSCULAS, que ocupan más y se leen peor.
      const crudo = (p.concepto ?? "Sin concepto").replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\([^)]*\)/g, "").trim() || "Sin concepto";
      const concepto = crudo.charAt(0).toUpperCase() + crudo.slice(1).toLowerCase();
      texto(s, cortar(concepto, 7, w - 0.85), { x, y: fy + 0.03, w: w - 0.85, h: 0.17, fontSize: 7, color: C.tinta });
      const rep = p.recurrente === true ? " · se repite" : p.recurrente === false ? " · puntual" : "";
      texto(s, cortar(`${legible(p.categoria)}${rep}`, 6, w - 0.85), { x, y: fy + 0.2, w: w - 0.85, h: 0.15, fontSize: 6, color: p.recurrente === false ? C.ambarTexto : C.gris });
      texto(s, solesDeck0(p.monto), { x: x + w - 0.85, y: fy, w: 0.85, h: filaH, fontSize: 8, bold: true, color: C.tinta, align: "right" });
    });

    const hy = y + h - 0.28;
    s.addShape("line", { x, y: hy - 0.06, w, h: 0, line: { color: C.borde, width: 0.5 } });
    texto(s, `Gastos hormiga (menos de S/50): ${r.hormiga.pagos} pagos · ${solesDeck0(r.hormiga.total)}`, { x, y: hy, w, h: 0.28, fontSize: 6.8, color: C.gris, valign: "top" });
  });
}
