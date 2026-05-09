/**
 * Archivado masivo de TODOS los movimientos de Fonavi (id=2) y Centro
 * (id=3). Atelier (id=1) NO se toca.
 *
 * Estrategia:
 *   1. Snapshot de saldos Atelier ANTES (para verificar que no cambien).
 *   2. Verificación pre-UPDATE: 0 filas con business_id=1 (Atelier) en
 *      el filtro IN (2,3). Sanity check.
 *   3. UPDATE archived=true en bank_income_items, expenses, daily_records
 *      WHERE business_id IN (2,3) AND archived=false.
 *   4. Snapshot post + verificación de saldos Atelier IDÉNTICOS.
 *   5. Si Atelier cambió, ABORT con stack trace.
 *
 * NO toca fonavi_receivables (Atelier-only). NO usa transacciones SQL
 * porque cada UPDATE es independiente y el snapshot de Neon ya es la
 * red de seguridad.
 *
 * Snapshot Neon: pre-reset-fonavi-centro-01-abril (May 15 2026).
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const ATELIER = 1, FONAVI = 2, CENTRO = 3;

async function atelierBalances() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const anchor = (await sql`
    SELECT bank_balance_real::float AS b, date::text AS d FROM daily_records
    WHERE business_id = ${ATELIER} AND bank_balance_real IS NOT NULL AND date <= ${today}
    ORDER BY date DESC LIMIT 1
  `) as { b: number; d: string }[];

  let bcp = 0;
  if (anchor[0]) {
    const inc = (await sql`
      SELECT COALESCE(SUM(amount),0)::float AS t FROM bank_income_items
      WHERE business_id = ${ATELIER} AND date > ${anchor[0].d} AND date <= ${today}
        AND is_special_loan=false AND payment_method <> 'efectivo'
    `)[0] as { t: number };
    const exp = (await sql`
      SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses
      WHERE business_id = ${ATELIER} AND date > ${anchor[0].d} AND date <= ${today}
        AND payment_method NOT IN ('efectivo','pendiente_atelier') AND is_special_loan=false
    `)[0] as { t: number };
    bcp = Math.round((anchor[0].b + inc.t - exp.t) * 100) / 100;
  }

  const cashIn = (await sql`
    SELECT COALESCE(SUM(amount),0)::float AS t FROM bank_income_items
    WHERE business_id = ${ATELIER} AND payment_method='efectivo'
  `)[0] as { t: number };
  const cashOut = (await sql`
    SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses
    WHERE business_id = ${ATELIER} AND payment_method='efectivo'
  `)[0] as { t: number };

  const counts = await sql`
    SELECT 'bank_income_items' AS t, COUNT(*)::int AS n FROM bank_income_items WHERE business_id=${ATELIER}
    UNION ALL
    SELECT 'expenses', COUNT(*)::int FROM expenses WHERE business_id=${ATELIER}
    UNION ALL
    SELECT 'daily_records', COUNT(*)::int FROM daily_records WHERE business_id=${ATELIER}
  `;

  return {
    bcp,
    efectivo: Math.round((cashIn.t - cashOut.t) * 100) / 100,
    counts,
  };
}

async function main() {
  console.log("Atelier ANTES:");
  const atelierBefore = await atelierBalances();
  console.log(JSON.stringify(atelierBefore, null, 2));

  // Sanity: confirmar que el filtro IN (2,3) NO incluye Atelier
  const sanity = await sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT business_id FROM bank_income_items WHERE business_id IN (${FONAVI}, ${CENTRO})
      UNION ALL
      SELECT business_id FROM expenses WHERE business_id IN (${FONAVI}, ${CENTRO})
    ) x WHERE business_id = ${ATELIER}
  `;
  if ((sanity[0] as { n: number }).n !== 0) {
    throw new Error("ABORT: filtro IN (2,3) capturó filas con business_id=1 (imposible)");
  }
  console.log("\n✓ Sanity check OK: filtro IN (2,3) NO captura Atelier.");

  // Counts pre-UPDATE
  const preCounts = await sql`
    SELECT 'bank_income_items' AS t, business_id, COUNT(*)::int AS n
    FROM bank_income_items WHERE business_id IN (${FONAVI}, ${CENTRO}) AND archived=false
    GROUP BY business_id
    UNION ALL
    SELECT 'expenses', business_id, COUNT(*)::int
    FROM expenses WHERE business_id IN (${FONAVI}, ${CENTRO}) AND archived=false
    GROUP BY business_id
    UNION ALL
    SELECT 'daily_records', business_id, COUNT(*)::int
    FROM daily_records WHERE business_id IN (${FONAVI}, ${CENTRO}) AND archived=false
    GROUP BY business_id
    ORDER BY t, business_id
  `;
  console.log("\nMovimientos a archivar:", JSON.stringify(preCounts, null, 2));

  // UPDATE 1: bank_income_items
  console.log("\n→ UPDATE bank_income_items SET archived=true WHERE business_id IN (2,3)");
  await sql`
    UPDATE bank_income_items SET archived = true
    WHERE business_id IN (${FONAVI}, ${CENTRO}) AND archived = false
  `;

  // UPDATE 2: expenses
  console.log("→ UPDATE expenses SET archived=true WHERE business_id IN (2,3)");
  await sql`
    UPDATE expenses SET archived = true
    WHERE business_id IN (${FONAVI}, ${CENTRO}) AND archived = false
  `;

  // UPDATE 3: daily_records
  console.log("→ UPDATE daily_records SET archived=true WHERE business_id IN (2,3)");
  await sql`
    UPDATE daily_records SET archived = true
    WHERE business_id IN (${FONAVI}, ${CENTRO}) AND archived = false
  `;

  // Verificación: confirmar archivado por negocio
  const post = await sql`
    SELECT 'bank_income_items' AS t, business_id, archived, COUNT(*)::int AS n
    FROM bank_income_items WHERE business_id IN (${FONAVI}, ${CENTRO}) GROUP BY business_id, archived
    UNION ALL
    SELECT 'expenses', business_id, archived, COUNT(*)::int FROM expenses
    WHERE business_id IN (${FONAVI}, ${CENTRO}) GROUP BY business_id, archived
    UNION ALL
    SELECT 'daily_records', business_id, archived, COUNT(*)::int FROM daily_records
    WHERE business_id IN (${FONAVI}, ${CENTRO}) GROUP BY business_id, archived
    ORDER BY t, business_id, archived
  `;
  console.log("\nDistribución post-UPDATE Fonavi/Centro:", JSON.stringify(post, null, 2));

  // SAFETY CHECK: confirmar que Atelier NO tiene filas archived=true
  const atelierArchived = await sql`
    SELECT 'bank_income_items' AS t, COUNT(*)::int AS n FROM bank_income_items WHERE business_id=${ATELIER} AND archived=true
    UNION ALL
    SELECT 'expenses', COUNT(*)::int FROM expenses WHERE business_id=${ATELIER} AND archived=true
    UNION ALL
    SELECT 'daily_records', COUNT(*)::int FROM daily_records WHERE business_id=${ATELIER} AND archived=true
  `;
  const totalAtelierArchived = (atelierArchived as { n: number }[]).reduce((s, r) => s + r.n, 0);
  if (totalAtelierArchived !== 0) {
    throw new Error(`ABORT: Atelier tiene ${totalAtelierArchived} filas archivadas — filtro falló`);
  }
  console.log("\n✓ Atelier intacto (0 filas archivadas).");

  // Saldos Atelier post
  console.log("\nAtelier DESPUÉS:");
  const atelierAfter = await atelierBalances();
  console.log(JSON.stringify(atelierAfter, null, 2));

  if (atelierBefore.bcp !== atelierAfter.bcp || atelierBefore.efectivo !== atelierAfter.efectivo) {
    throw new Error(
      `ABORT: saldos Atelier cambiaron — BCP ${atelierBefore.bcp}→${atelierAfter.bcp}, ` +
      `Efectivo ${atelierBefore.efectivo}→${atelierAfter.efectivo}`
    );
  }
  console.log("\n✅ Saldos Atelier IDÉNTICOS antes y después.");

  fs.writeFileSync("/tmp/archive-result.json", JSON.stringify({
    atelierBefore, atelierAfter, archivedCounts: post,
  }, null, 2));
}

main().catch((e) => { console.error("❌ ERROR:", e.message); process.exit(1); });
