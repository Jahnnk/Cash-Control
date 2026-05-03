/**
 * Ola 7 — eliminación del DEFAULT 1 transitorio sobre business_id.
 *
 * En Ola 5 se puso DEFAULT 1 a nivel SQL para que las server actions
 * legacy (que aún no pasaban businessId) siguieran funcionando contra
 * Atelier por defecto. En Ola 7 todas las actions filtran/insertan con
 * businessId explícito (resuelto vía middleware → header → cookie).
 *
 * Este script quita el default. A partir de aquí cualquier INSERT que
 * omita business_id falla con NOT NULL violation — eso es lo correcto:
 * obliga a que toda escritura sea consciente del negocio activo.
 *
 * Verificación previa: 0 filas con business_id NULL en cada tabla
 * (debería ser imposible porque la columna es NOT NULL, pero
 * verificamos por paranoia).
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

const TABLES = [
  "daily_records",
  "expenses",
  "bank_income_items",
  "expense_categories",
  "budgets",
  "audit_log",
];

async function main() {
  console.log("→ Verificación previa: ninguna fila con business_id NULL");
  for (const t of TABLES) {
    const r = await sql.query(`SELECT COUNT(*)::int AS n FROM ${t} WHERE business_id IS NULL`);
    const n = (r as Array<{ n: number }>)[0].n;
    if (n !== 0) {
      throw new Error(`${t}: ${n} filas con business_id NULL. ABORTANDO drop default.`);
    }
    console.log(`  · ${t}: 0 NULLs ✓`);
  }

  console.log("\n→ DROP DEFAULT en business_id");
  for (const t of TABLES) {
    console.log(`  → ${t}.business_id DROP DEFAULT`);
    await sql.query(`ALTER TABLE ${t} ALTER COLUMN business_id DROP DEFAULT`);
  }

  console.log("\n✅ DEFAULT eliminado. Toda escritura ahora requiere businessId explícito.");
}

main().catch((e) => { console.error("\n❌ ERROR:", e.message); process.exit(1); });
