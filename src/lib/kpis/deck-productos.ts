/**
 * Diapositivas 9 a 12 de la Reunión Semanal: los productos (pedido de Jahnn,
 * 24-sep-2026). Reemplazan las 18 láminas que había de productos, bono por
 * ticket, portafolio y cierre: "sintetizar en máximo 4, como lo veo en
 * Grupo → Productos".
 *
 *   9  · Qué rota más en cada sede (ventas de carta, familias y los que más
 *        unidades venden).
 *   10 · Los 10 que más facturan, por sede.
 *   11 · Ranking de postres y pastelería, por sede.
 *   12 · Candidatos a reemplazo (Fonavi y Centro juntas).
 *
 * Mismos datos que el dashboard (getPanoramaProductosGrupo y
 * getCandidatosReemplazo): el deck nunca contradice a la pantalla. Una sede
 * sin reporte de rotación del mes sale como "falta subir el reporte".
 */

import type PptxGenJS from "pptxgenjs";
import type { PanoramaDeSede, CandidatosReemplazo } from "@/app/actions/productos-panorama";
import type { ProductoRanking, PanoramaProductos } from "@/lib/productos/panorama";
import type { Candidato, Senal } from "@/lib/productos/candidatos";
import { COLOR_FAMILIA } from "@/components/productos/ui";
import {
  C, MX, ANCHO, SUAVE, TEXTO, Y0, YMAX,
  diapositiva, cajaFecha, tarjeta, texto, icono, circulo, pastilla, lineasEstimadas, altoLinea, solesDeck0,
} from "./deck-diseno";
import type { Ctx } from "./deck-semanal";
import type { Tono } from "./lectura-semana";

