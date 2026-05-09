import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  for (const bId of [1, 2, 3]) {
    const r = await sql`
      SELECT
        (
          COALESCE((SELECT SUM(byte_total) FROM daily_records
            WHERE business_id = ${bId} AND date BETWEEN '2026-04-01' AND '2026-04-30' AND archived = false), 0)
          +
          COALESCE((SELECT SUM(amount) FROM bank_income_items
            WHERE business_id = ${bId} AND date BETWEEN '2026-04-01' AND '2026-04-30'
              AND is_byte_sale = true AND archived = false), 0)
        )::float AS total_byte,
        COALESCE((SELECT SUM(amount) FROM bank_income_items
          WHERE business_id = ${bId} AND date BETWEEN '2026-04-01' AND '2026-04-30'
            AND is_fonavi_reimbursement = false AND is_special_loan = false
            AND is_internal_transfer = false AND is_byte_sale = false AND archived = false), 0)::float AS total_income,
        COALESCE((SELECT SUM(amount) FROM bank_income_items
          WHERE business_id = ${bId} AND date BETWEEN '2026-04-01' AND '2026-04-30'
            AND is_fonavi_reimbursement = false AND is_special_loan = false
            AND is_internal_transfer = false AND archived = false), 0)::float AS total_income_old_format
    `;
    console.log(`Business ${bId}:`, r);
  }
})();
