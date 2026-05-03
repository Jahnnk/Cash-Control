import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  console.log("=== Tablas en public ===");
  for (const t of tables as Array<{ table_name: string }>) {
    const cnt = await sql.query(`SELECT COUNT(*)::int AS n FROM "${t.table_name}"`);
    console.log(`  ${t.table_name}  (${(cnt as Array<{ n: number }>)[0].n} filas)`);
  }

  console.log("\n=== Columnas por tabla ===");
  for (const t of tables as Array<{ table_name: string }>) {
    const cols = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${t.table_name}
      ORDER BY ordinal_position
    `;
    console.log(`\n  ${t.table_name}:`);
    for (const c of cols as Array<{ column_name: string; data_type: string; is_nullable: string }>) {
      console.log(`    - ${c.column_name} (${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""})`);
    }
  }

  console.log("\n=== Constraints (UNIQUE / FK) ===");
  const constraints = await sql`
    SELECT
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type IN ('UNIQUE', 'FOREIGN KEY')
    ORDER BY tc.table_name, tc.constraint_name
  `;
  for (const c of constraints as Array<{ table_name: string; constraint_name: string; constraint_type: string; column_name: string }>) {
    console.log(`  ${c.table_name}.${c.column_name}  (${c.constraint_type})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
