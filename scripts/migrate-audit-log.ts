// Migración aislada: crea tabla audit_log + índices.
// 100% no destructivo (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
// Uso: npx tsx scripts/migrate-audit-log.ts

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL no está definida en .env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log("Creando tabla audit_log…");

  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      timestamp TIMESTAMP NOT NULL DEFAULT now(),
      action TEXT NOT NULL,
      record_id UUID NOT NULL,
      record_type TEXT NOT NULL,
      before_data JSONB NOT NULL,
      after_data JSONB,
      user_note TEXT,
      date_affected DATE NOT NULL
    )
  `;

  console.log("Creando índices…");
  await sql`CREATE INDEX IF NOT EXISTS audit_log_record_idx ON audit_log(record_id, record_type)`;
  await sql`CREATE INDEX IF NOT EXISTS audit_log_date_idx   ON audit_log(date_affected)`;
  await sql`CREATE INDEX IF NOT EXISTS audit_log_ts_idx     ON audit_log(timestamp DESC)`;

  const count = (await sql`SELECT COUNT(*)::int as n FROM audit_log`) as { n: number }[];
  const cols = (await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log'
    ORDER BY ordinal_position
  `) as { column_name: string; data_type: string }[];

  console.log("");
  console.log("============================================================");
  console.log(`✅ Tabla audit_log lista`);
  console.log(`✅ Filas: ${count[0].n}`);
  console.log(`✅ Columnas:`);
  for (const c of cols) console.log(`     - ${c.column_name} (${c.data_type})`);
  console.log("============================================================");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
