import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const r = await sql`
    SELECT r.id::text, r.amount_due::float AS due,
           r.amount_collected::float AS col, r.status,
           r.collected_at::text AS collected_at,
           e.concept, e.date::text AS date,
           e.atelier_amount::float AS atelier, e.fonavi_amount::float AS fonavi
    FROM fonavi_receivables r
    JOIN expenses e ON e.id = r.expense_id
    ORDER BY e.date DESC
  `;
  console.log("CXC Atelier→Fonavi (todas, sin importar estado):");
  for (const row of r as Array<{
    id: string; due: number; col: number; status: string; collected_at: string | null;
    concept: string; date: string; atelier: number; fonavi: number;
  }>) {
    console.log(`  - ${row.date} · ${row.concept} · S/${row.due.toFixed(2)} · status=${row.status}` +
      (row.status === "collected" ? ` · cobrado=${row.collected_at}` : ` · pendiente=S/${(row.due-row.col).toFixed(2)}`));
  }
})();
