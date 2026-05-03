/**
 * Migración Ola 4 — DROP TABLE bank_balance
 *
 * La tabla nunca se escribió desde la UI nueva. La fuente de verdad
 * real es daily_records.bank_balance_real. Las 3 funciones que la
 * leían (bank.ts) eran huérfanas (sin caller). Backup completo
 * pre-cambio en backups/backup-antes-ola-4-*.sql.
 *
 * Uso: npx tsx scripts/migrations/drop-bank-balance.ts
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL no está definida");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  // Verificar que la tabla existe
  const exists = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bank_balance'
  `;
  if (exists.length === 0) {
    console.log("Tabla bank_balance ya no existe. Nada que hacer.");
    return;
  }

  // Conteo previo (para confirmar que el backup la cubrió)
  const count = await sql`SELECT COUNT(*) as n FROM bank_balance`;
  console.log(`Tabla bank_balance: ${(count[0] as { n: string }).n} registros antes del DROP.`);
  console.log("Backup recomendado: backups/backup-antes-ola-4-*.sql");
  console.log("");

  console.log("Ejecutando DROP TABLE bank_balance...");
  await sql`DROP TABLE bank_balance`;

  // Verificar
  const after = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bank_balance'
  `;
  if (after.length === 0) {
    console.log("✅ Tabla bank_balance eliminada correctamente.");
  } else {
    console.error("❌ La tabla sigue existiendo. Algo falló.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
