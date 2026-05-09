import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const r = await sql`
    SELECT 'byte_sales_daily' AS t, business_id, COUNT(*)::int AS n FROM byte_sales_daily GROUP BY business_id
    UNION ALL SELECT 'tips_pending', business_id, COUNT(*)::int FROM tips_pending GROUP BY business_id
    UNION ALL SELECT 'rounding_alerts', business_id, COUNT(*)::int FROM rounding_alerts GROUP BY business_id
    ORDER BY t, business_id
  `;
  console.log(JSON.stringify(r, null, 2));
})();
