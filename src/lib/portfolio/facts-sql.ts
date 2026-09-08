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

/**
 * El cliente de Neon, visto solo como una plantilla etiquetada. Se pide
 * por parámetro (no se importa) para que este archivo no abra conexiones
 * y siga siendo probable sin base de datos.
 */
type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

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
  /** Marca de dirección: acompañamiento/extra, no plato final. */
  es_acompanamiento: boolean;
};

export type FilaHistoria = {
  product_id: string | null;
  product_name_raw: string;
  month: string;
  units: number;
  revenue: number;
};

/**
 * La consulta de ventas del mes con su costo. UNA sola copia.
 *
 * Existía dos veces —en `portfolio-story.ts` (pantalla de Productos) y
 * en `board-portfolio.ts` (Deck de la reunión)— y las dos copias se
 * separaron: el 05-sep-2026 se agregó `es_acompanamiento` solo a la
 * primera. Resultado: la pantalla de Productos respetaba la marca de
 * acompañamiento y el Deck la ignoraba, así que el huevo revuelto y la
 * humita volvían a aparecer en "qué mantener, promocionar o reemplazar"
 * aunque Jahnn los había marcado. La misma pregunta con dos respuestas
 * según la pantalla, que es justo lo que este archivo existe para
 * evitar.
 *
 * El cast `as FilaVenta[]` no protegía nada: TypeScript no ve adentro
 * del SQL, así que la columna faltante llegaba como `undefined` y
 * `es_acompanamiento === true` daba false para TODO el catálogo, en
 * silencio. Por eso ahora la consulta vive acá y las dos pantallas la
 * llaman; agregar una columna es un cambio en un solo lugar.
 *
 * El cliente `sql` entra por parámetro para que este archivo siga sin
 * abrir conexiones: se puede probar sin base de datos.
 */
export async function consultarVentasDelMes(
  sql: SqlTag,
  businessId: number,
  month: string,
): Promise<FilaVenta[]> {
  // Costo: snapshot más reciente ≤ mes de la venta; si la venta es
  // ANTERIOR al primer snapshot (historia pre-jul-2026, cuando no
  // existía el pricing engine), cae al más antiguo y queda marcada como
  // aproximada. El pasado no se reescribe con precios de hoy.
  const filas = await sql`
    SELECT s.product_id::text AS product_id,
           s.product_name_raw,
           s.units::float AS units,
           s.revenue::float AS revenue,
           p.name AS catalog_name,
           p.category,
           c.unit_cogs::float AS unit_cogs,
           c.list_price::float AS list_price,
           c.target_margin_pct::float AS target_margin_pct,
           c.month AS cost_month,
           COALESCE(p.es_acompanamiento, false) AS es_acompanamiento
    FROM product_month_sales s
    LEFT JOIN products p ON p.id = s.product_id
    LEFT JOIN LATERAL (
      SELECT unit_cogs, list_price, target_margin_pct, month
      FROM product_cost_snapshots cs
      WHERE cs.product_id = s.product_id
      ORDER BY (cs.month <= s.month) DESC,
               (CASE WHEN cs.month <= s.month THEN cs.month END) DESC NULLS LAST,
               cs.month ASC
      LIMIT 1
    ) c ON true
    WHERE s.business_id = ${businessId} AND s.month = ${month} AND s.source = 'byte'
    ORDER BY s.revenue DESC
  `;
  return filas as FilaVenta[];
}

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
      // Si CUALQUIERA de las filas fusionadas está marcada, el
      // producto fusionado queda marcado: es el mismo plato en las dos
      // sedes, y basta con que dirección lo haya marcado en una.
      if (r.es_acompanamiento === true) ya.isAccompaniment = true;
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
      isAccompaniment: r.es_acompanamiento === true,
      key,
      // El sufijo se quita SIEMPRE: en la lámina de Fonavi, escribir
      // "Cappuccino (Fonavi)" es repetir el título de la diapositiva.
      name: nombreDeCarta(r.catalog_name, r.product_name_raw),
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
