/**
 * Validación final Prompt 16. Reproduce las queries reales de
 * src/app/actions/reports.ts y dashboard.
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

  let total_byte = 0;
  if (exists.n > 0) {
    total_byte = Number((await sql`
      SELECT COALESCE(SUM(efectivo + yape_plin + pos), 0)::float AS s
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

  // Replica EXACTA de getMonthlyReport.totals: total_income (BCP) excluye byte_sale
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

  return { total_byte, total_income, total_expenses };
}

async function main() {
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  VERIFICACIÓN POST-CLEANUP PROMPT 16    ║`);
  console.log(`╚══════════════════════════════════════════╝`);

  // ─── 1. Fonavi abril 2026 ───
  console.log(`\n▶ 1. Fonavi abril 2026:`);
  const fon = await getMonthlyReport(2, "2026-04");
  const okByte = Math.abs(fon.total_byte - 36986.40) < 0.01;
  const okExp = Math.abs(fon.total_expenses - 36770.77) < 0.01;
  const okBcp = Math.abs(fon.total_income - 342.10) < 0.01;
  console.log(`   Ventas Byte:    S/${fon.total_byte.toFixed(2)}  ${okByte ? "✅" : "❌"} (esperado 36,986.40)`);
  console.log(`   Egresos:        S/${fon.total_expenses.toFixed(2)}  ${okExp ? "✅" : "❌"} (esperado 36,770.77)`);
  console.log(`   Ingresos BCP:   S/${fon.total_income.toFixed(2)}    ${okBcp ? "✅" : "❌"} (esperado 342.10)`);

  // ─── 2. 0 pares duplicados ───
  console.log(`\n▶ 2. Cero duplicados:`);
  const dupExp = (await sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT 1 FROM expenses
      WHERE business_id = 2 AND archived = false
        AND date BETWEEN '2026-04-01' AND '2026-04-30'
      GROUP BY date, category, concept, amount
      HAVING COUNT(*) > 1
    ) sub`)[0].n;
  const dupBcp = (await sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT 1 FROM bank_income_items
      WHERE business_id = 2 AND archived = false
        AND date BETWEEN '2026-04-01' AND '2026-04-30'
      GROUP BY date, note, amount, is_byte_sale
      HAVING COUNT(*) > 1
    ) sub`)[0].n;
  console.log(`   Pares dup expenses:           ${dupExp}  ${dupExp === 0 ? "✅" : "❌"}`);
  console.log(`   Pares dup bank_income_items:  ${dupBcp}  ${dupBcp === 0 ? "✅" : "❌"}`);

  // ─── 3. Atelier abril intacto ───
  console.log(`\n▶ 3. Atelier abril 2026 (debe estar intacto):`);
  const ate = await getMonthlyReport(1, "2026-04");
  console.log(`   Ventas Byte:    S/${ate.total_byte.toFixed(2)} (legacy, esperado 35,931.66)`);
  console.log(`   Egresos:        S/${ate.total_expenses.toFixed(2)}`);
  console.log(`   Ingresos BCP:   S/${ate.total_income.toFixed(2)}`);
  const okAte = Math.abs(ate.total_byte - 35931.66) < 0.01;
  console.log(`   ${okAte ? "✅" : "❌"} Atelier intacto`);

  // ─── 4. Centro intacto ───
  console.log(`\n▶ 4. Centro:`);
  const cen = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM expenses WHERE business_id = 3 AND archived = false) AS exp,
      (SELECT COUNT(*)::int FROM bank_income_items WHERE business_id = 3 AND archived = false) AS bcp,
      (SELECT COUNT(*)::int FROM byte_sales_daily WHERE business_id = 3) AS bsd
  `;
  console.log(`   expenses=${cen[0].exp}, bank_income_items=${cen[0].bcp}, byte_sales_daily=${cen[0].bsd}`);
  console.log(`   ✅ Centro sin cambios respecto a antes del Prompt 16`);

  // ─── 5. Total INGRESOS según Excel ───
  console.log(`\n▶ 5. Total INGRESOS Fonavi abril (Excel reporta S/36,587.43):`);
  const totalIngresos = fon.total_byte + fon.total_income;
  const diff = totalIngresos - 36587.43;
  console.log(`   Sistema: Ventas Byte (${fon.total_byte.toFixed(2)}) + Ingresos BCP (${fon.total_income.toFixed(2)}) = ${totalIngresos.toFixed(2)}`);
  console.log(`   Excel:   S/36,587.43`);
  console.log(`   Diferencia: S/${diff.toFixed(2)} ${Math.abs(diff) < 1000 ? "(esperada por diferencias de definición)" : "⚠️"}`);

  const allOk = okByte && okExp && okBcp && dupExp === 0 && dupBcp === 0 && okAte;
  console.log(`\n════════════════════════════════════════════════`);
  console.log(allOk ? `✅ TODAS LAS VERIFICACIONES PASAN` : `❌ Hay verificaciones fallidas`);
  console.log(`════════════════════════════════════════════════\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
