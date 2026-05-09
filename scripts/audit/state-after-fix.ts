/**
 * Estado actual de byte_sales_daily / tips_pending / rounding_alerts
 * para Fonavi y Centro tras aplicar el fix del parser. Para decidir
 * el plan de cleanup.
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const businesses = [
    { id: 2, name: "Fonavi" },
    { id: 3, name: "Centro" },
  ];

  for (const b of businesses) {
    console.log(`\n========== ${b.name} (id=${b.id}) ==========`);

    const bsd = await sql`
      SELECT MIN(date)::text AS min_date, MAX(date)::text AS max_date,
             COUNT(*)::int AS dias, COALESCE(SUM(total),0)::float AS total_sum
      FROM byte_sales_daily WHERE business_id = ${b.id}
    `;
    console.log(`byte_sales_daily total:`, bsd[0]);

    const bsdByMonth = await sql`
      SELECT TO_CHAR(date, 'YYYY-MM') AS mes, COUNT(*)::int AS dias,
             COALESCE(SUM(total),0)::float AS total
      FROM byte_sales_daily WHERE business_id = ${b.id}
      GROUP BY 1 ORDER BY 1
    `;
    console.log(`Por mes:`); console.table(bsdByMonth);

    const tips = await sql`
      SELECT TO_CHAR(date, 'YYYY-MM') AS mes, COUNT(*)::int AS n,
             COALESCE(SUM(amount),0)::float AS sum
      FROM tips_pending
      WHERE business_id = ${b.id} AND imported_from_excel = true
      GROUP BY 1 ORDER BY 1
    `;
    console.log(`tips_pending (imported):`); console.table(tips);

    const ra = await sql`
      SELECT TO_CHAR(date, 'YYYY-MM') AS mes, COUNT(*)::int AS n
      FROM rounding_alerts WHERE business_id = ${b.id}
      GROUP BY 1 ORDER BY 1
    `;
    console.log(`rounding_alerts:`); console.table(ra);

    const batches = await sql`
      SELECT id::text, source, sheet_name, range_start::text, range_end::text, created_at::text
      FROM import_batches
      WHERE business_id = ${b.id}
      ORDER BY created_at DESC LIMIT 10
    `;
    console.log(`Últimos import_batches:`); console.table(batches);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
