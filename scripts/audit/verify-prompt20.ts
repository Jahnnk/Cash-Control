/**
 * Validación Prompt 20:
 *  Task 1 — Variación saldo banco (BCP) por mes
 *  Task 2 — Drilldown Total ingresos del mes
 *
 * Reproduce las queries reales del server action contra la DB para
 * confirmar que devuelven los valores esperados sin tocar la app.
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function bankVariation(bId: number, month: string) {
  const startDate = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
  const r = await sql`
    SELECT
      (SELECT COALESCE(SUM(amount),0)::float FROM bank_income_items
       WHERE business_id = ${bId} AND archived = false
         AND date BETWEEN ${startDate} AND ${endDate}
         AND payment_method != 'efectivo'
         AND is_special_loan = false AND is_internal_transfer = false) AS ing,
      (SELECT COALESCE(SUM(amount),0)::float FROM expenses
       WHERE business_id = ${bId} AND archived = false
         AND date BETWEEN ${startDate} AND ${endDate}
         AND payment_method != 'efectivo'
         AND is_special_loan = false AND is_internal_transfer = false) AS egr
  `;
  const ing = Number(r[0].ing);
  const egr = Number(r[0].egr);
  return { ing, egr, variation: ing - egr };
}

async function totalIncomePorDia(bId: number, month: string) {
  const startDate = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
  const exists = await sql`
    SELECT COUNT(*)::int AS n FROM byte_sales_daily
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate}
  `;
  const useByteDaily = (exists[0].n as number) > 0;
  if (useByteDaily) {
    return await sql`
      WITH dates AS (
        SELECT generate_series(${startDate}::date, ${endDate}::date, '1 day')::date AS date
      ),
      byte_per_day AS (
        SELECT date, (efectivo + yape_plin + pos)::float AS total
        FROM byte_sales_daily
        WHERE business_id = ${bId} AND date BETWEEN ${startDate} AND ${endDate}
      ),
      otros_per_day AS (
        SELECT date, COALESCE(SUM(amount),0)::float AS total
        FROM bank_income_items
        WHERE business_id = ${bId} AND date BETWEEN ${startDate} AND ${endDate}
          AND is_byte_sale = false AND is_special_loan = false
          AND is_internal_transfer = false AND is_fonavi_reimbursement = false
          AND archived = false
        GROUP BY date
      )
      SELECT d.date::text AS date,
             COALESCE(bp.total, 0)::float AS ventas_byte,
             COALESCE(op.total, 0)::float AS otros_ingresos,
             (COALESCE(bp.total,0) + COALESCE(op.total,0))::float AS total_dia
      FROM dates d
      LEFT JOIN byte_per_day bp ON bp.date = d.date
      LEFT JOIN otros_per_day op ON op.date = d.date
      WHERE COALESCE(bp.total,0) + COALESCE(op.total,0) > 0
      ORDER BY d.date DESC
    `;
  } else {
    return await sql`
      WITH dates AS (
        SELECT generate_series(${startDate}::date, ${endDate}::date, '1 day')::date AS date
      ),
      byte_per_day AS (
        SELECT d.date,
          (
            COALESCE((SELECT byte_total FROM daily_records dr
              WHERE dr.business_id = ${bId} AND dr.date = d.date AND dr.archived = false), 0)
            +
            COALESCE((SELECT SUM(amount) FROM bank_income_items
              WHERE business_id = ${bId} AND date = d.date
                AND is_byte_sale = true AND archived = false), 0)
          )::float AS total
        FROM dates d
      ),
      otros_per_day AS (
        SELECT date, COALESCE(SUM(amount),0)::float AS total
        FROM bank_income_items
        WHERE business_id = ${bId} AND date BETWEEN ${startDate} AND ${endDate}
          AND is_byte_sale = false AND is_special_loan = false
          AND is_internal_transfer = false AND is_fonavi_reimbursement = false
          AND archived = false
        GROUP BY date
      )
      SELECT d.date::text AS date,
             COALESCE(bp.total, 0)::float AS ventas_byte,
             COALESCE(op.total, 0)::float AS otros_ingresos,
             (COALESCE(bp.total,0) + COALESCE(op.total,0))::float AS total_dia
      FROM dates d
      LEFT JOIN byte_per_day bp ON bp.date = d.date
      LEFT JOIN otros_per_day op ON op.date = d.date
      WHERE COALESCE(bp.total,0) + COALESCE(op.total,0) > 0
      ORDER BY d.date DESC
    `;
  }
}

async function main() {
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  PROMPT 20 — Validación abril 2026       ║`);
  console.log(`╚══════════════════════════════════════════╝`);

  console.log(`\n▶ Task 1 — Variación saldo banco`);
  for (const b of [{id:1,name:"Atelier"},{id:2,name:"Fonavi"},{id:3,name:"Centro"}]) {
    const r = await bankVariation(b.id, "2026-04");
    console.log(`  ${b.name.padEnd(8)}: Ing BCP=S/${r.ing.toFixed(2).padStart(10)} − Egr BCP=S/${r.egr.toFixed(2).padStart(10)} = ${r.variation >= 0 ? "+" : ""}S/${r.variation.toFixed(2)}`);
  }
  console.log(`  Esperado Centro:  ≈ -S/5,856.24 (margen ±100)`);
  console.log(`  Esperado Fonavi:  ≈ -S/2,266.83`);

  console.log(`\n▶ Task 2 — Total ingresos por día (Centro abril 2026)`);
  const drill = await totalIncomePorDia(3, "2026-04");
  console.log(`  Filas (días con ingresos): ${drill.length}`);
  const sum = drill.reduce((s, r) => s + Number(r.total_dia), 0);
  console.log(`  Suma de total_dia:    S/${sum.toFixed(2)}`);
  console.log(`  Esperado:             S/37,101.56 (margen ±5)`);
  console.log(`\n  Primeros 5 días:`);
  drill.slice(0, 5).forEach((r) => {
    console.log(`    ${r.date} | Byte=S/${Number(r.ventas_byte).toFixed(2).padStart(8)} | Otros=S/${Number(r.otros_ingresos).toFixed(2).padStart(7)} | Total=S/${Number(r.total_dia).toFixed(2).padStart(8)}`);
  });
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
