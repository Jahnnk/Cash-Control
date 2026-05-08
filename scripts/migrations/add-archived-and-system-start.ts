/**
 * Migración para soportar reset por negocio:
 *   - bank_income_items.archived BOOLEAN NOT NULL DEFAULT false
 *   - expenses.archived BOOLEAN NOT NULL DEFAULT false
 *   - daily_records.archived BOOLEAN NOT NULL DEFAULT false
 *   - businesses.system_start_date DATE
 *   - businesses.initial_bcp_balance NUMERIC(12,2) DEFAULT 0
 *   - businesses.initial_cash_balance NUMERIC(12,2) DEFAULT 0
 *   - businesses.initial_balance_date DATE
 *   - índices parciales archived=false
 *
 * Idempotente. Additiva, reversible con DROP COLUMN/INDEX.
 * Snapshot Neon previo: "pre-reset-fonavi-centro-01-abril".
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function colExists(table: string, col: string): Promise<boolean> {
  const r = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=${table} AND column_name=${col}
  `;
  return (r as unknown[]).length > 0;
}

async function indexExists(name: string): Promise<boolean> {
  const r = await sql`SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=${name}`;
  return (r as unknown[]).length > 0;
}

async function addColumn(table: string, col: string, ddl: string) {
  if (await colExists(table, col)) {
    console.log(`· ${table}.${col} ya existe`);
    return;
  }
  console.log(`→ ALTER TABLE ${table} ${ddl}`);
  await sql.query(`ALTER TABLE ${table} ${ddl}`);
}

async function ensureIndex(name: string, ddl: string) {
  if (await indexExists(name)) {
    console.log(`· index ${name} ya existe`);
    return;
  }
  console.log(`→ ${ddl}`);
  await sql.query(ddl);
}

async function main() {
  // archived flags
  await addColumn("bank_income_items", "archived", "ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false");
  await addColumn("expenses", "archived", "ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false");
  await addColumn("daily_records", "archived", "ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false");

  // configuración inicial por negocio
  await addColumn("businesses", "system_start_date", "ADD COLUMN system_start_date DATE");
  await addColumn("businesses", "initial_bcp_balance", "ADD COLUMN initial_bcp_balance NUMERIC(12,2) NOT NULL DEFAULT 0");
  await addColumn("businesses", "initial_cash_balance", "ADD COLUMN initial_cash_balance NUMERIC(12,2) NOT NULL DEFAULT 0");
  await addColumn("businesses", "initial_balance_date", "ADD COLUMN initial_balance_date DATE");

  // índices parciales (queries de movimientos vigentes)
  await ensureIndex(
    "idx_bank_income_archived_false",
    `CREATE INDEX idx_bank_income_archived_false ON bank_income_items(business_id, date) WHERE archived = false`
  );
  await ensureIndex(
    "idx_expenses_archived_false",
    `CREATE INDEX idx_expenses_archived_false ON expenses(business_id, date) WHERE archived = false`
  );
  await ensureIndex(
    "idx_daily_records_archived_false",
    `CREATE INDEX idx_daily_records_archived_false ON daily_records(business_id, date) WHERE archived = false`
  );

  // Verificación post: distribución
  const dist = await sql`
    SELECT 'bank_income_items' AS t, archived, COUNT(*)::int AS n FROM bank_income_items GROUP BY archived
    UNION ALL
    SELECT 'expenses', archived, COUNT(*)::int FROM expenses GROUP BY archived
    UNION ALL
    SELECT 'daily_records', archived, COUNT(*)::int FROM daily_records GROUP BY archived
    ORDER BY t, archived
  `;
  console.log("\nDistribución archived:", JSON.stringify(dist, null, 2));

  const cfg = await sql`
    SELECT id, code, system_start_date::text AS start_date,
           initial_bcp_balance::float AS init_bcp,
           initial_cash_balance::float AS init_cash,
           initial_balance_date::text AS init_date
    FROM businesses ORDER BY id
  `;
  console.log("\nbusinesses (config inicial):", JSON.stringify(cfg, null, 2));

  console.log("\n✅ Migración OK.");
}

main().catch((e) => { console.error("❌ ERROR:", e.message); process.exit(1); });
