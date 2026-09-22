/**
 * Las láminas de "qué se vendió este mes" del deck de la reunión.
 *
 * Pedido de Jahnn (21-sep-2026): llevar al deck, tal como están en su informe
 * de ventas de Fonavi, tres cosas del reporte de rotación de Byte:
 *
 *   1. PANORAMA DEL MES — ventas y unidades por familia, las tres sedes en
 *      una sola lámina (para comparar de un vistazo).
 *   2. LOS 10 PRODUCTOS CON MÁS INGRESOS — una lámina por sede.
 *   3. RANKING DE POSTRES Y PASTELERÍA — una lámina por sede.
 *
 * Una sede sin reporte cargado no genera láminas: el deck no miente con
 * cuadros vacíos, y el hueco se nota en el panorama.
 */

import type PptxGenJS from "pptxgenjs";
import type { PanoramaProductos } from "@/lib/productos/panorama";

type SlideFactory = (title: string, sub: string) => PptxGenJS.Slide;

export type PanoramaSedeDeck = { sede: string; panorama: PanoramaProductos | null };

const MX = 0.5;
const CONTENT_W = 9.0;
const BODY_Y = 1.45;
const PRIMARY = "0F8A5F";
const INK = "1F2937";
const GRAY = "6B7280";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
const soles2 = (n: number) => `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fechaCorta(iso: string): string {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${meses[Number(m) - 1]}`;
}

function periodo(p: PanoramaProductos): string {
  return `${fechaCorta(p.desde)} al ${fechaCorta(p.hasta)} · ${p.dias} días`;
}

/** 1 · Panorama del mes: las familias de las tres sedes, una al lado de la otra. */
function panoramaSlide(nueva: SlideFactory, sub: string, sedes: PanoramaSedeDeck[]) {
  const conDatos = sedes.filter((s): s is { sede: string; panorama: PanoramaProductos } => s.panorama !== null);
  if (conDatos.length === 0) return;
  const s = nueva("Panorama del mes · qué se vendió", sub);
  const colW = (CONTENT_W - 0.3 * (conDatos.length - 1)) / conDatos.length;

  conDatos.forEach((x, i) => {
    const p = x.panorama;
    const cx = MX + i * (colW + 0.3);
    s.addShape("roundRect", { x: cx, y: BODY_Y, w: colW, h: 3.55, fill: { color: "F8FAF9" }, line: { color: "E5E7EB" }, rectRadius: 0.05 });
    s.addText(x.sede.toUpperCase(), { x: cx + 0.15, y: BODY_Y + 0.08, w: colW - 0.3, h: 0.26, fontSize: 12, bold: true, color: PRIMARY });
    s.addText(`${soles(p.ventas)} · ${p.unidades} u · ${p.productos} productos`, {
      x: cx + 0.15, y: BODY_Y + 0.34, w: colW - 0.3, h: 0.24, fontSize: 10, bold: true, color: INK,
    });
    s.addText(`${periodo(p)} · ${soles(p.ventaPorDia)}/día`, { x: cx + 0.15, y: BODY_Y + 0.56, w: colW - 0.3, h: 0.22, fontSize: 8.5, color: GRAY });
    p.familias.slice(0, 7).forEach((f, j) => {
      const fy = BODY_Y + 0.84 + j * 0.36;
      s.addText(f.familia, { x: cx + 0.15, y: fy, w: colW - 1.35, h: 0.2, fontSize: 8.5, color: INK });
      s.addText(`${f.pct}%`, { x: cx + colW - 1.2, y: fy, w: 0.45, h: 0.2, fontSize: 8.5, bold: true, color: PRIMARY, align: "right" });
      s.addText(soles(f.ventas), { x: cx + colW - 0.72, y: fy, w: 0.6, h: 0.2, fontSize: 8.5, color: GRAY, align: "right" });
      // Barra de proporción bajo cada familia.
      s.addShape("rect", { x: cx + 0.15, y: fy + 0.2, w: (colW - 0.3) * Math.min(1, f.pct / 100), h: 0.04, fill: { color: PRIMARY } });
    });
  });

  s.addText(
    "Fuente: reporte «Platos con mayor rotación» de Byte que sube cada sede. Las líneas anuladas o de ajuste quedan fuera de los rankings.",
    { x: MX, y: 5.08, w: CONTENT_W, h: 0.3, fontSize: 8.5, italic: true, color: GRAY },
  );
}

