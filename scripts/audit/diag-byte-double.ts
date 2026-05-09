import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
async function s(t: string, fn: () => Promise<unknown>) {
  console.log("\n=== " + t + " ===");
  console.log(JSON.stringify(await fn(), null, 2));
}
(async () => {
  await s("1. byte_sales_daily totales por business_id", async () =>
    await sql`
      SELECT business_id, COUNT(*)::int AS dias,
             MIN(date)::text AS first, MAX(date)::text AS last,
             SUM(total)::float AS suma_total
      FROM byte_sales_daily WHERE business_id IN (2, 3) GROUP BY business_id ORDER BY business_id
    `);

  await s("2. Por mes para Fonavi (id=2)", async () =>
    await sql`
      SELECT date_trunc('month', date)::date::text AS mes, COUNT(*)::int AS dias,
             SUM(efectivo)::float AS efectivo, SUM(yape_plin)::float AS yape,
             SUM(pos)::float AS pos, SUM(total)::float AS total
      FROM byte_sales_daily WHERE business_id = 2
      GROUP BY mes ORDER BY mes
    `);

  await s("3. Huérfanos pre-abril en Fonavi", async () =>
    await sql`
      SELECT date::text, total::float, imported_from_excel, import_batch_id::text
      FROM byte_sales_daily WHERE business_id = 2 AND date < '2026-04-01'
      ORDER BY date
    `);

  await s("4. bank_income_items con is_byte_sale=true Fonavi abril 2026", async () =>
    await sql`
      SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::float AS suma
      FROM bank_income_items
      WHERE business_id = 2 AND is_byte_sale = true AND archived = false
        AND date BETWEEN '2026-04-01' AND '2026-04-30'
    `);

  await s("5. Suma actual del card Ventas Byte (Fonavi abril 2026, lógica BUGGY)", async () =>
    await sql`
      SELECT
        COALESCE((SELECT SUM(byte_total) FROM daily_records
          WHERE business_id = 2 AND date BETWEEN '2026-04-01' AND '2026-04-30' AND archived = false), 0)::float AS atelier_byte_total,
        COALESCE((SELECT SUM(amount) FROM bank_income_items
          WHERE business_id = 2 AND date BETWEEN '2026-04-01' AND '2026-04-30'
            AND is_byte_sale = true AND archived = false), 0)::float AS bank_income_byte,
        COALESCE((SELECT SUM(efectivo + yape_plin + pos) FROM byte_sales_daily
          WHERE business_id = 2 AND date BETWEEN '2026-04-01' AND '2026-04-30'), 0)::float AS byte_sales_daily
    `);

  await s("6. Atelier byte_total abril 2026 (NO debe cambiar tras el fix)", async () =>
    await sql`
      SELECT COALESCE(SUM(byte_total), 0)::float AS atelier_byte_abril
      FROM daily_records
      WHERE business_id = 1 AND date BETWEEN '2026-04-01' AND '2026-04-30' AND archived = false
    `);

  await s("7. Centro byte_sales_daily", async () =>
    await sql`
      SELECT COUNT(*)::int AS n FROM byte_sales_daily WHERE business_id = 3
    `);

  await s("8. ¿Existe huérfanos en tips_pending o rounding_alerts pre-abril?", async () =>
    await sql`
      SELECT 'tips' AS t, COUNT(*)::int AS n FROM tips_pending WHERE business_id = 2 AND date < '2026-04-01'
      UNION ALL
      SELECT 'alerts', COUNT(*)::int FROM rounding_alerts WHERE business_id = 2 AND date < '2026-04-01'
    `);
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
