/**
 * Reconstruye product_month_sales de Atelier separando los canales Y- (cafeterías) y P- (B2B) (22-oct-2026).
 * Misma sentencia que el import (lib/productos/mes-productos-sql.ts). Respaldo local en scripts/audit/respaldos.
 * Uso: npx tsx scripts/audit/2026-10-22-mes-productos-por-canal.ts [--apply]
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { writeFileSync } from "node:fs";
import { insertarMesDeProductos } from "../../src/lib/productos/mes-productos-sql";
const sql = neon(process.env.DATABASE_URL!);
const ATELIER = 1;
(async () => {
  const apply = process.argv.includes("--apply");
  const antes = await sql`SELECT * FROM product_month_sales WHERE business_id = ${ATELIER} AND source = 'byte' ORDER BY month`;
  writeFileSync("scripts/audit/respaldos/product_month_sales_atelier_2026-10-22.json", JSON.stringify(antes));
  const meses = (await sql`SELECT month, MIN(import_batch_id::text) b, COUNT(*) n, SUM(units)::float u, SUM(revenue)::float r FROM product_month_sales WHERE business_id = ${ATELIER} AND source = 'byte' GROUP BY 1 ORDER BY 1`) as any[];
  console.log(`respaldo: ${antes.length} filas. ${apply ? "APLICANDO" : "SIMULACIÓN"}`);
  for (const m of meses) {
    if (apply) {
      await sql.transaction([
        sql`DELETE FROM product_month_sales WHERE business_id = ${ATELIER} AND month = ${m.month} AND source = 'byte'`,
        insertarMesDeProductos(sql as never, ATELIER, m.month, m.b) as never,
      ]);
    }
    const d = (await sql`SELECT COUNT(*) n, SUM(units)::float u, SUM(revenue)::float r, COUNT(*) FILTER (WHERE channel='Y') y, COUNT(*) FILTER (WHERE channel='P') p FROM product_month_sales WHERE business_id = ${ATELIER} AND month = ${m.month} AND source = 'byte'`)[0] as any;
    console.log(`${m.month}: antes ${m.n} filas / ${m.u} u / S/${m.r.toFixed(2)}  →  ahora ${d.n} filas (Y ${d.y}, P ${d.p}) / ${d.u} u / S/${Number(d.r).toFixed(2)}`);
  }
})();
