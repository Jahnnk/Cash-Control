// Capa 1 — Saldo inicial configurado. Solo lectura.
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("===== CAPA 1: Saldo inicial =====\n");

  // 1.A — Tablas existentes
  const tables = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `) as { table_name: string }[];
  console.log("Tablas en la base:");
  for (const t of tables) console.log(`  - ${t.table_name}`);

  // 1.B — ¿Existe alguna columna o tabla "saldo_inicial"?
  const initialCols = (await sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (column_name ILIKE '%initial%' OR column_name ILIKE '%opening%' OR column_name ILIKE '%inicial%' OR column_name ILIKE '%apertura%')
  `) as { table_name: string; column_name: string }[];
  console.log("\nColumnas con 'initial/opening/inicial/apertura':");
  for (const c of initialCols) console.log(`  - ${c.table_name}.${c.column_name}`);

  // 1.C — Tabla bank_balance (vista en schema): opening/closing
  console.log("\nContenido tabla bank_balance:");
  const bb = (await sql`SELECT date::text as date, opening_balance, closing_balance, notes, created_at::text as created_at FROM bank_balance ORDER BY date ASC`) as Record<string, unknown>[];
  console.log(`  Total filas: ${bb.length}`);
  for (const r of bb.slice(0, 10)) console.log(`    ${JSON.stringify(r)}`);
  if (bb.length > 10) console.log(`    ... y ${bb.length - 10} más`);

  // 1.D — Primer registro con bank_balance_real
  const firstReal = (await sql`
    SELECT date::text as date, bank_balance_real, bank_income, bank_expense, created_at::text as created_at
    FROM daily_records
    WHERE bank_balance_real IS NOT NULL
    ORDER BY date ASC LIMIT 5
  `) as Record<string, unknown>[];
  console.log("\nPrimeros 5 daily_records con bank_balance_real:");
  for (const r of firstReal) console.log(`  ${JSON.stringify(r)}`);

  // 1.E — Ultimos 5 daily_records con bank_balance_real (para ver el "actual")
  const lastReal = (await sql`
    SELECT date::text as date, bank_balance_real, bank_income, bank_expense
    FROM daily_records
    WHERE bank_balance_real IS NOT NULL
    ORDER BY date DESC LIMIT 5
  `) as Record<string, unknown>[];
  console.log("\nÚltimos 5 daily_records con bank_balance_real:");
  for (const r of lastReal) console.log(`  ${JSON.stringify(r)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
