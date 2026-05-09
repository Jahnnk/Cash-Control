import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const FONAVI = 2, CENTRO = 3;

(async () => {
  console.log("Pre:");
  console.log(JSON.stringify(await sql`
    SELECT id, code, system_start_date::text AS d,
           initial_bcp_balance::float AS bcp,
           initial_cash_balance::float AS cash,
           initial_balance_date::text AS bd
    FROM businesses ORDER BY id
  `, null, 2));

  await sql`
    UPDATE businesses
    SET system_start_date = '2026-04-01',
        initial_bcp_balance = 0.00,
        initial_cash_balance = 0.00,
        initial_balance_date = '2026-03-31',
        updated_at = now()
    WHERE id IN (${FONAVI}, ${CENTRO})
  `;

  // Sanity: verificar Atelier NO modificado
  const atelier = await sql`
    SELECT system_start_date::text AS d, initial_bcp_balance::float AS bcp
    FROM businesses WHERE id = 1
  `;
  if ((atelier[0] as { d: string | null }).d !== null) {
    throw new Error("ABORT: Atelier system_start_date no es NULL");
  }

  console.log("\nPost:");
  console.log(JSON.stringify(await sql`
    SELECT id, code, system_start_date::text AS d,
           initial_bcp_balance::float AS bcp,
           initial_cash_balance::float AS cash,
           initial_balance_date::text AS bd
    FROM businesses ORDER BY id
  `, null, 2));

  console.log("\n✅ Fonavi y Centro configurados con system_start_date=2026-04-01.");
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
