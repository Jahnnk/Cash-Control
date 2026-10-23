/**
 * El mes de productos (product_month_sales) = la suma de sus periodos (rotacion_efectiva). No es "use server": la usan el
 * import (product-sales-import.ts) y la reconstrucción de meses viejos.
 *
 * Se agrupa por producto Y por canal de Atelier (22-oct-2026): «Y-» = vendido a las cafeterías, «P-» = a otros B2B
 * (lib/product-matching.ts, canalDeLinea). El matching quita el prefijo para encontrar el producto del catálogo, y antes el
 * mes sumaba los dos canales en una sola fila (oct-2026: «P-BROWNIE» con 235 u = 181 P + 54 Y). Ahora son dos filas con el
 * mismo producto y su canal en `channel`. Las cafeterías no usan prefijos: para ellas no cambia nada.
 */

/** Firma mínima del template tag de @neondatabase/serverless. */
type SqlTag = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>;

/** La sentencia que llena el mes (el DELETE previo lo hace quien la llama, dentro de su transacción). */
export function insertarMesDeProductos(sql: SqlTag, bId: number, month: string, batchId: string) {
  return sql`
    INSERT INTO product_month_sales
      (business_id, product_id, product_name_raw, month, units, revenue, source, import_batch_id, channel)
    SELECT ${bId}, product_id, MIN(product_name_raw), ${month}, SUM(units), SUM(revenue), 'byte', ${batchId}, canal
    FROM (
      SELECT r.product_id, r.product_name_raw, r.units, r.revenue,
             CASE WHEN r.limpio LIKE 'Y-%' OR r.limpio LIKE 'Y -%' THEN 'Y'
                  WHEN r.limpio LIKE 'P-%' OR r.limpio LIKE 'P -%' THEN 'P' END AS canal
      FROM (
        SELECT x.*, upper(trim(regexp_replace(x.product_name_raw, '^\\s*\\[[^]]*\\]\\s*', ''))) AS limpio
        FROM rotacion_efectiva(${bId}, ${month}) x
      ) r
    ) y
    GROUP BY product_id, canal, CASE WHEN product_id IS NULL THEN lower(product_name_raw) ELSE NULL END
  `;
}
