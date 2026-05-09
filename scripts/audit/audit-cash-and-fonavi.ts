/**
 * AUDIT-ONLY (read-only).
 * Diagnostica:
 *   1. Por qué Saldo en efectivo del Dashboard (S/-2,312.45) difiere
 *      del Neto del Registro Diario (S/1,503.25 al 04/05).
 *   2. Por qué CxC Fonavi sigue en S/1,308.76 si Atelier ya recibió el
 *      pago de S/2,037.00 hoy.
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function section(title: string, fn: () => Promise<unknown>) {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  " + title);
  console.log("══════════════════════════════════════════════════════════════");
  console.log(JSON.stringify(await fn(), null, 2));
}

const ATELIER = 1;

async function main() {
  await section("1. Acumulado histórico de cash flows (cómo lo calcula getCashBalance)", async () => {
    return await sql`
      SELECT
        (SELECT COALESCE(SUM(amount), 0)::float FROM bank_income_items
          WHERE business_id = ${ATELIER} AND payment_method = 'efectivo' AND is_special_loan = false) AS in_cash_manual,
        (SELECT COALESCE(SUM(amount), 0)::float FROM expenses
          WHERE business_id = ${ATELIER} AND payment_method = 'efectivo' AND is_special_loan = false) AS out_cash,
        (SELECT COALESCE(SUM(byte_cash_physical), 0)::float FROM daily_records
          WHERE business_id = ${ATELIER}) AS byte_cash_physical_total,
        (SELECT COALESCE(SUM(byte_cash_sale), 0)::float FROM daily_records
          WHERE business_id = ${ATELIER}) AS byte_cash_sale_total
    `;
  });

  await section("2. Distribución de payment_method en bank_income_items Atelier", async () => {
    return await sql`
      SELECT payment_method, COUNT(*)::int AS n, SUM(amount)::float AS total
      FROM bank_income_items WHERE business_id = ${ATELIER} AND is_special_loan = false
      GROUP BY payment_method ORDER BY payment_method
    `;
  });

  await section("3. Distribución de payment_method en expenses Atelier", async () => {
    return await sql`
      SELECT payment_method, COUNT(*)::int AS n, SUM(amount)::float AS total
      FROM expenses WHERE business_id = ${ATELIER} AND is_special_loan = false
      GROUP BY payment_method ORDER BY total DESC
    `;
  });

  await section("4. byte_cash_physical y byte_cash_sale por día (últimos 10 con valor)", async () => {
    return await sql`
      SELECT date::text, byte_cash_physical::float, byte_cash_sale::float, byte_cash_sale_method, byte_total::float
      FROM daily_records
      WHERE business_id = ${ATELIER} AND (byte_cash_physical > 0 OR byte_cash_sale > 0)
      ORDER BY date DESC LIMIT 10
    `;
  });

  await section("5. CxC Fonavi (fonavi_receivables abiertas)", async () => {
    return await sql`
      SELECT id::text, expense_id::text, amount_due::float, amount_collected::float,
             (amount_due - amount_collected)::float AS pending,
             status, created_at::text, collected_at::text
      FROM fonavi_receivables
      WHERE status != 'collected'
      ORDER BY created_at DESC
    `;
  });

  await section("6. Detalle de los gastos compartidos vivos (Atelier)", async () => {
    return await sql`
      SELECT e.id::text, e.date::text, e.category, e.concept, e.amount::float, e.atelier_amount::float, e.fonavi_amount::float, e.is_shared
      FROM expenses e
      WHERE e.business_id = ${ATELIER} AND e.is_shared = true
      ORDER BY e.created_at DESC LIMIT 10
    `;
  });

  await section("7. Ingresos en efectivo del 04/05 (Atelier)", async () => {
    return await sql`
      SELECT id::text, amount::float, payment_method, note, client_id::text, is_fonavi_reimbursement, created_at::text
      FROM bank_income_items
      WHERE business_id = ${ATELIER} AND date = '2026-05-04'
      ORDER BY created_at ASC
    `;
  });
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
