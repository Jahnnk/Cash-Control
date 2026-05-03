/**
 * Ola 5 — Paso 6 (apoyo): pone DEFAULT 1 a las columnas business_id
 * de las 6 tablas migradas. Esto permite que las server actions
 * existentes (que no pasan businessId aún) sigan funcionando contra
 * Atelier sin cambios. En Ola 7 las actions pasarán businessId
 * explícito y este DEFAULT se vuelve irrelevante.
 *
 * Idempotente: ALTER COLUMN ... SET DEFAULT no falla si ya está seteado.
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
  for (const t of TABLES) {
    console.log(`  → ${t}.business_id SET DEFAULT 1`);
    await sql.query(`ALTER TABLE ${t} ALTER COLUMN business_id SET DEFAULT 1`);
  }
  console.log("\n✅ DEFAULT 1 aplicado a todas las business_id (apunta a Atelier).");
}

main().catch((e) => { console.error("\n❌ ERROR:", e.message); process.exit(1); });
