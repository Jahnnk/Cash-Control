/**
 * AUDIT-ONLY (read-only). No INSERT/UPDATE/DELETE.
 * Investigación del bug de Préstamos del Socio.
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function section(title: string, fn: () => Promise<unknown>) {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  " + title);
  console.log("══════════════════════════════════════════════════════════════");
  try {
    const r = await fn();
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.log("ERROR:", e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  await section("1. Schema de bank_income_items", async () => {
    return await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bank_income_items'
      ORDER BY ordinal_position
    `;
  });

  await section("2. Schema de expenses (cols relevantes)", async () => {
    return await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'expenses'
        AND column_name IN ('is_special_loan','is_shared','category','payment_method')
      ORDER BY ordinal_position
    `;
  });

  await section("3. Schema de expense_categories", async () => {
    return await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'expense_categories'
      ORDER BY ordinal_position
    `;
  });

  await section("4. Triggers en bank_income_items / expenses", async () => {
    return await sql`
      SELECT trigger_name, event_manipulation, event_object_table, action_statement
      FROM information_schema.triggers
      WHERE event_object_table IN ('bank_income_items','expenses','daily_records','expense_categories')
    `;
  });

  await section("5. Lista de tablas que existen (busca 'partner_loans' o 'special_loans')", async () => {
    return await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
  });

  await section("6. Categoría 'Préstamos del socio' en expense_categories", async () => {
    return await sql`
      SELECT id, business_id, name, is_active, exclude_from_ebitda, is_special_loan, sort_order, created_at
      FROM expense_categories
      WHERE name ILIKE '%préstamo%' OR name ILIKE '%prestamo%' OR is_special_loan = true
    `;
  });

  await section("7. bank_income_items con is_special_loan=true (préstamos vivos)", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount, note, is_special_loan, is_fonavi_reimbursement, created_at::text
      FROM bank_income_items
      WHERE is_special_loan = true
      ORDER BY created_at DESC LIMIT 20
    `;
  });

  await section("8. expenses con is_special_loan=true (devoluciones vivas)", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount, category, concept, payment_method, is_special_loan, created_at::text
      FROM expenses
      WHERE is_special_loan = true
      ORDER BY created_at DESC LIMIT 20
    `;
  });

  await section("9. Búsqueda por monto sospechoso en bank_income_items", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, note, is_special_loan, is_fonavi_reimbursement, created_at::text
      FROM bank_income_items
      WHERE amount IN (2208.85, 3517.70, 1308.85, 2700.00, 817.70, 1800.00, 408.85)
      ORDER BY created_at DESC
    `;
  });

  await section("10. Búsqueda por monto sospechoso en expenses", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, category, concept, payment_method, is_special_loan, created_at::text
      FROM expenses
      WHERE amount IN (2208.85, 3517.70, 1308.85, 2700.00, 817.70, 1800.00, 408.85)
      ORDER BY created_at DESC
    `;
  });

  await section("11. Búsqueda textual 'préstamo' / 'alquiler' / 'trifásico' en bank_income_items.note", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, note, is_special_loan, created_at::text
      FROM bank_income_items
      WHERE note ILIKE '%préstamo%' OR note ILIKE '%prestamo%'
         OR note ILIKE '%alquiler%' OR note ILIKE '%trifás%' OR note ILIKE '%trifas%'
      ORDER BY created_at DESC LIMIT 30
    `;
  });

  await section("12. Búsqueda textual en expenses.concept", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, category, concept, payment_method, is_special_loan, created_at::text
      FROM expenses
      WHERE concept ILIKE '%préstamo%' OR concept ILIKE '%prestamo%'
         OR concept ILIKE '%alquiler%' OR concept ILIKE '%trifás%' OR concept ILIKE '%trifas%'
      ORDER BY created_at DESC LIMIT 30
    `;
  });

  await section("13. Movimientos recientes de Atelier (últimas 24h) — bank_income_items", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, note, is_special_loan, created_at::text
      FROM bank_income_items
      WHERE business_id = 1 AND created_at > NOW() - INTERVAL '48 hours'
      ORDER BY created_at DESC
    `;
  });

  await section("14. Movimientos recientes de Atelier (últimas 48h) — expenses", async () => {
    return await sql`
      SELECT id::text, business_id, date::text, amount::float, category, concept, payment_method, is_special_loan, created_at::text
      FROM expenses
      WHERE business_id = 1 AND created_at > NOW() - INTERVAL '48 hours'
      ORDER BY created_at DESC LIMIT 30
    `;
  });

  await section("15. Auditoría de eliminaciones recientes (audit_log)", async () => {
    return await sql`
      SELECT id::text, business_id, timestamp::text, action, record_type, date_affected::text, user_note
      FROM audit_log
      WHERE timestamp > NOW() - INTERVAL '48 hours'
      ORDER BY timestamp DESC LIMIT 30
    `;
  });

  await section("16. Soft-delete check: ¿bank_income_items / expenses tienen deleted_at?", async () => {
    return await sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='deleted_at'
    `;
  });

  await section("17. Saldo BCP de Atelier últimos 7 días (sanity)", async () => {
    return await sql`
      SELECT date::text, byte_total::float, bank_income::float, bank_expense::float, bank_balance_real::float
      FROM daily_records
      WHERE business_id = 1
      ORDER BY date DESC LIMIT 7
    `;
  });
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
