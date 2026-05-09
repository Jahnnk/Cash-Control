/**
 * Soporte para importación desde Excel:
 *   - bank_income_items.is_refund            BOOLEAN DEFAULT false
 *   - bank_income_items.imported_from_excel  BOOLEAN DEFAULT false
 *   - bank_income_items.import_batch_id      UUID
 *   - expenses.imported_from_excel           BOOLEAN DEFAULT false
 *   - expenses.import_batch_id               UUID
 *   - import_batches table: registro de cada importación
 *
 * Idempotente. Additiva. Reversible con DROP COLUMN/TABLE.
 * Backup vigente: snapshot Neon "pre-reset-fonavi-centro-01-abril".
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

async function tableExists(name: string): Promise<boolean> {
  const r = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=${name}
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

async function main() {
  // bank_income_items
  await addColumn("bank_income_items", "is_refund", "ADD COLUMN is_refund BOOLEAN NOT NULL DEFAULT false");
  await addColumn("bank_income_items", "imported_from_excel", "ADD COLUMN imported_from_excel BOOLEAN NOT NULL DEFAULT false");
  await addColumn("bank_income_items", "import_batch_id", "ADD COLUMN import_batch_id UUID");

  // expenses
  await addColumn("expenses", "imported_from_excel", "ADD COLUMN imported_from_excel BOOLEAN NOT NULL DEFAULT false");
  await addColumn("expenses", "import_batch_id", "ADD COLUMN import_batch_id UUID");

  // import_batches table
  if (await tableExists("import_batches")) {
    console.log("· tabla import_batches ya existe");
  } else {
    console.log("→ CREATE TABLE import_batches");
    await sql.query(`
      CREATE TABLE import_batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id INTEGER NOT NULL REFERENCES businesses(id),
        imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        imported_by TEXT,
        file_name TEXT,
        sheet_name TEXT,
        date_range_start DATE,
        date_range_end DATE,
        movements_count INTEGER,
        ingresos_count INTEGER,
        egresos_count INTEGER,
        initial_cash_applied NUMERIC(12,2),
        initial_bcp_applied NUMERIC(12,2),
        archived_count INTEGER,
        status TEXT NOT NULL DEFAULT 'completed',
        rollback_available BOOLEAN DEFAULT true,
        notes TEXT
      )
    `);
  }

  // Índices
  if (!(await indexExists("idx_import_batches_business_date"))) {
    console.log("→ CREATE INDEX idx_import_batches_business_date");
    await sql.query(`
      CREATE INDEX idx_import_batches_business_date
      ON import_batches(business_id, date_range_start, date_range_end)
    `);
  }
  if (!(await indexExists("idx_bank_income_imported"))) {
    console.log("→ CREATE INDEX idx_bank_income_imported");
    await sql.query(`
      CREATE INDEX idx_bank_income_imported
      ON bank_income_items(business_id, date) WHERE imported_from_excel = true
    `);
  }
  if (!(await indexExists("idx_expenses_imported"))) {
    console.log("→ CREATE INDEX idx_expenses_imported");
    await sql.query(`
      CREATE INDEX idx_expenses_imported
      ON expenses(business_id, date) WHERE imported_from_excel = true
    `);
  }

  // Verificación post
  const dist = await sql`
    SELECT 'bank_income_items' AS t, imported_from_excel, COUNT(*)::int AS n FROM bank_income_items GROUP BY imported_from_excel
    UNION ALL
    SELECT 'expenses', imported_from_excel, COUNT(*)::int FROM expenses GROUP BY imported_from_excel
    ORDER BY t, imported_from_excel
  `;
  console.log("\nDistribución imported_from_excel:", JSON.stringify(dist, null, 2));
  console.log("\n✅ Migración OK.");
}

main().catch((e) => { console.error("❌ ERROR:", e.message); process.exit(1); });
