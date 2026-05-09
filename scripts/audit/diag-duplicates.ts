/**
 * Diagnóstico Prompt 16: confirmar duplicación x2 en expenses y
 * bank_income_items para Fonavi (business_id = 2) en abril 2026.
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function section(title: string, fn: () => Promise<unknown>) {
  console.log(`\n══════ ${title} ══════`);
  const r = await fn();
  if (Array.isArray(r)) console.table(r);
  else console.log(JSON.stringify(r, null, 2));
}

async function main() {
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  PROMPT 16 — DIAGNÓSTICO DE DUPLICADOS  ║`);
  console.log(`╚══════════════════════════════════════════╝`);

  await section("1. expenses Fonavi abril 2026 - duplicados por (date,category,concept,amount)", () =>
    sql`
      SELECT date::text, category, concept, amount::float, COUNT(*)::int AS num_copias
      FROM expenses
      WHERE business_id = 2 AND archived = false
        AND date BETWEEN '2026-04-01' AND '2026-04-30'
      GROUP BY date, category, concept, amount
      HAVING COUNT(*) > 1
      ORDER BY date, amount DESC
      LIMIT 30
    `
  );

  await section("2. bank_income_items Fonavi abril 2026 - duplicados", () =>
    sql`
      SELECT date::text, note, amount::float, is_byte_sale, COUNT(*)::int AS num_copias
      FROM bank_income_items
      WHERE business_id = 2 AND archived = false
        AND date BETWEEN '2026-04-01' AND '2026-04-30'
      GROUP BY date, note, amount, is_byte_sale
      HAVING COUNT(*) > 1
      ORDER BY date, amount DESC
      LIMIT 30
    `
  );

  await section("3. Inventario expenses Fonavi por mes", () =>
    sql`
      SELECT TO_CHAR(date, 'YYYY-MM') AS mes,
             COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE imported_from_excel = true)::int AS importados,
             COUNT(*) FILTER (WHERE imported_from_excel = false OR imported_from_excel IS NULL)::int AS manuales,
             COUNT(DISTINCT import_batch_id)::int AS batches_distintos,
             COALESCE(SUM(amount),0)::float AS suma
      FROM expenses
      WHERE business_id = 2 AND archived = false
      GROUP BY 1 ORDER BY 1
    `
  );

  await section("4. Inventario bank_income_items Fonavi por mes", () =>
    sql`
      SELECT TO_CHAR(date, 'YYYY-MM') AS mes,
             COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE imported_from_excel = true)::int AS importados,
             COUNT(*) FILTER (WHERE imported_from_excel = false OR imported_from_excel IS NULL)::int AS manuales,
             COUNT(*) FILTER (WHERE is_byte_sale = true)::int AS byte_sales,
             COUNT(DISTINCT import_batch_id)::int AS batches_distintos,
             COALESCE(SUM(amount),0)::float AS suma
      FROM bank_income_items
      WHERE business_id = 2 AND archived = false
      GROUP BY 1 ORDER BY 1
    `
  );

  await section("5. Suma esperada vs actual (Fonavi abril 2026)", () =>
    sql`
      SELECT
        (SELECT COALESCE(SUM(amount),0)::float FROM expenses
         WHERE business_id = 2 AND archived = false
           AND date BETWEEN '2026-04-01' AND '2026-04-30'
           AND is_special_loan = false AND is_internal_transfer = false) AS expenses_total,
        (SELECT COALESCE(SUM(amount),0)::float FROM bank_income_items
         WHERE business_id = 2 AND archived = false
           AND date BETWEEN '2026-04-01' AND '2026-04-30'
           AND is_byte_sale = false
           AND is_fonavi_reimbursement = false
           AND is_special_loan = false
           AND is_internal_transfer = false) AS bcp_no_byte
    `
  );

  await section("6. Import batches Fonavi (todos)", () =>
    sql`
      SELECT
        ib.id::text,
        TO_CHAR(ib.imported_at, 'YYYY-MM-DD HH24:MI:SS') AS at,
        ib.sheet_name,
        ib.date_range_start::text AS rs,
        ib.date_range_end::text AS re,
        (SELECT COUNT(*)::int FROM expenses e WHERE e.import_batch_id = ib.id) AS exp_count,
        (SELECT COUNT(*)::int FROM bank_income_items bi WHERE bi.import_batch_id = ib.id) AS bcp_count
      FROM import_batches ib
      WHERE ib.business_id = 2
      ORDER BY ib.imported_at
    `
  );

  await section("7. Atelier (id=1) — control: ¿tiene duplicados?", () =>
    sql`
      WITH dup AS (
        SELECT date, category, concept, amount, COUNT(*) AS n
        FROM expenses WHERE business_id = 1 AND archived = false
        GROUP BY 1,2,3,4 HAVING COUNT(*) > 1
      )
      SELECT (SELECT COUNT(*)::int FROM dup) AS pares_duplicados
    `
  );

  await section("8. Centro (id=3) — control", () =>
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM expenses WHERE business_id = 3) AS expenses,
        (SELECT COUNT(*)::int FROM bank_income_items WHERE business_id = 3) AS bcp_items
    `
  );

  await section("9. Distribución de imported_from_excel en Fonavi abril", () =>
    sql`
      SELECT 'expenses' AS tabla,
             imported_from_excel,
             COUNT(*)::int AS n,
             COALESCE(SUM(amount),0)::float AS sum
      FROM expenses
      WHERE business_id = 2 AND archived = false
        AND date BETWEEN '2026-04-01' AND '2026-04-30'
      GROUP BY imported_from_excel
      UNION ALL
      SELECT 'bank_income_items',
             imported_from_excel,
             COUNT(*)::int,
             COALESCE(SUM(amount),0)::float
      FROM bank_income_items
      WHERE business_id = 2 AND archived = false
        AND date BETWEEN '2026-04-01' AND '2026-04-30'
      GROUP BY imported_from_excel
      ORDER BY 1, 2
    `
  );
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
