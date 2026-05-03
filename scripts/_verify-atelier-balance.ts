import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const r = await sql`
    SELECT bank_balance_real::float AS bal, date::text AS date FROM daily_records
    WHERE business_id = 1 AND bank_balance_real IS NOT NULL
    ORDER BY date DESC LIMIT 1
  `;
  const row = (r as Array<{ bal: number; date: string }>)[0];
  console.log(`Saldo Atelier al ${row.date}: S/${row.bal.toFixed(2)}`);
  console.log(row.bal === 1879.60 ? "✅ S/1,879.60 INTACTO" : "❌ SALDO DIVERGE — REVISAR");

  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM daily_records WHERE business_id = 1) AS atelier_dr,
      (SELECT COUNT(*)::int FROM expenses WHERE business_id = 1) AS atelier_exp,
      (SELECT COUNT(*)::int FROM bank_income_items WHERE business_id = 1) AS atelier_inc,
      (SELECT COUNT(*)::int FROM expense_categories WHERE business_id = 1) AS atelier_cat,
      (SELECT COUNT(*)::int FROM expense_categories WHERE business_id = 2) AS fonavi_cat,
      (SELECT COUNT(*)::int FROM expense_categories WHERE business_id = 3) AS centro_cat,
      (SELECT COUNT(*)::int FROM daily_records WHERE business_id = 2) AS fonavi_dr,
      (SELECT COUNT(*)::int FROM expenses WHERE business_id = 2) AS fonavi_exp,
      (SELECT COUNT(*)::int FROM expenses WHERE payment_method = 'pendiente_atelier') AS pending_mirrors
  `;
  const c = (counts as Array<Record<string, number>>)[0];
  console.log(`\nAtelier: ${c.atelier_dr} daily_records · ${c.atelier_exp} expenses · ${c.atelier_inc} bank_income · ${c.atelier_cat} categorías`);
  console.log(`Fonavi:  ${c.fonavi_dr} daily_records · ${c.fonavi_exp} expenses · ${c.fonavi_cat} categorías`);
  console.log(`Centro:  ${c.centro_cat} categorías`);
  console.log(`Gastos pendientes con Atelier en circulación: ${c.pending_mirrors}`);
})();
