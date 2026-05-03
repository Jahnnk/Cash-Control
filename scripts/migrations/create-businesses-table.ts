/**
 * Ola 5 — Paso 1: crea la tabla businesses con 3 filas seed.
 * Idempotente: usa CREATE TABLE IF NOT EXISTS y ON CONFLICT DO NOTHING.
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("→ Creando tabla businesses...");
  await sql.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id          SERIAL PRIMARY KEY,
      code        VARCHAR(20) UNIQUE NOT NULL,
      name        VARCHAR(100) NOT NULL,
      description TEXT,
      active      BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("  ✓ tabla creada (o ya existía)");

  console.log("→ Insertando 3 negocios seed...");
  await sql.query(`
    INSERT INTO businesses (code, name, description) VALUES
      ('atelier', 'Yayi''s Atelier', 'Centro de producción y B2B'),
      ('fonavi',  'Yayi''s Fonavi',  'Cafetería Fonavi'),
      ('centro',  'Yayi''s Centro',  'Cafetería Centro')
    ON CONFLICT (code) DO NOTHING
  `);

  const rows = await sql`SELECT id, code, name FROM businesses ORDER BY id`;
  console.log("  ✓ businesses en BD:");
  for (const r of rows as Array<{ id: number; code: string; name: string }>) {
    console.log(`    [${r.id}] ${r.code} — ${r.name}`);
  }

  // Sanity: Atelier debe tener id=1 para alinearse con el UPDATE de migración
  const atelier = (rows as Array<{ id: number; code: string }>).find((r) => r.code === "atelier");
  if (!atelier || atelier.id !== 1) {
    throw new Error(`Esperaba atelier con id=1, recibí: ${JSON.stringify(atelier)}. Abortar.`);
  }
  console.log("\n✅ Atelier tiene id=1 (consistente con UPDATE posterior).");
}

main().catch((e) => { console.error(e); process.exit(1); });
