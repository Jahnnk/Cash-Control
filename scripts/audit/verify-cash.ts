import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const r = await sql`
    SELECT
      (SELECT COALESCE(SUM(amount), 0)::float FROM bank_income_items
        WHERE business_id = 1 AND payment_method = 'efectivo') AS in_cash,
      (SELECT COALESCE(SUM(amount), 0)::float FROM expenses
        WHERE business_id = 1 AND payment_method = 'efectivo') AS out_cash
  `;
  const row = (r as { in_cash: number; out_cash: number }[])[0];
  const saldo = Math.round((row.in_cash - row.out_cash) * 100) / 100;
  console.log("Atelier saldo efectivo nuevo:", { ...row, saldo });

  const f = await sql`
    SELECT
      (SELECT COALESCE(SUM(amount), 0)::float FROM bank_income_items
        WHERE business_id = 2 AND payment_method = 'efectivo') AS in_cash,
      (SELECT COALESCE(SUM(amount), 0)::float FROM expenses
        WHERE business_id = 2 AND payment_method = 'efectivo') AS out_cash
  `;
  const c = await sql`
    SELECT
      (SELECT COALESCE(SUM(amount), 0)::float FROM bank_income_items
        WHERE business_id = 3 AND payment_method = 'efectivo') AS in_cash,
      (SELECT COALESCE(SUM(amount), 0)::float FROM expenses
        WHERE business_id = 3 AND payment_method = 'efectivo') AS out_cash
  `;
  console.log("Fonavi:", (f as { in_cash: number; out_cash: number }[])[0]);
  console.log("Centro:", (c as { in_cash: number; out_cash: number }[])[0]);
})();
