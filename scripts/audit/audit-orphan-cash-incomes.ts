/**
 * AUDIT-ONLY (read-only). Búsqueda ampliada de los 2 registros huérfanos.
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function section(title: string, fn: () => Promise<unknown>) {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  " + title);
  console.log("══════════════════════════════════════════════════════════════");
  const r = await fn();
  console.log(JSON.stringify(r, null, 2));
}

async function main() {
  await section("1. Match exacto monto+fecha 04/05/2026", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, payment_method, note, client_id::text, is_special_loan, is_fonavi_reimbursement, created_at::text
      FROM bank_income_items WHERE date = '2026-05-04' AND amount IN (2037.00, 1.00)
    `;
  });

  await section("2. Por monto cercano a 2037 ± 10 (cualquier fecha)", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, payment_method, note, is_special_loan, created_at::text
      FROM bank_income_items WHERE amount BETWEEN 2027 AND 2047
      ORDER BY created_at DESC LIMIT 20
    `;
  });

  await section("3. Por monto cercano a 1.00 ± 0.5 (cualquier fecha)", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, payment_method, note, is_special_loan, created_at::text
      FROM bank_income_items WHERE amount BETWEEN 0.5 AND 1.5
      ORDER BY created_at DESC LIMIT 20
    `;
  });

  await section("4. Por concepto 'fonavi' / 'servicios compartidos'", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, payment_method, note, is_special_loan, created_at::text
      FROM bank_income_items
      WHERE note ILIKE '%fonavi%' OR note ILIKE '%servicios compartidos%' OR note ILIKE '%servicios%compartido%'
      ORDER BY created_at DESC LIMIT 30
    `;
  });

  await section("5. Movimientos recientes en bank_income_items últimas 24h (cualquier negocio)", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, payment_method, note, is_special_loan, is_fonavi_reimbursement, created_at::text
      FROM bank_income_items
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
    `;
  });

  await section("6. Movimientos recientes en bank_income_items últimas 12h Atelier", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, payment_method, note, is_special_loan, is_fonavi_reimbursement, created_at::text
      FROM bank_income_items
      WHERE business_id = 1 AND created_at > NOW() - INTERVAL '12 hours'
      ORDER BY created_at DESC
    `;
  });

  await section("7. Saldo BCP Atelier últimos 5 días", async () => {
    return await sql`
      SELECT date::text, byte_total::float, bank_income::float, bank_expense::float, bank_balance_real::float
      FROM daily_records WHERE business_id = 1
      ORDER BY date DESC LIMIT 5
    `;
  });
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
