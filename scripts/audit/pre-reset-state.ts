/**
 * Auditoría READ-ONLY del estado actual antes del reset Fonavi/Centro.
 * Genera /tmp/pre-reset-state.json con counts, saldos y CXC.
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const ATELIER = 1, FONAVI = 2, CENTRO = 3;

async function bizSnapshot(bId: number) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  const ingresos = (await sql`
    SELECT COUNT(*)::int AS n FROM bank_income_items WHERE business_id = ${bId}
  `)[0] as { n: number };

  const egresos = (await sql`
    SELECT COUNT(*)::int AS n FROM expenses WHERE business_id = ${bId}
  `)[0] as { n: number };

  const espejoFromAtelier = bId !== ATELIER ? (await sql`
    SELECT COUNT(*)::int AS n FROM expenses
    WHERE business_id = ${bId} AND linked_atelier_expense_id IS NOT NULL
  `)[0] as { n: number } : { n: 0 };

  // Saldo BCP (replicar getUnifiedBankBalance)
  const anchor = (await sql`
    SELECT bank_balance_real::float AS b, date::text AS d FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND date <= ${today}
    ORDER BY date DESC LIMIT 1
  `) as { b: number; d: string }[];

  let saldoBcp = 0;
  if (anchor[0]) {
    const inc = (await sql`
      SELECT COALESCE(SUM(amount), 0)::float AS t FROM bank_income_items
      WHERE business_id = ${bId} AND date > ${anchor[0].d} AND date <= ${today}
        AND is_special_loan = false AND payment_method <> 'efectivo'
    `)[0] as { t: number };
    const exp = (await sql`
      SELECT COALESCE(SUM(amount), 0)::float AS t FROM expenses
      WHERE business_id = ${bId} AND date > ${anchor[0].d} AND date <= ${today}
        AND payment_method NOT IN ('efectivo','pendiente_atelier')
        AND is_special_loan = false
    `)[0] as { t: number };
    saldoBcp = Math.round((anchor[0].b + inc.t - exp.t) * 100) / 100;
  }

  // Saldo Efectivo (replicar getCashBalance)
  const cashIn = (await sql`
    SELECT COALESCE(SUM(amount), 0)::float AS t FROM bank_income_items
    WHERE business_id = ${bId} AND payment_method = 'efectivo'
  `)[0] as { t: number };
  const cashOut = (await sql`
    SELECT COALESCE(SUM(amount), 0)::float AS t FROM expenses
    WHERE business_id = ${bId} AND payment_method = 'efectivo'
  `)[0] as { t: number };
  const saldoEfectivo = Math.round((cashIn.t - cashOut.t) * 100) / 100;

  // Movimientos por fecha
  const porFecha = (await sql`
    SELECT date::text AS f,
      (SELECT COUNT(*)::int FROM bank_income_items WHERE business_id = ${bId} AND date = dr.date) AS in_n,
      (SELECT COUNT(*)::int FROM expenses WHERE business_id = ${bId} AND date = dr.date) AS out_n
    FROM (
      SELECT DISTINCT date FROM bank_income_items WHERE business_id = ${bId}
      UNION
      SELECT DISTINCT date FROM expenses WHERE business_id = ${bId}
    ) dr
    ORDER BY date ASC
  `) as { f: string; in_n: number; out_n: number }[];

  return {
    movimientos_total: ingresos.n + egresos.n,
    ingresos_count: ingresos.n,
    egresos_count: egresos.n,
    espejo_de_atelier: espejoFromAtelier.n,
    saldo_bcp_actual: saldoBcp,
    saldo_efectivo_actual: saldoEfectivo,
    movimientos_por_fecha: Object.fromEntries(
      porFecha.map((r) => [r.f, { ingresos: r.in_n, egresos: r.out_n }])
    ),
  };
}

async function main() {
  const businesses = await sql`SELECT id, code, name FROM businesses ORDER BY id`;
  console.log("Businesses:", JSON.stringify(businesses, null, 2));

  const fonavi = await bizSnapshot(FONAVI);
  const centro = await bizSnapshot(CENTRO);

  // Atelier base + CXC counts
  const atelierBase = await bizSnapshot(ATELIER);
  const cxcByStatus = await sql`
    SELECT
      CASE WHEN e.linked_receivable_id IS NULL THEN 'unknown'
        ELSE 'tracked' END AS scope,
      r.status,
      COUNT(*)::int AS n
    FROM fonavi_receivables r
    JOIN expenses e ON e.id = r.expense_id
    WHERE e.business_id = ${ATELIER}
    GROUP BY scope, r.status
  `;

  const cxcDetail = await sql`
    SELECT r.id::text, r.status, r.amount_due::float AS due,
           r.amount_collected::float AS col, e.concept,
           e.fonavi_amount::float AS fonavi_amount,
           e.atelier_amount::float AS atelier_amount,
           e.date::text AS date,
           e.is_shared
    FROM fonavi_receivables r
    JOIN expenses e ON e.id = r.expense_id
    WHERE e.business_id = ${ATELIER}
    ORDER BY r.created_at DESC
  `;

  const report = {
    timestamp: new Date().toISOString(),
    snapshot_neon: "pre-reset-fonavi-centro-01-abril (manual, expira May 15 2026)",
    fonavi: { ...fonavi, business_id: FONAVI },
    centro: { ...centro, business_id: CENTRO },
    atelier: {
      ...atelierBase,
      business_id: ATELIER,
      cxc_summary: cxcByStatus,
      cxc_detail: cxcDetail,
    },
  };

  fs.writeFileSync("/tmp/pre-reset-state.json", JSON.stringify(report, null, 2));
  console.log("\n✅ Reporte guardado en /tmp/pre-reset-state.json");
  console.log("\n=== RESUMEN ===");
  console.log("Fonavi:", { mov: fonavi.movimientos_total, bcp: fonavi.saldo_bcp_actual, ef: fonavi.saldo_efectivo_actual });
  console.log("Centro:", { mov: centro.movimientos_total, bcp: centro.saldo_bcp_actual, ef: centro.saldo_efectivo_actual });
  console.log("Atelier:", { mov: atelierBase.movimientos_total, bcp: atelierBase.saldo_bcp_actual, ef: atelierBase.saldo_efectivo_actual });
  console.log("CXC Atelier:", JSON.stringify(cxcByStatus));
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
