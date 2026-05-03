/**
 * Ola 5 — Fix Paso 2: el script anterior no detectó los UNIQUEs viejos
 * (driver neon HTTP devuelve array_agg como string, no array). Acá los
 * dropeo explícitamente por nombre real (verificado con _check-uniques.ts).
 *
 * Sin este fix, daily_records.UNIQUE(date) siguen rechazando duplicados
 * sin importar business_id → Fonavi no podría usar una fecha que Atelier
 * ya tenga.
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

const ORPHANS: Array<{ table: string; constraint: string }> = [
  { table: "daily_records", constraint: "daily_records_date_key" },
  { table: "expense_categories", constraint: "expense_categories_name_key" },
  { table: "budgets", constraint: "budgets_category_name_key" },
];

async function main() {
  for (const o of ORPHANS) {
    const exists = await sql`
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = ${o.table}
        AND constraint_name = ${o.constraint}
        AND constraint_type = 'UNIQUE'
    `;
    if ((exists as unknown[]).length === 0) {
      console.log(`  · ${o.table}.${o.constraint} ya no existe`);
      continue;
    }
    console.log(`  → DROP CONSTRAINT ${o.table}.${o.constraint}`);
    await sql.query(`ALTER TABLE ${o.table} DROP CONSTRAINT "${o.constraint}"`);
  }
  console.log("\n✅ UNIQUEs huérfanos eliminados.");
}

main().catch((e) => { console.error("\n❌ ERROR:", e.message); process.exit(1); });
