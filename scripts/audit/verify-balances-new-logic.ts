import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function bizBalance(bId: number) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const cfg = (await sql`
    SELECT system_start_date::text AS start, initial_bcp_balance::float AS init_bcp,
           initial_cash_balance::float AS init_cash, initial_balance_date::text AS init_date,
           code FROM businesses WHERE id = ${bId}
  `)[0] as { start: string | null; init_bcp: number; init_cash: number; init_date: string | null; code: string };

  // BCP — replicate getUnifiedBankBalance lógica nueva
  const anchor = (await sql`
    SELECT bank_balance_real::float AS b, date::text AS d FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND date <= ${today} AND archived = false
    ORDER BY date DESC LIMIT 1
  `) as { b: number; d: string }[];

  let bcp = 0;
  let anchorDate: string | null = null;
  let anchorBalance = 0;

  if (anchor[0]) {
    anchorBalance = anchor[0].b;
    anchorDate = anchor[0].d;
  } else if (cfg.start && cfg.init_date) {
    anchorBalance = cfg.init_bcp;
    anchorDate = cfg.init_date;
  }

  if (anchorDate) {
    const inc = (await sql`
      SELECT COALESCE(SUM(amount),0)::float AS t FROM bank_income_items
      WHERE business_id = ${bId} AND date > ${anchorDate} AND date <= ${today}
        AND is_special_loan=false AND payment_method <> 'efectivo' AND archived=false
    `)[0] as { t: number };
    const exp = (await sql`
      SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses
      WHERE business_id = ${bId} AND date > ${anchorDate} AND date <= ${today}
        AND payment_method NOT IN ('efectivo','pendiente_atelier') AND is_special_loan=false AND archived=false
    `)[0] as { t: number };
    bcp = Math.round((anchorBalance + inc.t - exp.t) * 100) / 100;
  }

  // Efectivo — replicate getCashBalance lógica nueva
  const cashIn = (await sql`
    SELECT COALESCE(SUM(amount),0)::float AS t FROM bank_income_items
    WHERE business_id = ${bId} AND payment_method='efectivo' AND archived=false
  `)[0] as { t: number };
  const cashOut = (await sql`
    SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses
    WHERE business_id = ${bId} AND payment_method='efectivo' AND archived=false
  `)[0] as { t: number };
  const efectivo = Math.round((cfg.init_cash + cashIn.t - cashOut.t) * 100) / 100;

  return { code: cfg.code, bcp, efectivo, anchorDate, anchorBalance };
}

(async () => {
  const r = [];
  for (const bId of [1, 2, 3]) r.push(await bizBalance(bId));
  console.log("Saldos con NUEVA lógica:", JSON.stringify(r, null, 2));
})();
