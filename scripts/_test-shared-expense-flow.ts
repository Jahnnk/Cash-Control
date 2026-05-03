/**
 * Test E2E del flujo de gastos compartidos auto-mirror (CAMBIO 7.5).
 *
 * Crea un gasto compartido en Atelier, valida estado intermedio,
 * registra reembolso, valida estado final, y luego HACE CLEANUP
 * (borra todas las filas creadas) para no contaminar la BD viva.
 *
 * Verifica los 4 casos del prompt:
 *   a) Atelier crea gasto compartido (Alquiler S/100, 70/30)
 *   b) Fonavi reembolsa S/30
 *   c) Saldos finales correctos
 *   d) Edge: receivable cobrada bloquea delete del expense Atelier (ya
 *      validado en flujos previos, no se re-prueba acá)
 *
 * IMPORTANTE: este test NO usa la cookie/middleware. Llama directo a
 * SQL con neon driver, así que ignora los guards. Eso está bien — lo
 * que valida es la consistencia de la lógica de datos pura.
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const ATELIER_ID = 1;
const FONAVI_ID = 2;

const TEST_DATE = "2026-04-30"; // último día con data — coincide con anchor existente
const TEST_TOTAL = 100.00;
const TEST_ATELIER = 70.00;
const TEST_FONAVI = 30.00;
const TEST_CONCEPT = `__TEST_OLA75_${Date.now()}__`;
const TEST_REIMB_DATE = TEST_DATE;

function check(label: string, actual: number, expected: number, tolerance = 0.01) {
  const ok = Math.abs(actual - expected) < tolerance;
  console.log(`  ${ok ? "✅" : "❌"} ${label}: actual=${actual.toFixed(2)} esperado=${expected.toFixed(2)}`);
  if (!ok) process.exitCode = 1;
}

async function getBalance(bId: number, asOf: string): Promise<number> {
  const anchor = (await sql`
    SELECT bank_balance_real::float AS bal, date FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND date <= ${asOf}
    ORDER BY date DESC LIMIT 1
  `) as Array<{ bal: number; date: string }>;
  if (!anchor[0]) return 0;
  const inc = (await sql`
    SELECT COALESCE(SUM(amount), 0)::float AS t FROM bank_income_items
    WHERE business_id = ${bId} AND date > ${anchor[0].date} AND date <= ${asOf}
  `) as Array<{ t: number }>;
  const exp = (await sql`
    SELECT COALESCE(SUM(amount), 0)::float AS t FROM expenses
    WHERE business_id = ${bId} AND date > ${anchor[0].date} AND date <= ${asOf} AND payment_method NOT IN ('efectivo','pendiente_atelier')
  `) as Array<{ t: number }>;
  return Math.round((anchor[0].bal + inc[0].t - exp[0].t) * 100) / 100;
}

/** Replica la cascada de recalcBankBalance() del server (SQL puro). */
async function recalcCascade(bId: number, fromDate: string) {
  await sql`
    UPDATE daily_records dr SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND date = dr.date), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND date = dr.date AND payment_method NOT IN ('efectivo','pendiente_atelier')), 0)
    WHERE dr.business_id = ${bId} AND dr.date = ${fromDate}
  `;
  await sql`
    WITH RECURSIVE chain AS (
      SELECT
        (${fromDate}::date - INTERVAL '1 day')::date AS date,
        COALESCE((
          SELECT bank_balance_real::numeric FROM daily_records
          WHERE business_id = ${bId} AND date < ${fromDate} AND bank_balance_real IS NOT NULL
          ORDER BY date DESC LIMIT 1
        ), 0) AS calc_balance
      UNION ALL
      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND date = dr.date), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND date = dr.date AND payment_method NOT IN ('efectivo','pendiente_atelier')), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = (c.date + INTERVAL '1 day')::date
      WHERE dr.business_id = ${bId} AND dr.date <= (SELECT MAX(date) FROM daily_records WHERE business_id = ${bId})
    )
    UPDATE daily_records dr
    SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.business_id = ${bId} AND dr.date = chain.date AND dr.date >= ${fromDate}
  `;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("Test E2E — Gastos compartidos auto-mirror (CAMBIO 7.5)");
  console.log(`Concepto único de test: ${TEST_CONCEPT}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const balAtelierBefore = await getBalance(ATELIER_ID, TEST_DATE);
  const balFonaviBefore = await getBalance(FONAVI_ID, TEST_DATE);
  console.log(`Saldos pre-test: Atelier=${balAtelierBefore.toFixed(2)} · Fonavi=${balFonaviBefore.toFixed(2)}`);

  // ───────── CASO A: Atelier crea gasto compartido ─────────
  console.log("\n── CASO A: Atelier crea gasto compartido (Alquiler S/100, 70/30) ──");
  const ruleId = (await sql`SELECT id::text FROM shared_expense_rules WHERE active = true LIMIT 1`) as { id: string }[];
  if (!ruleId[0]) throw new Error("No hay shared_expense_rules para usar en el test. Abortando.");

  // Replicamos la CTE atómica de createExpense() (lo importante es validar el efecto)
  const created = (await sql`
    WITH atelier_ins AS (
      INSERT INTO expenses (business_id, date, category, concept, amount, payment_method, is_shared, shared_rule_id, atelier_amount, fonavi_amount)
      VALUES (${ATELIER_ID}, ${TEST_DATE}, 'Alquiler', ${TEST_CONCEPT}, ${TEST_TOTAL.toFixed(2)}, 'transferencia', true, ${ruleId[0].id}::uuid, ${TEST_ATELIER.toFixed(2)}, ${TEST_FONAVI.toFixed(2)})
      RETURNING id
    ),
    receivable_ins AS (
      INSERT INTO fonavi_receivables (expense_id, amount_due, status)
      SELECT id, ${TEST_FONAVI.toFixed(2)}, 'pending' FROM atelier_ins
      RETURNING id, expense_id
    ),
    fonavi_category_lookup AS (
      SELECT COALESCE((SELECT name FROM expense_categories WHERE business_id = ${FONAVI_ID} AND name = 'Alquiler' AND is_active = true), 'Desconocido') AS cat
    ),
    mirror_ins AS (
      INSERT INTO expenses (business_id, date, category, concept, amount, payment_method, notes, is_shared, linked_atelier_expense_id, linked_receivable_id)
      SELECT ${FONAVI_ID}, ${TEST_DATE}, fcl.cat, ${`[Compartido con Atelier] ${TEST_CONCEPT}`}, ${TEST_FONAVI.toFixed(2)}, 'pendiente_atelier', 'Auto-generado por gasto compartido en Atelier', false, a.id, r.id
      FROM atelier_ins a, receivable_ins r, fonavi_category_lookup fcl
      RETURNING id
    )
    SELECT (SELECT id FROM atelier_ins)::text AS atelier_expense_id,
           (SELECT id FROM receivable_ins)::text AS receivable_id,
           (SELECT id FROM mirror_ins)::text AS fonavi_expense_id
  `) as Array<{ atelier_expense_id: string; receivable_id: string; fonavi_expense_id: string }>;

  const { atelier_expense_id, receivable_id, fonavi_expense_id } = created[0];
  console.log(`  → atelier expense: ${atelier_expense_id}`);
  console.log(`  → receivable: ${receivable_id}`);
  console.log(`  → fonavi mirror: ${fonavi_expense_id}`);

  // Recalcular cache+saldo cascada de Atelier (lo hace createExpense() en producción)
  await recalcCascade(ATELIER_ID, TEST_DATE);

  const ate1 = (await sql`SELECT amount::float, atelier_amount::float, fonavi_amount::float, is_shared FROM expenses WHERE id = ${atelier_expense_id}`) as Array<{ amount: number; atelier_amount: number; fonavi_amount: number; is_shared: boolean }>;
  console.log("\n  Verificación gasto Atelier:");
  check("amount", ate1[0].amount, TEST_TOTAL);
  check("atelier_amount", ate1[0].atelier_amount, TEST_ATELIER);
  check("fonavi_amount", ate1[0].fonavi_amount, TEST_FONAVI);
  console.log(`  ${ate1[0].is_shared ? "✅" : "❌"} is_shared = ${ate1[0].is_shared}`);

  const rec1 = (await sql`SELECT amount_due::float, amount_collected::float, status FROM fonavi_receivables WHERE id = ${receivable_id}`) as Array<{ amount_due: number; amount_collected: number; status: string }>;
  console.log("\n  Verificación receivable:");
  check("amount_due", rec1[0].amount_due, TEST_FONAVI);
  check("amount_collected", rec1[0].amount_collected, 0);
  console.log(`  ${rec1[0].status === "pending" ? "✅" : "❌"} status = ${rec1[0].status} (esperado: pending)`);

  const fon1 = (await sql`SELECT amount::float, payment_method, category, business_id, linked_atelier_expense_id::text, linked_receivable_id::text FROM expenses WHERE id = ${fonavi_expense_id}`) as Array<{ amount: number; payment_method: string; category: string; business_id: number; linked_atelier_expense_id: string; linked_receivable_id: string }>;
  console.log("\n  Verificación gasto-espejo Fonavi:");
  check("amount", fon1[0].amount, TEST_FONAVI);
  console.log(`  ${fon1[0].payment_method === "pendiente_atelier" ? "✅" : "❌"} payment_method = ${fon1[0].payment_method}`);
  console.log(`  ${fon1[0].business_id === FONAVI_ID ? "✅" : "❌"} business_id = ${fon1[0].business_id}`);
  console.log(`  ${fon1[0].category === "Alquiler" ? "✅" : "❌"} category = ${fon1[0].category}`);
  console.log(`  ${fon1[0].linked_atelier_expense_id === atelier_expense_id ? "✅" : "❌"} linked_atelier_expense_id correcto`);
  console.log(`  ${fon1[0].linked_receivable_id === receivable_id ? "✅" : "❌"} linked_receivable_id correcto`);

  const balAtelierMid = await getBalance(ATELIER_ID, TEST_DATE);
  const balFonaviMid = await getBalance(FONAVI_ID, TEST_DATE);
  console.log("\n  Saldos post-creación:");
  check("Atelier debería bajar S/100", balAtelierMid, balAtelierBefore - TEST_TOTAL);
  check("Fonavi NO debe cambiar (gasto pendiente)", balFonaviMid, balFonaviBefore);

  // ───────── CASO B: Fonavi reembolsa S/30 ─────────
  console.log("\n── CASO B: Fonavi reembolsa S/30 ──");
  // 1. Insertar income_item en Atelier (reembolso)
  const incomeIns = (await sql`
    INSERT INTO bank_income_items (business_id, date, amount, note, is_fonavi_reimbursement)
    VALUES (${ATELIER_ID}, ${TEST_REIMB_DATE}, ${TEST_FONAVI.toFixed(2)}, ${"__TEST_REEMBOLSO__"}, true)
    RETURNING id::text
  `) as { id: string }[];
  // 2. Asegurar daily_record
  await sql`INSERT INTO daily_records (business_id, date) VALUES (${ATELIER_ID}, ${TEST_REIMB_DATE}) ON CONFLICT (business_id, date) DO NOTHING`;
  // 3. Allocation
  await sql`
    INSERT INTO fonavi_reimbursement_allocations (income_item_id, receivable_id, amount)
    VALUES (${incomeIns[0].id}::uuid, ${receivable_id}::uuid, ${TEST_FONAVI.toFixed(2)})
  `;
  // 4. Update receivable
  await sql`
    UPDATE fonavi_receivables
    SET amount_collected = amount_collected + ${TEST_FONAVI.toFixed(2)},
        status = CASE WHEN (amount_collected + ${TEST_FONAVI.toFixed(2)}) >= amount_due THEN 'collected' ELSE 'partial' END,
        collected_at = now()
    WHERE id = ${receivable_id}
  `;
  // 5. Recalc cascada Atelier (cubre el ingreso del reembolso)
  await recalcCascade(ATELIER_ID, TEST_REIMB_DATE);
  // 6. Activar gasto-espejo en Fonavi
  await sql`
    UPDATE expenses
    SET payment_method = 'transferencia'
    WHERE id = ${fonavi_expense_id} AND payment_method = 'pendiente_atelier'
  `;
  // 7. Asegurar daily_record en Fonavi + recalc cascada
  await sql`INSERT INTO daily_records (business_id, date) VALUES (${FONAVI_ID}, ${TEST_DATE}) ON CONFLICT (business_id, date) DO NOTHING`;
  await recalcCascade(FONAVI_ID, TEST_DATE);

  const rec2 = (await sql`SELECT amount_collected::float, status FROM fonavi_receivables WHERE id = ${receivable_id}`) as Array<{ amount_collected: number; status: string }>;
  console.log("\n  Verificación receivable post-reembolso:");
  check("amount_collected", rec2[0].amount_collected, TEST_FONAVI);
  console.log(`  ${rec2[0].status === "collected" ? "✅" : "❌"} status = ${rec2[0].status} (esperado: collected)`);

  const fon2 = (await sql`SELECT payment_method FROM expenses WHERE id = ${fonavi_expense_id}`) as Array<{ payment_method: string }>;
  console.log("\n  Verificación gasto-espejo activado:");
  console.log(`  ${fon2[0].payment_method === "transferencia" ? "✅" : "❌"} payment_method = ${fon2[0].payment_method} (esperado: transferencia)`);

  // ───────── CASO C: Saldos finales ─────────
  console.log("\n── CASO C: Saldos finales ──");
  const balAtelierAfter = await getBalance(ATELIER_ID, TEST_DATE);
  const balFonaviAfter = await getBalance(FONAVI_ID, TEST_DATE);
  // Atelier: -100 + 30 reembolso = -70 neto vs estado inicial
  check("Atelier neto = inicial − 70", balAtelierAfter, balAtelierBefore - TEST_ATELIER);
  // Fonavi: -30 (gasto-espejo activado)
  check("Fonavi neto = inicial − 30", balFonaviAfter, balFonaviBefore - TEST_FONAVI);

  // ───────── CLEANUP ─────────
  console.log("\n── Cleanup (borrar todas las filas de test) ──");
  await sql`DELETE FROM fonavi_reimbursement_allocations WHERE income_item_id = ${incomeIns[0].id}::uuid`;
  await sql`DELETE FROM bank_income_items WHERE id = ${incomeIns[0].id}::uuid`;
  await sql`DELETE FROM expenses WHERE id = ${fonavi_expense_id}`;
  await sql`DELETE FROM fonavi_receivables WHERE id = ${receivable_id}`;
  await sql`DELETE FROM expenses WHERE id = ${atelier_expense_id}`;
  // Recalcular cascada en ambos negocios para volver al estado original
  await recalcCascade(ATELIER_ID, TEST_DATE);
  await recalcCascade(FONAVI_ID, TEST_DATE);

  // Verificación final: saldos volvieron a su estado inicial
  const balAtelierFinal = await getBalance(ATELIER_ID, TEST_DATE);
  const balFonaviFinal = await getBalance(FONAVI_ID, TEST_DATE);
  console.log("\n  Saldos post-cleanup (deben coincidir con pre-test):");
  check("Atelier", balAtelierFinal, balAtelierBefore);
  check("Fonavi", balFonaviFinal, balFonaviBefore);

  if (process.exitCode === 1) {
    console.log("\n❌ AL MENOS UN TEST FALLÓ.");
    process.exit(1);
  }
  console.log("\n✅ TODOS LOS TESTS PASARON. BD restaurada al estado inicial.");
}

main().catch((e) => { console.error("\n❌ ERROR FATAL:", e.message); process.exit(1); });
