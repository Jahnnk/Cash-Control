import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const rows = await sql`
    SELECT id::text, name, is_active, sort_order, exclude_from_ebitda
    FROM expense_categories
    WHERE business_id = 1
    ORDER BY sort_order, name
  `;
  console.log(`Total categorías en Atelier: ${(rows as unknown[]).length}`);
  console.log("name | is_active | sort_order | exclude_from_ebitda");
  for (const r of rows as Array<{ name: string; is_active: boolean; sort_order: number; exclude_from_ebitda: boolean }>) {
    console.log(`  ${r.name.padEnd(25)} | ${String(r.is_active).padEnd(5)} | ${r.sort_order} | ${r.exclude_from_ebitda}`);
  }
  console.log("\nFonavi (business_id=2):");
  const f = await sql`SELECT COUNT(*)::int AS n FROM expense_categories WHERE business_id = 2`;
  console.log(`  ${(f as Array<{ n: number }>)[0].n} categorías`);
  console.log("Centro (business_id=3):");
  const c = await sql`SELECT COUNT(*)::int AS n FROM expense_categories WHERE business_id = 3`;
  console.log(`  ${(c as Array<{ n: number }>)[0].n} categorías`);
})();
