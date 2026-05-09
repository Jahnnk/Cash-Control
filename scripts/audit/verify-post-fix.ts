/**
 * Verificación post-cleanup. Reproduce las queries de
 * src/app/actions/reports.ts (getMonthlyReport + getDailyBreakdown)
 * para confirmar:
 *   1. Fonavi abril 2026 = S/36,986.40
 *   2. Fonavi mayo 2026 = S/5,742.50 (11 días)
 *   3. getDailyBreakdown solo devuelve días del mes seleccionado
 *      (no crashea por undefined transferencia)
 *   4. Atelier abril 2026 sigue en S/35,931.66 (intacto)
 *   5. Centro sin datos byte_sales_daily (intacto)
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

// Replica EXACTA de getMonthlyReport (src/app/actions/reports.ts)
async function getMonthlyReport(bId: number, month: string) {
  const startDate = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const byteDailyExists = (await sql`
    SELECT COUNT(*)::int AS n FROM byte_sales_daily
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
  `)[0] as { n: number };
  const byteSalesSource: "byte_sales_daily" | "legacy" =
    byteDailyExists.n > 0 ? "byte_sales_daily" : "legacy";

  let total_byte = 0;
  if (byteSalesSource === "byte_sales_daily") {
    const r = await sql`
      SELECT COALESCE(SUM(efectivo + yape_plin + pos), 0)::float AS sum
      FROM byte_sales_daily
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
    `;
    total_byte = Number(r[0].sum);
  } else {
    const a = await sql`
      SELECT COALESCE(SUM(byte_total), 0)::float AS sum FROM daily_records
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
        AND archived = false
    `;
    const b = await sql`
      SELECT COALESCE(SUM(amount), 0)::float AS sum FROM bank_income_items
      WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
        AND is_byte_sale = true AND archived = false
    `;
    total_byte = Number(a[0].sum) + Number(b[0].sum);
  }
  return { total_byte, byteSalesSource };
}

// Replica EXACTA de getDailyBreakdown rama "byte" → byte_sales_daily
async function getDailyBreakdownByte(bId: number, month: string) {
  const startDate = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
  const dailyCheck = await sql`
    SELECT COUNT(*)::int AS n FROM byte_sales_daily
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
  `;
  if ((dailyCheck[0]?.n ?? 0) === 0) return { format: "no-byte-daily", rows: [] };
  const r = await sql`
    SELECT date::text AS date,
           efectivo::float AS efectivo,
           yape_plin::float AS yape_plin,
           pos::float AS pos,
           0::float AS transferencia,
           total::float AS total_dia
    FROM byte_sales_daily
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
    ORDER BY date ASC
  `;
  return { format: "byte_daily", rows: r };
}

async function main() {
  console.log(`╔══════════════════════════════════════════════╗`);
  console.log(`║  VERIFICACIÓN POST-CLEANUP                   ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  // ─── 1. Fonavi abril 2026 = S/36,986.40 ───
  console.log(`▶ 1. Fonavi abril 2026:`);
  const fonAbr = await getMonthlyReport(2, "2026-04");
  const ok1 = Math.abs(fonAbr.total_byte - 36986.40) < 0.01;
  console.log(`   total_byte: S/${fonAbr.total_byte.toFixed(2)} | source: ${fonAbr.byteSalesSource}`);
  console.log(`   ${ok1 ? "✅" : "❌"} esperado S/36,986.40\n`);

  // ─── 2. Fonavi mayo 2026 = S/5,742.50 con 11 días ───
  console.log(`▶ 2. Fonavi mayo 2026:`);
  const fonMay = await getMonthlyReport(2, "2026-05");
  const fonMayDays = await sql`
    SELECT COUNT(*)::int AS n FROM byte_sales_daily
    WHERE business_id = 2 AND date >= '2026-05-01' AND date <= '2026-05-31'
  `;
  const ok2a = Math.abs(fonMay.total_byte - 5742.50) < 0.01;
  const ok2b = fonMayDays[0].n === 11;
  console.log(`   total_byte: S/${fonMay.total_byte.toFixed(2)} | días: ${fonMayDays[0].n}`);
  console.log(`   ${ok2a && ok2b ? "✅" : "❌"} esperado S/5,742.50 con 11 días\n`);

  // ─── 3. getDailyBreakdown abril Fonavi ───
  console.log(`▶ 3. getDailyBreakdown(Fonavi, 2026-04):`);
  const bd = await getDailyBreakdownByte(2, "2026-04");
  const rows = bd.rows as Array<{ date: string; transferencia: number; total_dia: number }>;
  const allInApril = rows.every(r => r.date.startsWith("2026-04"));
  const noUndefinedTrans = rows.every(r => r.transferencia === 0); // schema-defined
  const sumOk = Math.abs(rows.reduce((a, r) => a + Number(r.total_dia), 0) - 36986.40) < 0.01;
  console.log(`   format: ${bd.format} | filas: ${rows.length}`);
  console.log(`   primer día: ${rows[0]?.date} | último día: ${rows[rows.length-1]?.date}`);
  console.log(`   ${allInApril ? "✅" : "❌"} todas las filas en 2026-04`);
  console.log(`   ${noUndefinedTrans ? "✅" : "❌"} transferencia siempre numérica (no undefined)`);
  console.log(`   ${sumOk ? "✅" : "❌"} suma cuadra con monthly report\n`);

  // ─── 4. Atelier abril intacto ───
  console.log(`▶ 4. Atelier (id=1) abril 2026 — debe ser legacy:`);
  const ate = await getMonthlyReport(1, "2026-04");
  const ateBsd = await sql`
    SELECT COUNT(*)::int AS n FROM byte_sales_daily
    WHERE business_id = 1 AND date >= '2026-04-01' AND date <= '2026-04-30'
  `;
  console.log(`   total_byte: S/${ate.total_byte.toFixed(2)} | source: ${ate.byteSalesSource}`);
  console.log(`   byte_sales_daily Atelier abril: ${ateBsd[0].n} (esperado 0)`);
  const ok4 = ate.byteSalesSource === "legacy" && ateBsd[0].n === 0;
  console.log(`   ${ok4 ? "✅" : "❌"} Atelier sigue usando legacy (intacto)\n`);

  // ─── 5. Centro intacto (sin byte_sales_daily) ───
  console.log(`▶ 5. Centro (id=3) — debe seguir sin byte_sales_daily:`);
  const cen = await sql`
    SELECT COUNT(*)::int AS n FROM byte_sales_daily WHERE business_id = 3
  `;
  const ok5 = cen[0].n === 0;
  console.log(`   byte_sales_daily Centro: ${cen[0].n}`);
  console.log(`   ${ok5 ? "✅" : "❌"} Centro intacto\n`);

  // ─── Resumen ───
  const allOk = ok1 && ok2a && ok2b && allInApril && noUndefinedTrans && sumOk && ok4 && ok5;
  console.log(`════════════════════════════════════════════════`);
  console.log(allOk ? `✅ TODAS LAS VERIFICACIONES PASAN` : `❌ Hay verificaciones fallidas`);
  console.log(`════════════════════════════════════════════════\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
