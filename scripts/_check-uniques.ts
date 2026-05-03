import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const r = await sql`
    SELECT tc.table_name, tc.constraint_name, ARRAY_AGG(kcu.column_name ORDER BY kcu.ordinal_position) AS cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu USING (constraint_name)
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.table_name, tc.constraint_name
    ORDER BY tc.table_name, tc.constraint_name
  `;
  for (const row of r as Array<{ table_name: string; constraint_name: string; cols: string[] }>) {
    const cols = Array.isArray(row.cols) ? row.cols : String(row.cols);
    console.log(`  ${row.table_name}.${row.constraint_name}  →  (${Array.isArray(cols) ? cols.join(", ") : cols})`);
  }
})();
