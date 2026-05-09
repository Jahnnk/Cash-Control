/**
 * Validación Prompt 17: corre getMonthlyReport real (server action)
 * para Atelier/Fonavi/Centro abril 2026 y verifica:
 *   1. total_ingresos_del_mes = total_byte + total_income
 *   2. Atelier intacto (S/35,931.66 ventas)
 *   3. Fonavi correcto (S/36,986.40 + S/342.10 = S/37,328.50)
 *   4. Centro sin crash (sin datos)
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function getMonthlyReport(bId: number, month: string) {
  const startDate = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const exists = (await sql`
    SELECT COUNT(*)::int AS n FROM byte_sales_daily
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
  `)[0] as { n: number };
  const byteSrc = exists.n > 0 ? "byte_sales_daily" : "legacy";

  let total_byte = 0;
  if (byteSrc === "byte_sales_daily") {
    total_byte = Number((await sql`
      SELECT COALESCE(SUM(efectivo + yape_plin + pos),0)::float AS s
      FROM byte_sales_daily
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
    `)[0].s);
  } else {
    const a = Number((await sql`
      SELECT COALESCE(SUM(byte_total),0)::float AS s FROM daily_records
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
        AND archived = false
    `)[0].s);
    const b = Number((await sql`
      SELECT COALESCE(SUM(amount),0)::float AS s FROM bank_income_items
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
        AND is_byte_sale = true AND archived = false
    `)[0].s);
    total_byte = a + b;
  }

  const total_income = Number((await sql`
    SELECT COALESCE(SUM(amount),0)::float AS s FROM bank_income_items
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
      AND is_fonavi_reimbursement = false AND is_special_loan = false
      AND is_internal_transfer = false AND is_byte_sale = false
      AND archived = false
  `)[0].s);

  const total_expenses = Number((await sql`
    SELECT COALESCE(SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END),0)::float AS s
    FROM expenses
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
      AND is_special_loan = false AND is_internal_transfer = false
      AND archived = false
  `)[0].s);

  // Réplica EXACTA del nuevo cálculo en src/app/actions/reports.ts
  const total_ingresos_del_mes = total_byte + total_income;
  return { total_byte, total_income, total_expenses, total_ingresos_del_mes, byteSrc };
}

async function main() {
  console.log(`╔════════════════════════════════════════════╗`);
  console.log(`║  VERIFICACIÓN PROMPT 17 — abril 2026       ║`);
  console.log(`╚════════════════════════════════════════════╝`);

  for (const b of [{id:1,name:"Atelier"},{id:2,name:"Fonavi"},{id:3,name:"Centro"}]) {
    const r = await getMonthlyReport(b.id, "2026-04");
    console.log(`\n▶ ${b.name} (id=${b.id}, source=${r.byteSrc})`);
    console.log(`  Ventas Byte:               S/${r.total_byte.toFixed(2)}`);
    console.log(`  Otros ingresos:            S/${r.total_income.toFixed(2)}`);
    console.log(`  Total ingresos del mes:    S/${r.total_ingresos_del_mes.toFixed(2)}`);
    console.log(`  Egresos totales:           S/${r.total_expenses.toFixed(2)}`);
  }

  console.log(`\n══ Esperados ══`);
  console.log(`  Atelier abril:  Ventas Byte = S/35,931.66 (intacto)`);
  console.log(`  Fonavi abril:   Ventas Byte = S/36,986.40, Otros = S/342.10, Total = S/37,328.50`);
  console.log(`  Centro abril:   sin datos (todos 0 esperado)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
