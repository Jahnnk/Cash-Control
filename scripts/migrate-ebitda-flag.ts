// Migración aditiva: expense_categories.exclude_from_ebitda
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const TO_EXCLUDE = ["Ss Bancarios", "Préstamos", "SUNAT"];

async function main() {
  await sql`ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS exclude_from_ebitda BOOLEAN NOT NULL DEFAULT false`;

  for (const name of TO_EXCLUDE) {
    const r = (await sql`
      UPDATE expense_categories SET exclude_from_ebitda = true
      WHERE name = ${name} AND exclude_from_ebitda = false
      RETURNING id
    `) as { id: string }[];
    console.log(`  ${name}: ${r.length} fila(s) actualizada(s)`);
  }

  const all = (await sql`
    SELECT name, exclude_from_ebitda FROM expense_categories
    ORDER BY exclude_from_ebitda DESC, name
  `) as { name: string; exclude_from_ebitda: boolean }[];

  console.log("\n✅ Estado de exclude_from_ebitda:");
  for (const c of all) console.log(`  [${c.exclude_from_ebitda ? "X" : " "}] ${c.name}`);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
