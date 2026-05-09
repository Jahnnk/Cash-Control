/**
 * ¿Los batches e893cd2b y 11419fee tienen los MISMOS registros?
 * Si sí → borrar e893cd2b (el más antiguo) resuelve el doble conteo.
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const OLD = "e893cd2b-fd49-472b-a09c-e4b8c680f6e6";
const NEW = "11419fee-e62d-444b-b85a-7700f26782c0";
const MID = "1f7d56a4-c220-48e6-9e9b-b544ffbe6ca2";

async function main() {
  console.log(`\n══ Sumas por batch (Fonavi) ══`);
  const sumas = await sql`
    SELECT
      'expenses' AS tabla,
      import_batch_id::text AS batch_id,
      COUNT(*)::int AS n,
      COALESCE(SUM(amount),0)::float AS suma,
      MIN(date)::text AS desde,
      MAX(date)::text AS hasta
    FROM expenses
    WHERE business_id = 2 AND archived = false
      AND import_batch_id IN (${OLD}::uuid, ${NEW}::uuid, ${MID}::uuid)
    GROUP BY import_batch_id
    UNION ALL
    SELECT
      'bank_income_items', import_batch_id::text,
      COUNT(*)::int, COALESCE(SUM(amount),0)::float,
      MIN(date)::text, MAX(date)::text
    FROM bank_income_items
    WHERE business_id = 2 AND archived = false
      AND import_batch_id IN (${OLD}::uuid, ${NEW}::uuid, ${MID}::uuid)
    GROUP BY import_batch_id
    ORDER BY 1, 2
  `;
  console.table(sumas);

  console.log(`\n══ ¿Existen records en e893cd2b SIN match (date,concept,amount) en 11419fee? ══`);
  const expOnlyOld = await sql`
    SELECT date::text, category, concept, amount::float
    FROM expenses
    WHERE import_batch_id = ${OLD}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM expenses e2
        WHERE e2.import_batch_id = ${NEW}::uuid
          AND e2.date = expenses.date
          AND COALESCE(e2.category,'') = COALESCE(expenses.category,'')
          AND COALESCE(e2.concept,'') = COALESCE(expenses.concept,'')
          AND e2.amount = expenses.amount
      )
    LIMIT 20
  `;
  console.log(`expenses solo-en-OLD (no en NEW): ${expOnlyOld.length}`);
  if (expOnlyOld.length) console.table(expOnlyOld);

  const expOnlyNew = await sql`
    SELECT date::text, category, concept, amount::float
    FROM expenses
    WHERE import_batch_id = ${NEW}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM expenses e2
        WHERE e2.import_batch_id = ${OLD}::uuid
          AND e2.date = expenses.date
          AND COALESCE(e2.category,'') = COALESCE(expenses.category,'')
          AND COALESCE(e2.concept,'') = COALESCE(expenses.concept,'')
          AND e2.amount = expenses.amount
      )
    LIMIT 20
  `;
  console.log(`expenses solo-en-NEW (no en OLD): ${expOnlyNew.length}`);
  if (expOnlyNew.length) console.table(expOnlyNew);

  console.log(`\n══ Mismo análisis para bank_income_items ══`);
  const bcpOnlyOld = await sql`
    SELECT date::text, note, amount::float, is_byte_sale
    FROM bank_income_items
    WHERE import_batch_id = ${OLD}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM bank_income_items b2
        WHERE b2.import_batch_id = ${NEW}::uuid
          AND b2.date = bank_income_items.date
          AND COALESCE(b2.note,'') = COALESCE(bank_income_items.note,'')
          AND b2.amount = bank_income_items.amount
      )
    LIMIT 20
  `;
  console.log(`bcp solo-en-OLD: ${bcpOnlyOld.length}`);
  if (bcpOnlyOld.length) console.table(bcpOnlyOld);

  const bcpOnlyNew = await sql`
    SELECT date::text, note, amount::float, is_byte_sale
    FROM bank_income_items
    WHERE import_batch_id = ${NEW}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM bank_income_items b2
        WHERE b2.import_batch_id = ${OLD}::uuid
          AND b2.date = bank_income_items.date
          AND COALESCE(b2.note,'') = COALESCE(bank_income_items.note,'')
          AND b2.amount = bank_income_items.amount
      )
    LIMIT 20
  `;
  console.log(`bcp solo-en-NEW: ${bcpOnlyNew.length}`);
  if (bcpOnlyNew.length) console.table(bcpOnlyNew);

  console.log(`\n══ Estado del batch MID (rango marzo-mayo) ══`);
  const mid = await sql`
    SELECT 'expenses' AS t, COUNT(*)::int AS n,
           COALESCE(SUM(amount),0)::float AS suma,
           MIN(date)::text AS desde, MAX(date)::text AS hasta
    FROM expenses WHERE import_batch_id = ${MID}::uuid AND archived = false
    UNION ALL
    SELECT 'bank_income_items', COUNT(*)::int, COALESCE(SUM(amount),0)::float,
           MIN(date)::text, MAX(date)::text
    FROM bank_income_items WHERE import_batch_id = ${MID}::uuid AND archived = false
  `;
  console.table(mid);

  console.log(`\n══ Si borramos batch OLD: predicción ══`);
  const pred = await sql`
    SELECT
      (SELECT COALESCE(SUM(amount),0)::float FROM expenses
       WHERE business_id = 2 AND archived = false
         AND date BETWEEN '2026-04-01' AND '2026-04-30'
         AND import_batch_id != ${OLD}::uuid
         AND is_special_loan = false AND is_internal_transfer = false) AS expenses_post,
      (SELECT COALESCE(SUM(amount),0)::float FROM bank_income_items
       WHERE business_id = 2 AND archived = false
         AND date BETWEEN '2026-04-01' AND '2026-04-30'
         AND import_batch_id != ${OLD}::uuid
         AND is_byte_sale = false
         AND is_fonavi_reimbursement = false
         AND is_special_loan = false
         AND is_internal_transfer = false) AS bcp_no_byte_post
  `;
  console.table(pred);
  console.log(`Esperado por Excel: expenses ≈ S/36,770.77, bcp_no_byte ≈ S/342.10`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