/** Orden del dashboard: las cafeterías primero. */
const ORDEN = [2, 3, 1];
const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))} ${MES3[Number(iso.slice(5, 7)) - 1]}`;
const soles2 = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const colorFam = (f: string) => (COLOR_FAMILIA[f] ?? "#B6BCB8").replace("#", "");

/** Byte manda los nombres en MAYÚSCULAS: en la lámina se leen mejor en tipo oración. */
const MINUSCULAS = new Set(["de", "del", "la", "el", "los", "las", "con", "y", "al", "a", "en", "sin", "por", "para"]);
/** Siglas y unidades que Byte usa en los nombres ("IMG" = integral multigrano). */
const FIJAS: Record<string, string> = { img: "IMG", xl: "XL", g: "g", kg: "kg", ml: "ml" };
export function nombreLegible(n: string): string {
  const limpio = n.replace(/\s+/g, " ").trim();
  // Solo se tocan los nombres que llegan todo en mayúsculas o con el prefijo
  // de Atelier ("P-", "Y-") seguido de minúsculas.
  const palabra = (p: string, i: number): string => {
    if (FIJAS[p] !== undefined) return FIJAS[p];
    if (i > 0 && MINUSCULAS.has(p)) return p;
    if (/^\d+(g|kg|ml|l|oz)?$/.test(p)) return p;
    // "p-ciabatta" → "P-Ciabatta"
    return p.split("-").map((q) => q.charAt(0).toUpperCase() + q.slice(1)).join("-");
  };
  const todoMayus = limpio === limpio.toUpperCase();
  if (!todoMayus && !/^[A-Z]-[a-z]/.test(limpio)) return limpio;
  return limpio.toLowerCase().split(" ").map(palabra).join(" ");
}

/** Corta un nombre para que entre en `lineas` líneas del ancho dado. */
function recortar(t: string, fontSize: number, ancho: number, lineas: number): string {
  if (lineasEstimadas(t, fontSize, ancho) <= lineas) return t;
  let s = t;
  while (s.length > 4 && lineasEstimadas(`${s}…`, fontSize, ancho) > lineas) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

type SedeConDatos = { sede: string; p: PanoramaProductos };

function ordenar(sedes: PanoramaDeSede[]): PanoramaDeSede[] {
  return [...sedes].sort((a, b) => ORDEN.indexOf(a.businessId) - ORDEN.indexOf(b.businessId));
}

/** Tarjeta de sede con la franja de nombre; devuelve dónde empieza el cuerpo. */
function cabeceraSede(s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, sede: string, detalle: string): number {
  tarjeta(s, x, y, w, h, { cabecera: { alto: 0.46, color: SUAVE.verde } });
  icono(s, sede.includes("Atelier") ? "fabrica" : "tienda", "oscuro", x + 0.14, y + 0.1, 0.26);
  texto(s, sede.toUpperCase(), { x: x + 0.5, y: y + 0.06, w: w - 0.6, h: 0.2, fontSize: 11, bold: true, color: C.tinta });
  texto(s, detalle, { x: x + 0.5, y: y + 0.26, w: w - 0.6, h: 0.15, fontSize: 7.5, color: C.gris });
  return y + 0.56;
}

function sinReporte(s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, sede: string) {
  tarjeta(s, x, y, w, h, { cabecera: { alto: 0.46, color: SUAVE.gris } });
  icono(s, sede.includes("Atelier") ? "fabrica" : "tienda", "gris", x + 0.14, y + 0.1, 0.26);
  texto(s, sede.toUpperCase(), { x: x + 0.5, y: y + 0.06, w: w - 0.6, h: 0.2, fontSize: 11, bold: true, color: C.gris });
  texto(s, "Falta subir el reporte de rotación de este mes.", { x: x + 0.2, y: y + 0.7, w: w - 0.4, h: 0.4, fontSize: 8.5, italic: true, color: C.gris, valign: "top" });
}

/**
 * Lista numerada de productos dentro de una tarjeta: puesto, nombre (hasta
 * dos líneas) y a la derecha la cifra principal con su detalle.
 */
function listaRanking(
  s: PptxGenJS.Slide, x: number, y: number, w: number, filaH: number,
  filas: { nombre: string; valor: string; detalle: string }[],
) {
  const anchoValor = 0.78;
  const anchoNombre = w - 0.3 - anchoValor - 0.08;
  filas.forEach((f, i) => {
    const fy = y + i * filaH;
    if (i > 0) s.addShape("line", { x, y: fy, w, h: 0, line: { color: C.borde, width: 0.5 } });
    circulo(s, x, fy + (filaH - 0.2) / 2, 0.2, String(i + 1), i < 3 ? "verde" : "gris");
    texto(s, recortar(f.nombre, 7.5, anchoNombre, 2), { x: x + 0.28, y: fy, w: anchoNombre, h: filaH, fontSize: 7.5, color: C.tinta });
    texto(s, f.valor, { x: x + w - anchoValor, y: fy + 0.03, w: anchoValor, h: filaH / 2 - 0.02, fontSize: 8, bold: true, color: C.tinta, align: "right", valign: "bottom" });
    texto(s, f.detalle, { x: x + w - anchoValor - 0.2, y: fy + filaH / 2 + 0.01, w: anchoValor + 0.2, h: filaH / 2 - 0.04, fontSize: 6.5, color: C.gris, align: "right", valign: "top" });
  });
}

/** Las tres columnas de sede con un cuerpo propio por diapositiva. */
function tresColumnas(
  s: PptxGenJS.Slide, sedes: PanoramaDeSede[],
  detalle: (p: PanoramaProductos) => string,
  cuerpo: (x: number, y: number, w: number, h: number, d: SedeConDatos) => void,
) {
  const lista = ordenar(sedes);
  const gap = 0.2;
  const w = (ANCHO - gap * (lista.length - 1)) / lista.length;
  const h = YMAX - Y0;
  lista.forEach((sd, i) => {
    const x = MX + i * (w + gap);
    if (!sd.panorama) { sinReporte(s, x, Y0, w, h, sd.sede); return; }
    const by = cabeceraSede(s, x, Y0, w, h, sd.sede, detalle(sd.panorama));
    cuerpo(x + 0.14, by, w - 0.28, Y0 + h - 0.1 - by, { sede: sd.sede, p: sd.panorama });
  });
}

/** Rango de fechas de los reportes cargados (para el recuadro de arriba). */
function rangoReportes(sedes: PanoramaDeSede[]): string {
  const ps = sedes.map((x) => x.panorama).filter((p): p is PanoramaProductos => !!p);
  if (ps.length === 0) return "Sin reportes";
  const desde = ps.map((p) => p.desde).sort()[0];
  const hasta = ps.map((p) => p.hasta).sort().pop()!;
  return `${fechaCorta(desde)} al ${fechaCorta(hasta)} ${hasta.slice(0, 4)}`;
}

/* ───────────────────── 9 · Qué rota más en cada sede ───────────────────── */

export function rotacionPorSede(ctx: Ctx, sedes: PanoramaDeSede[]) {
  const s = diapositiva(ctx.pptx, {
    titulo: "Productos: qué rota más en cada sede",
    subtitulo: "Ventas de carta del mes, qué familias pesan y los productos que más unidades venden.",
    periodo: ctx.periodo, derecha: "Productos",
  });
  cajaFecha(s, rangoReportes(sedes), "Fuente: rotación de Byte");
  tresColumnas(s, sedes, (p) => `${p.dias} días · ${p.productos} productos`, (x, y, w, h, { p }) => {
    // Cifras del mes.
    texto(s, "Ventas de carta", { x, y, w: w / 2, h: 0.14, fontSize: 7, color: C.gris });
    texto(s, solesDeck0(p.ventas), { x, y: y + 0.15, w: w / 2 + 0.2, h: 0.26, fontSize: 14, bold: true, color: C.tinta });
    texto(s, "Por día", { x: x + w / 2 + 0.2, y, w: w / 2 - 0.2, h: 0.14, fontSize: 7, color: C.gris, align: "right" });
    texto(s, solesDeck0(p.ventaPorDia), { x: x + w / 2 + 0.2, y: y + 0.15, w: w / 2 - 0.2, h: 0.26, fontSize: 11, bold: true, color: C.tinta, align: "right" });

    // Franja de familias + las tres que más pesan.
    const fy = y + 0.52;
    let fx = x;
    const fams = p.familias.filter((f) => f.pct > 0);
    const totalPct = fams.reduce((a, f) => a + f.pct, 0) || 100;
    fams.forEach((f) => {
      const fw = (w * f.pct) / totalPct;
      if (fw > 0.01) s.addShape("rect", { x: fx, y: fy, w: fw, h: 0.1, fill: { color: colorFam(f.familia) }, line: { color: colorFam(f.familia), type: "none" } });
      fx += fw;
    });
    fams.slice(0, 3).forEach((f, k) => {
      const ly = fy + 0.18 + k * 0.17;
      s.addShape("ellipse", { x, y: ly + 0.03, w: 0.09, h: 0.09, fill: { color: colorFam(f.familia) }, line: { color: colorFam(f.familia), type: "none" } });
      texto(s, f.familia, { x: x + 0.15, y: ly, w: w - 0.7, h: 0.15, fontSize: 7, color: C.tinta });
      texto(s, `${f.pct}%`, { x: x + w - 0.5, y: ly, w: 0.5, h: 0.15, fontSize: 7, bold: true, color: C.tinta, align: "right" });
    });

    // Los que más unidades venden.
    const ty = fy + 0.76;
    s.addShape("line", { x, y: ty - 0.06, w, h: 0, line: { color: C.borde, width: 0.5 } });
    texto(s, "Más rotación (unidades por día)", { x, y: ty, w, h: 0.18, fontSize: 8.5, bold: true, color: C.oscuro });
    const top = [...p.carta].sort((a, b) => b.unidades - a.unidades).slice(0, 7);
    const ly0 = ty + 0.24;
    const filaH = Math.min(0.32, (y + h - ly0) / Math.max(1, top.length));
    listaRanking(s, x, ly0, w, filaH, top.map((r) => ({
      nombre: nombreLegible(r.nombre),
      valor: r.unidadesPorDia === null ? `${r.unidades} u` : `${r.unidadesPorDia}/día`,
      detalle: `${r.unidades} u en el mes`,
    })));
  });
}

/* ───────────────────── 10 · Los 10 que más facturan ───────────────────── */

export function topFacturacion(ctx: Ctx, sedes: PanoramaDeSede[]) {
  const s = diapositiva(ctx.pptx, {
    titulo: "Los 10 productos que más facturan",
    subtitulo: "Por sede, ordenados por ingresos del mes. Sostienen buena parte de la venta: no pueden faltar.",
    periodo: ctx.periodo, derecha: "Productos",
  });
  cajaFecha(s, rangoReportes(sedes), "Fuente: rotación de Byte");
  tresColumnas(s, sedes, (p) => `Explican el ${p.concentracionTop10}% de la venta de carta`, (x, y, w, h, { p }) => {
    const filas = p.top.slice(0, 10);
    listaRanking(s, x, y, w, Math.min(0.37, h / Math.max(1, filas.length)), filas.map((r: ProductoRanking) => ({
      nombre: nombreLegible(r.nombre),
      valor: solesDeck0(r.ingresos),
      detalle: `${r.unidades} u · ${r.pct}%`,
    })));
  });
}

/* ───────────────── 11 · Ranking de postres y pastelería ───────────────── */

export function rankingPostres(ctx: Ctx, sedes: PanoramaDeSede[]) {
  const s = diapositiva(ctx.pptx, {
    titulo: "Ranking de postres y pastelería",
    subtitulo: "Los 10 postres que más ingresan en cada sede y cuántos salen por día.",
    periodo: ctx.periodo, derecha: "Productos",
  });
  cajaFecha(s, rangoReportes(sedes), "Fuente: rotación de Byte");
  tresColumnas(s, sedes, (p) => {
    const fam = p.familias.find((f) => f.familia === "Postres y pastelería");
    return fam ? `${solesDeck0(fam.ventas)} en postres · ${fam.pct}% de la venta` : "Sin postres en el reporte";
  }, (x, y, w, h, { p }) => {
    const filas = p.postres.slice(0, 10);
    if (filas.length === 0) {
      texto(s, "No hay postres en el reporte de este mes.", { x, y: y + 0.1, w, h: 0.3, fontSize: 8.5, italic: true, color: C.gris, valign: "top" });
      return;
    }
    listaRanking(s, x, y, w, Math.min(0.37, h / filas.length), filas.map((r) => ({
      nombre: nombreLegible(r.nombre),
      valor: solesDeck0(r.ingresos),
      detalle: `${r.unidadesPorDia ?? "—"} por día · ${r.precio !== null ? soles2(r.precio) : "—"}`,
    })));
  });
}

/* ───────────────────── 12 · Candidatos a reemplazo ───────────────────── */

const SENAL_CORTA: Record<Senal, string> = {
  "vende-poco": "vende poco", "deja-poco": "gana poco", pierde: "pierde plata", cayendo: "cae", "rota-lento": "menos de 3 por semana",
};

/** Motivo corto a partir de las señales de cada sede (la razón larga vive en el dashboard). */
function motivoCorto(c: Candidato): string {
  if (c.veredicto === "confirmar") return "Dos meses sin ventas";
  const partes: string[] = [];
  for (const sn of ["vende-poco", "pierde", "deja-poco", "cayendo", "rota-lento"] as Senal[]) {
    const en = c.sedes.filter((x) => x.senales.includes(sn));
    if (en.length === 0) continue;
    if (sn === "cayendo") partes.push(`cae ${en.map((x) => `${x.variacion}%`).join(" / ")}`);
    else partes.push(SENAL_CORTA[sn]);
  }
  const t = partes.slice(0, 3).join(" · ") || "por debajo del resto de la carta";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const GRUPOS: { v: Candidato["veredicto"]; titulo: string; ayuda: string; tono: Tono }[] = [
  { v: "sacar", titulo: "Sacar de carta", ayuda: "Flojo en las dos sedes", tono: "rojo" },
  { v: "preparar", titulo: "Preparar reemplazo", ayuda: "Flojo en una, en duda en la otra", tono: "ambar" },
  { v: "revisar", titulo: "Revisar en una sede", ayuda: "Mal en una, bien en la otra", tono: "verde" },
  { v: "confirmar", titulo: "¿Ya salieron?", ayuda: "Dos meses sin ventas", tono: "gris" },
];

export function candidatosReemplazo(ctx: Ctx, d: CandidatosReemplazo) {
  const s = diapositiva(ctx.pptx, {
    titulo: "Candidatos a reemplazo",
    subtitulo: `Fonavi y Centro juntas: productos flojos en venta y ganancia (últimos ${d.meses.length} meses${d.semanas > 0 ? ` y ${d.semanas} semanas` : ""}).`,
    periodo: ctx.periodo, derecha: "Productos",
  });
  cajaFecha(s, `Costos al ${d.coberturaCosto}%`, "de lo vendido tiene costo cargado", "check");
  const por = (v: Candidato["veredicto"]) => d.candidatos.filter((c) => c.veredicto === v).sort((a, b) => b.puntos - a.puntos);

  // Contadores de las cuatro listas.
  const gap = 0.15;
  const cw = (ANCHO - gap * 3) / 4;
  GRUPOS.forEach((g, i) => {
    const x = MX + i * (cw + gap);
    const n = por(g.v).length;
    tarjeta(s, x, Y0, cw, 0.56, { fondo: n > 0 && g.tono !== "gris" ? SUAVE[g.tono] : C.blanco });
    texto(s, String(n), { x: x + 0.14, y: Y0 + 0.06, w: 0.5, h: 0.44, fontSize: 20, bold: true, color: n > 0 ? TEXTO[g.tono] : C.grisClaro });
    texto(s, g.titulo, { x: x + 0.66, y: Y0 + 0.09, w: cw - 0.74, h: 0.2, fontSize: 9, bold: true, color: C.tinta });
    texto(s, g.ayuda, { x: x + 0.66, y: Y0 + 0.29, w: cw - 0.74, h: 0.16, fontSize: 7, color: C.gris });
  });

  // Tres columnas de detalle: lo que hay que decidir.
  const y = Y0 + 0.7;
  const sacar = por("sacar");
  const impacto = sacar.reduce((a, c) => a + c.impactoMes.venta, 0);
  const pieH = sacar.length > 0 ? 0.26 : 0;
  const h = YMAX - y - pieH;
  const gap2 = 0.2;
  const w = (ANCHO - gap2 * 2) / 3;
  GRUPOS.slice(0, 3).forEach((g, i) => {
    const x = MX + i * (w + gap2);
    const lista = por(g.v);
    tarjeta(s, x, y, w, h, { cabecera: { alto: 0.4, color: SUAVE[g.tono] } });
    texto(s, g.titulo, { x: x + 0.16, y: y + 0.04, w: w - 0.9, h: 0.32, fontSize: 10, bold: true, color: TEXTO[g.tono] });
    pastilla(s, x + w - 0.62, y + 0.09, 0.48, 0.22, String(lista.length), g.tono, { tam: 8.5 });
    const cy = y + 0.5;
    if (lista.length === 0) {
      texto(s, "Nada en esta lista.", { x: x + 0.16, y: cy, w: w - 0.32, h: 0.2, fontSize: 8, italic: true, color: C.gris });
      return;
    }
    const filaH = 0.42;
    const caben = Math.max(1, Math.floor((y + h - 0.08 - cy) / filaH));
    const muestra = lista.length > caben ? lista.slice(0, caben - 1) : lista;
    const tw = w - 1.12;
    muestra.forEach((c, k) => {
      const fy = cy + k * filaH;
      if (k > 0) s.addShape("line", { x: x + 0.16, y: fy - 0.04, w: w - 0.32, h: 0, line: { color: C.borde, width: 0.5 } });
      texto(s, recortar(nombreLegible(c.nombre), 8, tw, 1), { x: x + 0.16, y: fy, w: tw, h: 0.17, fontSize: 8, bold: true, color: C.tinta });
      const extra = g.v === "revisar" && c.sedeRevisar ? `En ${c.sedeRevisar} · ` : g.v === "preparar" && c.seguimiento?.plazo ? `Decidir antes del ${fechaCorta(c.seguimiento.plazo.vence)} · ` : "";
      texto(s, recortar(`${extra}${motivoCorto(c)}`, 6.5, tw, 2), { x: x + 0.16, y: fy + 0.17, w: tw, h: altoLinea(6.5) * 2, fontSize: 6.5, color: C.gris, valign: "top" });
      texto(s, `${solesDeck0(c.impactoMes.venta)}/mes`, { x: x + w - 0.96, y: fy, w: 0.8, h: 0.17, fontSize: 8, bold: true, color: C.tinta, align: "right" });
      texto(s, "venta", { x: x + w - 0.96, y: fy + 0.17, w: 0.8, h: 0.13, fontSize: 6.5, color: C.gris, align: "right" });
    });
    if (muestra.length < lista.length) {
      texto(s, `y ${lista.length - muestra.length} más en Grupo → Productos`, {
        x: x + 0.16, y: cy + muestra.length * filaH, w: w - 0.32, h: 0.18, fontSize: 7, italic: true, color: C.gris,
      });
    }
  });
  if (sacar.length > 0) {
    texto(s, `Si salen los ${sacar.length} de «Sacar de carta» se dejan de vender hasta ${solesDeck0(impacto)} al mes entre las dos sedes (es el techo: parte de esa venta pasa a otros productos).`, {
      x: MX, y: YMAX - 0.2, w: ANCHO, h: 0.2, fontSize: 7, italic: true, color: C.gris,
    });
  }
}
