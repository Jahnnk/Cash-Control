/**
 * Diagnóstico read-only del card "Ventas Byte" S/0.00 en Fonavi/Centro
 * post-import. Determina si el bug es del parser (no setea flag) o
 * del reporte (no filtra correctamente).
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function section(title: string, fn: () => Promise<unknown>) {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  " + title);
  console.log("══════════════════════════════════════════════════════");
  console.log(JSON.stringify(await fn(), null, 2));
}

async function main() {
  await section("1. is_byte_sale en imports Fonavi+Centro (NO archivados)", async () => {
    return await sql`
      SELECT
        business_id,
        COUNT(*) FILTER (WHERE is_byte_sale = true) AS byte_count,
        COUNT(*) FILTER (WHERE is_byte_sale = false OR is_byte_sale IS NULL) AS no_byte_count,
        COALESCE(SUM(amount) FILTER (WHERE is_byte_sale = true), 0)::float AS byte_sum,
        COUNT(*) AS total
      FROM bank_income_items
      WHERE business_id IN (2, 3) AND archived = false AND imported_from_excel = true
      GROUP BY business_id
      ORDER BY business_id
    `;
  });

  await section("2. category='VENTAS' (sin importar is_byte_sale)", async () => {
    return await sql`
      SELECT business_id, category, COUNT(*)::int AS n,
             COALESCE(SUM(amount), 0)::float AS total
      FROM bank_income_items
      WHERE business_id IN (2, 3) AND archived = false
        AND UPPER(TRIM(category)) = 'VENTAS'
      GROUP BY business_id, category
      ORDER BY business_id
    `;
  });

  await section("3. Muestra de 5 filas con UPPER(category)='VENTAS'", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, category, amount::float,
             payment_method, is_byte_sale, note
      FROM bank_income_items
      WHERE business_id IN (2, 3) AND archived = false
        AND UPPER(TRIM(category)) = 'VENTAS'
      ORDER BY business_id, date
      LIMIT 5
    `;
  });

  await section("4. ¿bank_income_items tiene columna 'category' siquiera?", async () => {
    return await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='bank_income_items'
        AND column_name IN ('category', 'note', 'is_byte_sale')
      ORDER BY ordinal_position
    `;
  });

  await section("5. Muestra 5 filas de ventas Byte = true en Fonavi", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, payment_method,
             is_byte_sale, note
      FROM bank_income_items
      WHERE business_id = 2 AND archived = false AND is_byte_sale = true
      ORDER BY date ASC LIMIT 5
    `;
  });

  await section("6. Distribución payment_method en bank_income_items Fonavi", async () => {
    return await sql`
      SELECT payment_method, COUNT(*)::int AS n,
             COALESCE(SUM(amount), 0)::float AS total,
             COUNT(*) FILTER (WHERE is_byte_sale = true) AS byte_count
      FROM bank_income_items
      WHERE business_id = 2 AND archived = false AND imported_from_excel = true
      GROUP BY payment_method
      ORDER BY total DESC
    `;
  });

  await section("7. Imports a Atelier (verificar que NO toca)", async () => {
    return await sql`
      SELECT COUNT(*)::int AS n FROM bank_income_items
      WHERE business_id = 1 AND imported_from_excel = true
    `;
  });
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
