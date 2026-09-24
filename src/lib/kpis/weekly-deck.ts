/**
 * KPIs · Renderer del deck de la reunión (renderer tonto) — v2.
 * Estructura: portada → resumen ejecutivo (gráfico + tarjetas) → detalle
 * Fonavi → detalle Centro → detalle Atelier → meta de ticket & plan de
 * incentivos → qué mejoró/empeoró + KPI rojo priorizado → kaizen.
 * Acepta rangos personalizados (no solo la semana dom→sáb).
 *
 * v2 (feedback de la primera reunión de Jahnn): resumen con gráfico de
 * barras (antes era texto plano), slide detallada de Atelier (faltaba),
 * slide del plan de incentivos/bonos, y márgenes/visual consistentes.
 */

import PptxGenJS from "pptxgenjs";
import { BRAND } from "../report/renderers/design-system";
import type { BoardDeckData } from "@/app/actions/kpis";
import type { KpiTraffic } from "./engine";
import type { BoardPortfolio } from "@/lib/portfolio/board-view";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import { portfolioSlides } from "./portfolio-slides";
import { contexto, portada, laSemanaEnUnaMirada, ventasDelMes, detalleCafeteria, detalleAtelier, incentivos, puntoDeEquilibrio } from "./deck-semanal";
import { diapositiva, FONT } from "./deck-diseno";
import { impactoIncentivosSlide } from "./impacto-incentivos-slide";
import { productosSlides, type PanoramaSedeDeck } from "./productos-slides";
import type { ImpactoIncentivos } from "@/lib/incentives/impacto";

const INK = BRAND.ink.replace("#", "");
const GRAY = BRAND.gray.replace("#", "");
const TRAFFIC_HEX: Record<KpiTraffic, string> = {
  verde: BRAND.traffic.verde.replace("#", ""),
  ambar: BRAND.traffic.ambar.replace("#", ""),
  rojo: BRAND.traffic.rojo.replace("#", ""),
  gris: "9CA3AF",
};

// Márgenes consistentes en todas las diapositivas (feedback v2).
const MX = 0.5;            // margen lateral
const CONTENT_W = 10 - MX * 2; // 9.0
const BODY_Y = 1.45;

function rangeLabel(ws: string, we: string): string {
  const d1 = new Date(ws + "T12:00:00Z");
  const d2 = new Date(we + "T12:00:00Z");
  const mes1 = d1.toLocaleDateString("es-PE", { month: "long", timeZone: "UTC" });
  const mes2 = d2.toLocaleDateString("es-PE", { month: "long", timeZone: "UTC" });
  if (mes1 === mes2) return `Del ${d1.getUTCDate()} al ${d2.getUTCDate()} de ${mes2} ${d2.getUTCFullYear()}`;
  return `Del ${d1.getUTCDate()} de ${mes1} al ${d2.getUTCDate()} de ${mes2} ${d2.getUTCFullYear()}`;
}

/**
 * Marco de las diapositivas que todavía no se rediseñaron (desde la 9):
 * mismo encabezado, fondo crema y tipografía que las 8 nuevas (decisión de
 * Jahnn, 24-sep-2026: "solo el marco" hasta la próxima ronda).
 */
let periodoMarco = "";
function baseSlide(pptx: PptxGenJS, title: string, _sub: string) {
  void _sub;
  return diapositiva(pptx, { titulo: title, periodo: periodoMarco });
}

