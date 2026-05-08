/**
 * Agrega is_byte_sale a bank_income_items para distinguir las ventas
 * del Byte (POS-cafetería B2C) de otros ingresos manuales.
 *
 * Idempotente: chequea con information_schema. NO toca payment_method
 * porque la columna es TEXT sin CHECK constraint — acepta 'pos' y
 * 'yape_plin' sin cambios al schema.
 *
 * Backup: snapshot manual "production at 2026-05-05 02:39:26 UTC".
 * Migración additiva / reversible con DROP COLUMN.
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

async function main() {
  // 1) is_byte_sale en bank_income_items
  const pre = await columnExists("bank_income_items", "is_byte_sale");
  if (pre.exists) {
    console.log("· bank_income_items.is_byte_sale ya existe:", pre.row);
  } else {
    console.log("→ ALTER TABLE bank_income_items ADD COLUMN is_byte_sale");
    await sql.query(`ALTER TABLE bank_income_items ADD COLUMN is_byte_sale BOOLEAN NOT NULL DEFAULT false`);
    const post = await columnExists("bank_income_items", "is_byte_sale");
    console.log("  ↳ post:", post.row);
  }

  // 2) Verificar payment_method (debe ser TEXT sin CHECK constraint)
  const pm = await columnExists("bank_income_items", "payment_method");
  console.log("\n· bank_income_items.payment_method:", pm.row);

  const checks = await sql`
    SELECT cc.constraint_name, cc.check_clause
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = cc.constraint_name
    WHERE ccu.table_name = 'bank_income_items' AND ccu.column_name = 'payment_method'
  `;
  console.log("· CHECK constraints sobre payment_method:", JSON.stringify(checks, null, 2));

  // 3) Distribución actual
  const dist = await sql`
    SELECT is_byte_sale, COUNT(*)::int AS n FROM bank_income_items GROUP BY is_byte_sale
    ORDER BY is_byte_sale
  `;
  console.log("\nDistribución is_byte_sale:", JSON.stringify(dist, null, 2));

  console.log("\n✅ Migración OK.");
}

main().catch((e) => { console.error("❌ ERROR:", e.message); process.exit(1); });
