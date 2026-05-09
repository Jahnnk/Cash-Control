import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  console.log("\n== byte_sales_daily totales por negocio y mes ==");
  const counts = await sql`
    SELECT business_id, date_trunc('month', date)::date AS mes, COUNT(*)::int AS n
    FROM byte_sales_daily GROUP BY business_id, date_trunc('month', date)
    ORDER BY business_id, mes
  `;
  console.log(JSON.stringify(counts, null, 2));

  console.log("\n== Filas en Fonavi (id=2) — todas, ordenadas por fecha ==");
  const fonavi = await sql`
    SELECT date::text, efectivo::float, yape_plin::float, pos::float, total::float, imported_from_excel
    FROM byte_sales_daily WHERE business_id = 2 ORDER BY date ASC
  `;
  console.log("Total:", (fonavi as unknown[]).length);
  for (const r of fonavi as Array<{ date: string }>) console.log(r);

  console.log("\n== Filas en Centro (id=3) — todas ==");
  const centro = await sql`
    SELECT date::text, efectivo::float, yape_plin::float, pos::float, total::float
    FROM byte_sales_daily WHERE business_id = 3 ORDER BY date ASC
  `;
  console.log("Total:", (centro as unknown[]).length);

  console.log("\n== Test query del breakdown: business_id=2, abril 2026 ==");
  const r = await sql`
    SELECT date::text AS date, efectivo::float, yape_plin::float, pos::float, total::float AS total_dia
    FROM byte_sales_daily
    WHERE business_id = 2 AND date >= '2026-04-01' AND date <= '2026-04-30'
    ORDER BY date ASC
  `;
  console.log("Filas en abril 2026:", (r as unknown[]).length);
  console.log("Suma total:", (r as Array<{ total_dia: number }>).reduce((s, x) => s + x.total_dia, 0));
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
