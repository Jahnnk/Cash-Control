/**
 * PIC · El colector de hechos del portafolio. UNA sola copia del SQL.
 *
 * Vivía dentro de `portfolio-story.ts` y servía a una sede. Cuando el
 * Deck de la reunión pidió el portafolio del GRUPO (las 3 sedes juntas,
 * pedido de Jahnn 24-ago-2026) había dos caminos: copiar la consulta o
 * parametrizarla. Copiar el SQL del costo es exactamente el error que
 * produjo el saldo de banco negativo — tres copias de la misma cadena y
 * solo una con la guarda. Así que se parametrizó.
 *
 * ─── La regla del costo (no tocar sin entender) ───
 *
 * El costo de un mes es el snapshot más reciente CON month ≤ el mes de
 * la venta: el pasado no se reescribe con precios de hoy. Si la venta
 * es ANTERIOR al primer snapshot (historia previa a jul-2026, cuando no
 * existía el pricing engine), cae al snapshot más antiguo y se marca
 * `costApproximated` — se dice, no se esconde.
 *
 * ─── Cuando son varias sedes ───
 *
 * Un mismo producto vendido en Fonavi y en Centro es UN producto para
 * el análisis de carta: sus unidades y su venta se suman. El costo es
 * el mismo (sale de la receta, no de la sede). Lo que NO se suma son
 * sedes con el producto sin mapear: esos entran por nombre normalizado,
 * igual que en una sola sede.
 */

import { normalizeProductName } from "@/lib/product-matching";
import { monthLabel } from "@/lib/utils";
import type { PortfolioFacts, ProductFacts } from "./types";

/** La forma de una fila de venta con su costo resuelto. */
export type FilaVenta = {
  product_id: string | null;
  product_name_raw: string;
  units: number;
  revenue: number;
  catalog_name: string | null;
  category: string | null;
  unit_cogs: number | null;
  list_price: number | null;
  target_margin_pct: number | null;
  cost_month: string | null;
};

export type FilaHistoria = {
  product_id: string | null;
  product_name_raw: string;
  month: string;
  units: number;
  revenue: number;
};

/** Clave estable: el producto del catálogo, o su nombre normalizado. */
export const keyDeProducto = (pid: string | null, raw: string): string =>
  pid || `raw:${normalizeProductName(raw)}`;

/**
 * El MISMO producto de carta, sin importar en qué sede se catalogó.
 *
 * El catálogo trae 130 productos de Fonavi con el sufijo "(Fonavi)" que
 * son el mismo plato que en Centro, con la misma receta y el mismo
 * costo: "Cappuccino" y "Cappuccino (Fonavi)" cuestan S/3.73 los dos.
 * Analizados por separado, "Empanada Mixta" aparece dos veces con la
 * mitad de las unidades cada una — y con la mitad de sus unidades ningún
 * producto llega al umbral de popularidad. El cuadrante saldría mal.
 *
 * Por eso, cuando se analiza la carta de la CADENA, la clave es el
 * nombre sin el sufijo de sede. NO se usa para el análisis de una sola
 * sede, donde ese producto es uno solo y no hay nada que fusionar.
 */
const SUFIJO_SEDE = /\s*\((fonavi|centro|atelier)\)\s*$/i;

/**
 * Byte no borra un producto: lo renombra a
 * "[ELIMINADO 2026-05-05 12:02:16] JUGO DE FRESA Y ARANDANOS".
 *
 * Esos productos ya no están en la carta, así que su venta cae a cero y
 * salen disparados en el ranking de caídas — "el producto que más cayó"
 * resultaba ser uno que Jahnn mismo mandó sacar hace tres meses. Ocupan
 * el lugar de una caída real que sí merece la conversación.
 *
 * Se excluyen del análisis (12 nombres, S/10,191 históricos). No se
 * borra nada: la venta sigue en la base, solo no entra al portafolio.
 */