/** 2 · Los 10 productos con más ingresos, de una sede. */
function topSlide(nueva: SlideFactory, sub: string, sede: string, p: PanoramaProductos) {
  const s = nueva(`Los ${p.top.length} productos con más ingresos · ${sede}`, sub);
  s.addText(
    `${periodo(p)} · ${soles(p.ventas)} vendidos · estos ${p.top.length} explican ${p.concentracionTop10}% de la venta`,
    { x: MX, y: BODY_Y - 0.28, w: CONTENT_W, h: 0.26, fontSize: 10, color: GRAY },
  );
  const filas: PptxGenJS.TableRow[] = [
    ["#", "Producto", "Familia", "Precio", "Unid.", "Ingresos", "% venta"].map((t) => ({
      text: t, options: { bold: true, color: "FFFFFF", fill: { color: PRIMARY }, fontSize: 10 },
    })),
    ...p.top.map((x, i) => [
      { text: String(i + 1), options: { fontSize: 10, color: GRAY } },
      { text: x.nombre, options: { fontSize: 10, color: INK } },
      { text: x.familia, options: { fontSize: 9, color: GRAY } },
      { text: x.precio === null ? "—" : soles2(x.precio), options: { fontSize: 10, align: "right" as const, color: GRAY } },
      { text: String(x.unidades), options: { fontSize: 10, align: "right" as const, color: INK } },
      { text: soles2(x.ingresos), options: { fontSize: 10, align: "right" as const, bold: true, color: INK } },
      { text: `${x.pct}%`, options: { fontSize: 10, align: "right" as const, color: GRAY } },
    ]),
  ];
  s.addTable(filas, {
    x: MX, y: BODY_Y + 0.05, w: CONTENT_W, colW: [0.35, 3.3, 2.1, 0.85, 0.7, 1.1, 0.6],
    border: { type: "solid", pt: 0.5, color: "E5E7EB" }, rowH: 0.26, valign: "middle",
  });
  s.addText(
    `${p.colaLarga} productos vendieron 3 unidades o menos en el período: la cola larga que conviene revisar en la carta.`,
    { x: MX, y: 5.08, w: CONTENT_W, h: 0.3, fontSize: 9, italic: true, color: GRAY },
  );
}

/** 3 · Ranking de postres y pastelería, de una sede. */
function postresSlide(nueva: SlideFactory, sub: string, sede: string, p: PanoramaProductos) {
  if (p.postres.length === 0) return;
  const s = nueva(`Ranking de postres y pastelería · ${sede}`, sub);
  const fam = p.familias.find((f) => f.familia === "Postres y pastelería");
  s.addText(
    `${periodo(p)} · ${soles(fam?.ventas ?? 0)} en postres (${fam?.pct ?? 0}% de la venta) · ${p.postres.length} productos`,
    { x: MX, y: BODY_Y - 0.28, w: CONTENT_W, h: 0.26, fontSize: 10, color: GRAY },
  );
  const lista = p.postres.slice(0, 14);
  const filas: PptxGenJS.TableRow[] = [
    ["#", "Producto", "Precio", "Unid.", "Ingresos", "Unid./día"].map((t) => ({
      text: t, options: { bold: true, color: "FFFFFF", fill: { color: PRIMARY }, fontSize: 10 },
    })),
    ...lista.map((x, i) => [
      { text: String(i + 1), options: { fontSize: 10, color: GRAY } },
      { text: x.nombre, options: { fontSize: 10, color: INK } },
      { text: x.precio === null ? "—" : soles2(x.precio), options: { fontSize: 10, align: "right" as const, color: GRAY } },
      { text: String(x.unidades), options: { fontSize: 10, align: "right" as const, color: INK } },
      { text: soles2(x.ingresos), options: { fontSize: 10, align: "right" as const, bold: true, color: INK } },
      { text: x.unidadesPorDia === null ? "—" : String(x.unidadesPorDia), options: { fontSize: 10, align: "right" as const, color: GRAY } },
    ]),
  ];
  s.addTable(filas, {
    x: MX, y: BODY_Y + 0.05, w: CONTENT_W, colW: [0.35, 4.35, 1.0, 0.8, 1.3, 1.2],
    border: { type: "solid", pt: 0.5, color: "E5E7EB" }, rowH: 0.24, valign: "middle",
  });
  if (p.postres.length > lista.length) {
    s.addText(`Se muestran los ${lista.length} primeros de ${p.postres.length}.`, {
      x: MX, y: 5.08, w: CONTENT_W, h: 0.3, fontSize: 9, italic: true, color: GRAY,
    });
  }
}

export function productosSlides(nueva: SlideFactory, sub: string, sedes: PanoramaSedeDeck[]) {
  panoramaSlide(nueva, sub, sedes);
  for (const { sede, panorama } of sedes) {
    if (!panorama) continue;
    topSlide(nueva, sub, sede, panorama);
    postresSlide(nueva, sub, sede, panorama);
  }
}
