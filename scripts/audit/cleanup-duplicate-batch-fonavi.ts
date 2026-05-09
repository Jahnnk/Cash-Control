/**
 * Cleanup Prompt 16: borrar el batch duplicado e893cd2b de Fonavi.
 *
 * El batch e893cd2b ("Ing&Gtos Abr26", 12:51:39) y 11419fee
 * ("Ing&Gtos Abr26 + Control de VTAS-ABR26", 16:02:17) son
 * idénticos en `expenses` (151 records, S/36,770.77 cada uno).
 * En `bank_income_items` el NEW tiene 4 records adicionales del
 * 01/04 que el OLD no captó. Cero records solo-en-OLD.
 *
 * → Borrar TODO lo del batch OLD (e893cd2b) elimina el doble conteo
 *   sin perder información (lo borrado está duplicado en NEW).
 *
 * Uso:
 *   npx tsx scripts/audit/cleanup-duplicate-batch-fonavi.ts          # dry-run
 *   npx tsx scripts/audit/cleanup-duplicate-batch-fonavi.ts --apply  # ejecuta
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const OLD_BATCH = "e893cd2b-fd49-472b-a09c-e4b8c680f6e6";
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`\n🔧 Cleanup duplicate batch Fonavi`);
  console.log(`   Batch a borrar: ${OLD_BATCH}`);
  console.log(`   Modo: ${APPLY ? "🔴 APPLY" : "🟢 DRY-RUN"}\n`);

  // Estado ANTES
  console.log(`══ ANTES ══`);
  const before = await sql`
    SELECT 'expenses' AS t, COUNT(*)::int AS n,
           COALESCE(SUM(amount),0)::float AS suma
    FROM expenses
    WHERE business_id = 2 AND archived = false
      AND date BETWEEN '2026-04-01' AND '2026-04-30'
      AND is_special_loan = false AND is_internal_transfer = false
    UNION ALL
    SELECT 'bank_income_items (no-byte)', COUNT(*)::int, COALESCE(SUM(amount),0)::float
    FROM bank_income_items
    WHERE business_id = 2 AND archived = false
      AND date BETWEEN '2026-04-01' AND '2026-04-30'
      AND is_byte_sale = false AND is_fonavi_reimbursement = false
      AND is_special_loan = false AND is_internal_transfer = false
    UNION ALL
    SELECT 'bank_income_items (byte_sale)', COUNT(*)::int, COALESCE(SUM(amount),0)::float
    FROM bank_income_items
    WHERE business_id = 2 AND archived = false
      AND date BETWEEN '2026-04-01' AND '2026-04-30'
      AND is_byte_sale = true
  `;
  console.table(before);

  // Lo que se va a borrar
  console.log(`\n══ A BORRAR (batch ${OLD_BATCH}) ══`);
  const toDelete = await sql`
    SELECT 'expenses' AS t, COUNT(*)::int AS n,
           COALESCE(SUM(amount),0)::float AS suma
    FROM expenses WHERE import_batch_id = ${OLD_BATCH}::uuid
    UNION ALL
    SELECT 'bank_income_items', COUNT(*)::int, COALESCE(SUM(amount),0)::float
    FROM bank_income_items WHERE import_batch_id = ${OLD_BATCH}::uuid
  `;
  console.table(toDelete);

  // Estado DESPUÉS (predicción)
  console.log(`\n══ PREDICCIÓN POST-DELETE ══`);
  const predicted = await sql`
    SELECT
      (SELECT COALESCE(SUM(amount),0)::float FROM expenses
       WHERE business_id = 2 AND archived = false
         AND date BETWEEN '2026-04-01' AND '2026-04-30'
         AND is_special_loan = false AND is_internal_transfer = false
         AND import_batch_id != ${OLD_BATCH}::uuid) AS expenses_post,
      (SELECT COALESCE(SUM(amount),0)::float FROM bank_income_items
       WHERE business_id = 2 AND archived = false
         AND date BETWEEN '2026-04-01' AND '2026-04-30'
         AND is_byte_sale = false AND is_fonavi_reimbursement = false
         AND is_special_loan = false AND is_internal_transfer = false
         AND import_batch_id != ${OLD_BATCH}::uuid) AS bcp_no_byte_post
  `;
  console.table(predicted);
  console.log(`Esperado:  expenses ≈ S/36,770.77,  bcp_no_byte ≈ S/342.10`);

  // Pares duplicados que quedarían post-delete (validación)
  if (!APPLY) {
    console.log(`\n🟢 DRY-RUN — sin mutaciones. Re-correr con --apply.\n`);
    return;
  }

  // ─── EJECUTAR ──────────────────────────────────────────────
  console.log(`\n🔴 APPLY — borrando registros del batch ${OLD_BATCH}...`);

  const delExp = await sql`
    DELETE FROM expenses
    WHERE import_batch_id = ${OLD_BATCH}::uuid
      AND business_id = 2
    RETURNING id
  `;
  console.log(`✓ Borrados expenses: ${delExp.length}`);

  const delBcp = await sql`
    DELETE FROM bank_income_items
    WHERE import_batch_id = ${OLD_BATCH}::uuid
      AND business_id = 2
    RETURNING id
  `;
  console.log(`✓ Borrados bank_income_items: ${delBcp.length}`);

  // Marcar batch como rolled_back
  await sql`
    UPDATE import_batches
    SET status = 'rolled_back',
        notes = COALESCE(notes,'') || ' [rolled-back-prompt-16: duplicado de 11419fee]'
    WHERE id = ${OLD_BATCH}::uuid
  `;
  console.log(`✓ Batch marcado como rolled_back`);

  console.log(`\n══ DESPUÉS ══`);
  const after = await sql`
    SELECT 'expenses' AS t, COUNT(*)::int AS n,
           COALESCE(SUM(amount),0)::float AS suma
    FROM expenses
    WHERE business_id = 2 AND archived = false
      AND date BETWEEN '2026-04-01' AND '2026-04-30'
      AND is_special_loan = false AND is_internal_transfer = false
    UNION ALL
    SELECT 'bank_income_items (no-byte)', COUNT(*)::int, COALESCE(SUM(amount),0)::float
    FROM bank_income_items
    WHERE business_id = 2 AND archived = false
      AND date BETWEEN '2026-04-01' AND '2026-04-30'
      AND is_byte_sale = false AND is_fonavi_reimbursement = false
      AND is_special_loan = false AND is_internal_transfer = false
    UNION ALL
    SELECT 'bank_income_items (byte_sale)', COUNT(*)::int, COALESCE(SUM(amount),0)::float
    FROM bank_income_items
    WHERE business_id = 2 AND archived = false
      AND date BETWEEN '2026-04-01' AND '2026-04-30'
      AND is_byte_sale = true
  `;
  console.table(after);

  // Validar 0 duplicados
  const dups = await sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT 1 FROM expenses
      WHERE business_id = 2 AND archived = false
        AND date BETWEEN '2026-04-01' AND '2026-04-30'
      GROUP BY date, category, concept, amount
      HAVING COUNT(*) > 1
    ) sub
  `;
  console.log(`\nPares duplicados restantes en expenses Fonavi abril: ${dups[0].n}`);

  console.log(`\n✅ Cleanup completado.\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
