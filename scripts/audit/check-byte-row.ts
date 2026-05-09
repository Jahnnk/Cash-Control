import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  console.log("Row 31/03:");
  console.log(JSON.stringify(await sql`
    SELECT date::text, efectivo::float, yape_plin::float, pos::float,
           total::float, imported_from_excel, import_batch_id::text,
           created_at::text, updated_at::text
    FROM byte_sales_daily WHERE business_id = 2 AND date = '2026-03-31'
  `, null, 2));

  console.log("\nÚltimos 5 días de marzo:");
  console.log(JSON.stringify(await sql`
    SELECT date::text, efectivo::float, yape_plin::float, pos::float, total::float
    FROM byte_sales_daily WHERE business_id = 2 AND date BETWEEN '2026-03-27' AND '2026-04-02'
    ORDER BY date
  `, null, 2));

  console.log("\nBatches de importación a Fonavi:");
  console.log(JSON.stringify(await sql`
    SELECT id::text, file_name, sheet_name, date_range_start::text, date_range_end::text,
           imported_at::text, status, notes
    FROM import_batches WHERE business_id = 2 ORDER BY imported_at DESC
  `, null, 2));
})();
