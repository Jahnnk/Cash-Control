/**
 * Agrega payment_method a bank_income_items (Yayi's Cash Control).
 *
 * Razón: el sistema solo modelaba ingresos al banco. Cuando un cliente
 * paga en efectivo (caso real 04/05/2026: pago de Fonavi S/2,037), no
 * había forma de diferenciarlo del bancario. Esta columna replica el
 * patrón ya usado en `expenses.payment_method`.
 *
 * Idempotente: chequea con information_schema antes de ALTER.
 * Backup: snapshot manual "production at 2026-05-05 02:39:26 UTC".
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function main() {
  // Paso A — verificar pre-condición
  const pre = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bank_income_items'
      AND column_name = 'payment_method'
  `;
  console.log("[A] columnas existentes con name=payment_method:", JSON.stringify(pre, null, 2));

  if ((pre as unknown[]).length > 0) {
    console.log("· payment_method ya existe — abort para no doble-aplicar");
    process.exit(0);
  }

  // Paso B — aplicar ALTER
  console.log("[B] ALTER TABLE bank_income_items ADD COLUMN payment_method ...");
  await sql.query(
    `ALTER TABLE bank_income_items ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'transferencia'`
  );

  // Paso C — verificar post-condición (definición de la columna)
  const post = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bank_income_items'
      AND column_name = 'payment_method'
  `;
  console.log("[C] definición post-ALTER:", JSON.stringify(post, null, 2));

  // Paso D — verificar valor en filas existentes
  const distribution = await sql`
    SELECT payment_method, COUNT(*)::int AS n
    FROM bank_income_items
    GROUP BY payment_method
    ORDER BY payment_method
  `;
  console.log("[D] distribución de payment_method (filas existentes):", JSON.stringify(distribution, null, 2));

  console.log("\n✅ Migración OK.");
}

main().catch((e) => { console.error("❌ ERROR:", e.message); process.exit(1); });
