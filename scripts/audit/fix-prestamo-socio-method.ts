/**
 * Corrección puntual: el préstamo del socio S/3,517.70 del 30/04 quedó
 * con payment_method='transferencia' (default de la migración) cuando
 * en realidad fue entregado en efectivo (con eso se pagaron alquiler
 * y trifásico al propietario en cash el mismo día).
 *
 * Verifica con SELECT primero, luego UPDATE puntual por id, luego SELECT
 * post para confirmar.
 *
 * Si el SELECT pre encuentra ≠ 1 fila o un id distinto al esperado, ABORTA.
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const TARGET_ID = "9a1ee975-9cf4-4d52-bcf7-8b64e18ff29a";
const EXPECTED_AMOUNT = 3517.70;
const EXPECTED_DATE = "2026-04-30";

async function main() {
  // Pre-check
  const pre = await sql`
    SELECT id::text, business_id, date::text, amount::float, payment_method, is_special_loan, note
    FROM bank_income_items
    WHERE id = ${TARGET_ID}
  `;
  console.log("[PRE]", JSON.stringify(pre, null, 2));

  const rows = pre as Array<{
    id: string; business_id: number; date: string; amount: number;
    payment_method: string; is_special_loan: boolean; note: string;
  }>;
  if (rows.length !== 1) {
    console.error("ABORT: expected 1 row, got", rows.length);
    process.exit(1);
  }
  const r = rows[0];
  if (
    r.business_id !== 1 ||
    Math.round(r.amount * 100) !== Math.round(EXPECTED_AMOUNT * 100) ||
    r.date !== EXPECTED_DATE ||
    r.is_special_loan !== true
  ) {
    console.error("ABORT: row does not match safety constraints", r);
    process.exit(1);
  }
  if (r.payment_method === "efectivo") {
    console.log("· Ya está en 'efectivo' — no-op, salgo.");
    process.exit(0);
  }

  console.log(`→ UPDATE id=${TARGET_ID} payment_method='${r.payment_method}' → 'efectivo'`);
  await sql`
    UPDATE bank_income_items
    SET payment_method = 'efectivo'
    WHERE id = ${TARGET_ID}
      AND business_id = 1
      AND amount = ${EXPECTED_AMOUNT}
      AND date = ${EXPECTED_DATE}
      AND is_special_loan = true
  `;

  // Post-check
  const post = await sql`
    SELECT id::text, payment_method, amount::float, date::text, is_special_loan
    FROM bank_income_items WHERE id = ${TARGET_ID}
  `;
  console.log("[POST]", JSON.stringify(post, null, 2));

  console.log("\n✅ Préstamo del socio corregido a payment_method='efectivo'.");
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
