/**
 * KPIs · Renderer del deck de la Reunión Semanal (renderer tonto).
 *
 * Estructura (rediseño de Jahnn, 24-sep-2026; gastos el 25-sep): 18 diapositivas.
 *   1 · Portada                       10 · Categorías que más pesan
 *   2 · La semana en una mirada       11 · Piso mensual y pagos grandes
 *   3 · Ventas del mes (Byte)         12 · Qué rota más en cada sede
 *   4 · Fonavi: detalle de KPIs       13 · Los 10 que más facturan
 *   5 · Centro: detalle de KPIs       14 · Fonavi: ranking por categoría
 *   6 · Atelier: detalle B2B          15 · Centro: ranking por categoría
 *   7 · Meta de ticket e incentivos   16 · Atelier: ranking por categoría
 *   8 · Punto de equilibrio           17 · Regla 80/20
 *   9 · ¿A dónde se fue la plata?     18 · Candidatos a reemplazo
 *
 * Salieron (pedido de Jahnn): "¿el bono por ticket se paga solo?", las
 * láminas de portafolio, "qué mejoró / qué empeoró" y Kaizen. Los productos
 * se resumieron como se ven en Grupo → Productos.
 * Acepta rangos personalizados (no solo la semana dom→sáb).
 */

import PptxGenJS from "pptxgenjs";
import type { BoardDeckData } from "@/app/actions/kpis";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import type { PanoramaDeSede, CandidatosReemplazo, OchentaVeinteSede } from "@/app/actions/productos-panorama";
import { contexto, portada, laSemanaEnUnaMirada, ventasDelMes, detalleCafeteria, detalleAtelier, incentivos, puntoDeEquilibrio } from "./deck-semanal";
import { rotacionPorSede, topFacturacion, categoriasDeSede, reglaOchentaVeinteSlide, candidatosReemplazo } from "./deck-productos";
import { aDondeSeFueLaPlata, categoriasQueMasPesan, pisoYPagosGrandes } from "./deck-gastos";
import type { InformeGastos } from "@/app/actions/informe-gastos";
import { FONT } from "./deck-diseno";

export async function renderWeeklyKpiDeck(
  data: BoardDeckData,
  /**
   * Punto de equilibrio por sede. Opcional a propósito (como los demás
   * extras): si la consulta falla, el deck sale igual sin esa lámina.
   */
  breakeven?: GroupBreakeven | null,
  /** Qué se vendió este mes por sede (rotación de Byte). */
  productos?: PanoramaDeSede[] | null,
  /** Candidatos a reemplazo de Fonavi y Centro. */
  candidatos?: CandidatosReemplazo | null,
  /** Regla 80/20 por sede (mes y últimos 3 meses). */
  ochentaVeinte?: OchentaVeinteSede[] | null,
  /** A dónde se fue la plata: último mes cerrado por sede. */
  gastos?: InformeGastos | null,
): Promise<{ blob: Blob; filename: string }> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 10, height: 5.625 });
  pptx.layout = "WIDE";
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  const ctx = contexto(pptx, data.weekStart, data.weekEnd);

  portada(ctx, data.isCustomRange);
  laSemanaEnUnaMirada(ctx, data);
  if (data.ventas) ventasDelMes(ctx, data.ventas, data.weekEnd);
  data.cafeterias.forEach((cf) => detalleCafeteria(ctx, cf));
  if (data.atelier) detalleAtelier(ctx, data.atelier, data.ventas?.find((v) => v.sede.includes("Atelier")) ?? null);
  incentivos(ctx, data.cafeterias);
  if (breakeven) puntoDeEquilibrio(ctx, breakeven);
  if (gastos && gastos.sedes.length > 0) {
    aDondeSeFueLaPlata(ctx, gastos);
    categoriasQueMasPesan(ctx, gastos);
    pisoYPagosGrandes(ctx, gastos);
  }

  if (productos && productos.some((x) => x.panorama)) {
    rotacionPorSede(ctx, productos);
    topFacturacion(ctx, productos);
    // Una lámina de categorías por sede, en el orden del dashboard.
    for (const id of [2, 3, 1]) {
      const sd = productos.find((x) => x.businessId === id);
      if (sd) categoriasDeSede(ctx, sd, candidatos ?? null);
    }
  }
  if (ochentaVeinte) reglaOchentaVeinteSlide(ctx, ochentaVeinte);
  if (candidatos) candidatosReemplazo(ctx, candidatos);

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  const filename = `KPIs_Yayis_${data.weekStart}_${data.weekEnd}.pptx`;
  return { blob, filename };
}