export async function renderWeeklyKpiDeck(
  data: BoardDeckData,
  /**
   * Portafolio de productos, una tanda de láminas POR SEDE. Opcional a
   * propósito: si no hay ventas cargadas o la consulta falla, el deck
   * sale igual — la reunión de KPIs no se cae porque falte el análisis
   * de carta.
   */
  portafolio?: { sede: string; portafolio: BoardPortfolio }[] | null,
  /** Punto de equilibrio por sede. Opcional por la misma razón. */
  breakeven?: GroupBreakeven | null,
  /**
   * Impacto del programa de incentivos, una lámina por cafetería.
   * Opcional igual que las demás: sin datos del mes anterior el deck
   * sale sin ella en vez de caerse.
   */
  impactoIncentivos?: ImpactoIncentivos[] | null,
  /**
   * Qué se vendió este mes por sede (rotación de Byte): panorama por familia,
   * top 10 por ingresos y ranking de postres. Opcional como las demás.
   */
  productos?: PanoramaSedeDeck[] | null,
): Promise<{ blob: Blob; filename: string }> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 10, height: 5.625 });
  pptx.layout = "WIDE";
  const sub = rangeLabel(data.weekStart, data.weekEnd);

  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  const ctx = contexto(pptx, data.weekStart, data.weekEnd);
  periodoMarco = ctx.periodo;

  // 1 · Portada · 2 · La semana en una mirada · 3 · Ventas del mes (Byte)
  // 4-5 · Detalle de Fonavi y Centro · 6 · Atelier · 7 · Incentivos
  // 8 · Punto de equilibrio. Rediseño del 24-sep-2026 (deck-semanal.ts).
  portada(ctx, data.isCustomRange);
  laSemanaEnUnaMirada(ctx, data);
  if (data.ventas) ventasDelMes(ctx, data.ventas, data.weekEnd);
  data.cafeterias.forEach((cf, i) => detalleCafeteria(ctx, cf, i % 2 === 0 ? "columna" : "fila"));
  if (data.atelier) detalleAtelier(ctx, data.atelier, data.ventas?.find((v) => v.sede.includes("Atelier")) ?? null);
  incentivos(ctx, data.cafeterias);
  if (breakeven) puntoDeEquilibrio(ctx, breakeven);

  // 6b-bis · ¿El bono por ticket se paga solo? Va PEGADA a la lámina de
  // incentivos: primero cuánto se reparte, inmediatamente después qué
  // trajo ese reparto. Separadas, la primera parece un gasto suelto —
  // que fue exactamente la lectura de Kelly en la reunión del 8-sep-2026.
  if (impactoIncentivos && impactoIncentivos.length > 0) {
    impactoIncentivosSlide((t, sb) => baseSlide(pptx, t, sb), sub, impactoIncentivos);
  }

  // 6b-ter · Qué se vendió este mes (rotación de Byte): panorama por familia,
  // top 10 por ingresos y postres. Va ANTES del portafolio: primero qué se
  // vendió, después el veredicto de qué hacer con cada producto.
  if (productos && productos.some((x) => x.panorama)) {
    productosSlides((t, sb) => baseSlide(pptx, t, sb), sub, productos);
  }

  // 6c · Portafolio de productos por sede: qué mantener, promocionar o
  // reemplazar. Después de los KPIs y antes de las conclusiones:
  // primero cómo vamos, después qué vendemos, y recién ahí qué decidimos.
  if (portafolio && portafolio.length > 0) {
    portfolioSlides((t, sb) => baseSlide(pptx, t, sb), sub, portafolio);
  }

  // 7 · Qué mejoró / qué empeoró + KPI rojo priorizado
  const wowSlide = baseSlide(pptx, "¿Qué mejoró, qué empeoró y qué hacemos?", sub);
  let yy = BODY_Y;
  const halfW = (CONTENT_W - 0.3) / 2;
  wowSlide.addText("✓ ¿Qué mejoró?", { x: MX, y: yy, w: halfW, h: 0.35, fontSize: 14, bold: true, color: TRAFFIC_HEX.verde });
  wowSlide.addText("✗ ¿Qué empeoró?", { x: MX + halfW + 0.3, y: yy, w: halfW, h: 0.35, fontSize: 14, bold: true, color: TRAFFIC_HEX.rojo });
  yy += 0.45;
  const mejoras = data.cafeterias.flatMap((cf) => cf.wow.filter((w) => w.direction === "mejoro").map((w) => `${cf.sede} — ${w.text}`));
  const retrocesos = data.cafeterias.flatMap((cf) => cf.wow.filter((w) => w.direction === "empeoro").map((w) => `${cf.sede} — ${w.text}`));
  (mejoras.length ? mejoras : ["Sin cambios relevantes vs el periodo anterior."]).slice(0, 5).forEach((t, i) => {
    wowSlide.addText(t, { x: MX, y: yy + i * 0.42, w: halfW, h: 0.4, fontSize: 10, color: INK });
  });
  (retrocesos.length ? retrocesos : ["Sin retrocesos relevantes."]).slice(0, 5).forEach((t, i) => {
    wowSlide.addText(t, { x: MX + halfW + 0.3, y: yy + i * 0.42, w: halfW, h: 0.4, fontSize: 10, color: INK });
  });
  wowSlide.addShape("roundRect", { x: MX, y: 3.85, w: CONTENT_W, h: 1.4, fill: { color: "FEF2F2" }, line: { color: "FECACA" }, rectRadius: 0.05 });
  wowSlide.addText(
    data.priorityRed
      ? `KPI en rojo priorizado: ${data.priorityRed.sede} — ${data.priorityRed.kpi} (${data.priorityRed.detail})`
      : "Sin KPIs en rojo este periodo 👏 — usar la reunión para consolidar.",
    { x: MX + 0.2, y: 3.95, w: CONTENT_W - 0.4, h: 0.4, fontSize: 13, bold: true, color: TRAFFIC_HEX.rojo },
  );
  wowSlide.addText("Decisión / acción única: ______________________________ · Responsable: ____________ ", {
    x: MX + 0.2, y: 4.45, w: CONTENT_W - 0.4, h: 0.4, fontSize: 11, color: INK,
  });
  wowSlide.addText("Un solo KPI en rojo · una sola acción · un responsable", { x: MX + 0.2, y: 4.9, w: CONTENT_W - 0.4, h: 0.3, fontSize: 9, italic: true, color: GRAY });

  // 8 · Kaizen
  const kz = baseSlide(pptx, "Kaizen: una mejora por semana", sub);
  kz.addText(
    data.priorityRed ? `Foco: ${data.priorityRed.sede} — ${data.priorityRed.kpi} · revisión la próxima reunión` : "Foco libre · revisión la próxima reunión",
    { x: MX, y: 2.3, w: CONTENT_W, h: 0.6, fontSize: 18, bold: true, color: INK, align: "center" },
  );

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  const filename = `KPIs_Yayis_${data.weekStart}_${data.weekEnd}.pptx`;
  return { blob, filename };
}
