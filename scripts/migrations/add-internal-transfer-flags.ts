/**
 * Agrega soporte para transferencias internas Efectivo↔BCP en bank_income_items y expenses.
 *
 *   is_internal_transfer  BOOLEAN NOT NULL DEFAULT false
 *   transfer_pair_id      UUID nullable
 *
 * Idempotente: revisa con information_schema antes de ALTER.
 * Snapshot de respaldo: "production at 2026-05-05 02:39:26 UTC (manual) - never expires".
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function columnExists(table: string, col: string): Promise<{ exists: boolean; row?: Record<string, unknown> }> {
  const r = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${col}
  `;
  const rows = r as Record<string, unknown>[];
  return { exists: rows.length > 0, row: rows[0] };
}

async function add(table: string, col: string, ddl: string) {
  const before = await columnExists(table, col);
  if (before.exists) {
    console.log(`· ${table}.${col} ya existe — abort para no doble-aplicar`, before.row);
    if (before.row && (before.row.data_type === "boolean" || before.row.data_type === "uuid")) {
      console.log("  ↳ tipo coincide, continúo");
      return;
    }
    throw new Error(`${table}.${col} existe con tipo distinto al esperado: ${JSON.stringify(before.row)}`);
  }
  console.log(`→ ALTER TABLE ${table} ADD COLUMN ${col}`);
  await sql.query(`ALTER TABLE ${table} ${ddl}`);
  const after = await columnExists(table, col);
  console.log(`  ↳ post:`, after.row);
}

async function main() {
  await add("bank_income_items", "is_internal_transfer", "ADD COLUMN is_internal_transfer BOOLEAN NOT NULL DEFAULT false");
  await add("bank_income_items", "transfer_pair_id", "ADD COLUMN transfer_pair_id UUID");
  await add("expenses", "is_internal_transfer", "ADD COLUMN is_internal_transfer BOOLEAN NOT NULL DEFAULT false");
  await add("expenses", "transfer_pair_id", "ADD COLUMN transfer_pair_id UUID");

  // Distribución de filas existentes
  const dist = await sql`
    SELECT 'bank_income_items' AS tabla, is_internal_transfer, COUNT(*)::int AS n
    FROM bank_income_items GROUP BY is_internal_transfer
    UNION ALL
    SELECT 'expenses', is_internal_transfer, COUNT(*)::int
    FROM expenses GROUP BY is_internal_transfer
    ORDER BY tabla, is_internal_transfer
  `;
  console.log("\nDistribución post-migración:", JSON.stringify(dist, null, 2));
  console.log("\n✅ Migración OK.");
}

main().catch((e) => { console.error("❌ ERROR:", e.message); process.exit(1); });