const ELIMINADO_EN_BYTE = /^\s*\[eliminado\b/i;

export const estaEliminadoEnByte = (nombre: string): boolean =>
  ELIMINADO_EN_BYTE.test(nombre ?? "");

export const keyDeCarta = (nombreCatalogo: string | null, raw: string): string =>
  `carta:${normalizeProductName((nombreCatalogo || raw).replace(SUFIJO_SEDE, ""))}`;

/** El nombre a mostrar, ya sin el sufijo de sede. */
export const nombreDeCarta = (nombreCatalogo: string | null, raw: string): string =>
  (nombreCatalogo || raw).replace(SUFIJO_SEDE, "").trim();

/**
 * Arma los hechos a partir de filas ya consultadas. Puro: sin SQL, para
 * poder probarlo — sobre todo la fusión de sedes, que es lo nuevo.
 */
export function armarFacts(input: {
  scope: { businessId: number; businessName: string };
  month: string;
  ventas: FilaVenta[];
  historia: FilaHistoria[];
  historyMonths: string[];
  /**
   * true = varias sedes: el mismo plato catalogado por sede se une en
   * uno solo (ver keyDeCarta). false = una sede, cada producto es uno.
   */
  fusionarSedes?: boolean;
}): PortfolioFacts | null {
  const ventas = input.ventas.filter((v) => !estaEliminadoEnByte(v.product_name_raw));
  const historia = input.historia.filter((h) => !estaEliminadoEnByte(h.product_name_raw));
  if (ventas.length === 0) return null;

  const claveVenta = (r: FilaVenta) =>
    input.fusionarSedes
      ? keyDeCarta(r.catalog_name, r.product_name_raw)
      : keyDeProducto(r.product_id, r.product_name_raw);
  // La historia no trae el nombre del catálogo, solo el crudo; para
  // fusionar basta el crudo, que es el que Byte exporta igual en las dos
  // sedes (el sufijo lo pone el catálogo, no el reporte).
  const claveHistoria = (h: FilaHistoria) =>
    input.fusionarSedes
      ? keyDeCarta(null, h.product_name_raw)
      : keyDeProducto(h.product_id, h.product_name_raw);

  // Historia por producto. Un mismo producto puede llegar en varias
  // filas del mismo mes (una por sede, o por nombres distintos que
  // apuntan al mismo catálogo): se acumulan en el mismo punto.
  const historyByKey = new Map<string, Map<string, { units: number; revenue: number }>>();
  for (const h of historia) {
    const k = claveHistoria(h);
    if (!historyByKey.has(k)) historyByKey.set(k, new Map());
    const porMes = historyByKey.get(k)!;
    const prev = porMes.get(h.month) ?? { units: 0, revenue: 0 };
    porMes.set(h.month, {
      units: prev.units + (Number(h.units) || 0),
      revenue: Math.round((prev.revenue + (Number(h.revenue) || 0)) * 100) / 100,
    });
  }

  // Ventas del mes, fusionando el mismo producto entre sedes.
  const porKey = new Map<string, ProductFacts>();
  for (const r of ventas) {
    const key = claveVenta(r);
    const units = Number(r.units) || 0;
    const revenue = Number(r.revenue) || 0;
    const ya = porKey.get(key);
    if (ya) {
      // Al fusionar, el costo se pondera por unidades. Normalmente son
      // idénticos (misma receta), pero si difieren no se elige uno al
      // azar: el promedio ponderado es el costo real de lo vendido.
      const cogsNuevo = r.unit_cogs != null ? Number(r.unit_cogs) : null;
      if (ya.unitCogs != null && cogsNuevo != null && ya.units + units > 0) {
        ya.unitCogs =
          Math.round(((ya.unitCogs * ya.units + cogsNuevo * units) / (ya.units + units)) * 10000) / 10000;
      } else if (ya.unitCogs == null && cogsNuevo != null) {
        ya.unitCogs = cogsNuevo;
      }
      ya.units += units;
      ya.revenue = Math.round((ya.revenue + revenue) * 100) / 100;
      ya.avgPrice = ya.units > 0 ? Math.round((ya.revenue / ya.units) * 100) / 100 : 0;
      continue;
    }
    const costMonth = r.cost_month || null;
    porKey.set(key, {
      productId: r.product_id || null,
      key,
      name: input.fusionarSedes
        ? nombreDeCarta(r.catalog_name, r.product_name_raw)
        : r.catalog_name || r.product_name_raw,
      category: r.category || null,
      units,
      revenue,
      avgPrice: units > 0 ? Math.round((revenue / units) * 100) / 100 : 0,
      unitCogs: r.unit_cogs != null ? Number(r.unit_cogs) : null,
      listPrice: r.list_price != null ? Number(r.list_price) : null,
      targetMarginPct: r.target_margin_pct != null ? Number(r.target_margin_pct) : null,
      // El snapshot es POSTERIOR al mes vendido: aproximación honesta.
      costApproximated: costMonth !== null && costMonth > input.month,
      history: [],
    });
  }

  const products = [...porKey.values()].map((p) => {
    const porMes = historyByKey.get(p.key);
    const history = porMes
      ? [...porMes.entries()]
          .map(([month, v]) => ({ month, units: v.units, revenue: v.revenue }))
          .sort((a, b) => a.month.localeCompare(b.month))
      : [{ month: input.month, units: p.units, revenue: p.revenue }];
    return { ...p, history };
  });
  products.sort((a, b) => b.revenue - a.revenue);

  return {
    scope: input.scope,
    month: input.month,
    monthLabel: monthLabel(input.month),
    generatedAt: new Date().toISOString(),
    products,
    historyMonths: input.historyMonths,
  };
}
