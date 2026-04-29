// Corrección de saldos desfasados.
// Ejecuta B (audit pre) → A1 (recalc cadena) → recalc cache bank_income/bank_expense → A3 (audit post).
// Todo dentro de transacción atómica.
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const FIRST_BAD_DATE = "2026-04-25";
const ANCHOR_DATE = "2026-04-24"; // último día perfecto

function fmt(n: number) {
  return "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  console.log("===== EJECUTANDO CORRECCIÓN A+B =====\n");

  // Pre-snapshot
  const before = (await sql`
    SELECT id, date::text as date, bank_balance_real::float as balance
    FROM daily_records
    WHERE date >= ${FIRST_BAD_DATE}
    ORDER BY date ASC
  `) as { id: string; date: string; balance: number }[];

  console.log("Estado ANTES:");
  for (const r of before) console.log(`  ${r.date}: ${fmt(r.balance)}`);

  // Transacción atómica: 4 queries
  console.log("\nEjecutando transacción atómica…");

  const insertAuditPre = sql`
    INSERT INTO audit_log (action, record_id, record_type, before_data, after_data, date_affected, user_note)
    SELECT
      'edit',
      id,
      'daily_record_balance',
      jsonb_build_object('date', date::text, 'bank_balance_real', bank_balance_real::text),
      NULL,
      date,
      '[corrección de cache desactualizado por edición manual de saldo]'
    FROM daily_records
    WHERE date >= ${FIRST_BAD_DATE}
    ORDER BY date ASC
  `;

  const recalcCascade = sql`
    WITH RECURSIVE chain AS (
      SELECT date, bank_balance_real::numeric AS calc_balance
      FROM daily_records
      WHERE date = ${ANCHOR_DATE}

      UNION ALL

      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = dr.date), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE date = dr.date AND payment_method != 'efectivo'), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = c.date + INTERVAL '1 day'
      WHERE dr.date <= (SELECT MAX(date) FROM daily_records)
    )
    UPDATE daily_records dr
    SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.date = chain.date AND dr.date >= ${FIRST_BAD_DATE}
  `;

  // Recalcular el cache bank_income / bank_expense (excluyendo efectivo)
  // No solo en días afectados sino TODOS, para barrer el bug del efectivo.
  const recalcCache = sql`
    UPDATE daily_records dr SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = dr.date), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE date = dr.date AND payment_method != 'efectivo'), 0)
  `;

  const updateAuditPost = sql`
    UPDATE audit_log a
    SET after_data = jsonb_build_object('date', dr.date::text, 'bank_balance_real', dr.bank_balance_real::text)
    FROM daily_records dr
    WHERE a.user_note = '[corrección de cache desactualizado por edición manual de saldo]'
      AND a.record_id = dr.id
      AND a.after_data IS NULL
  `;

  await sql.transaction([insertAuditPre, recalcCascade, recalcCache, updateAuditPost]);

  console.log("✅ Transacción completada\n");

  // Post-snapshot
  const after = (await sql`
    SELECT date::text as date, bank_balance_real::float as balance, bank_income::float as inc, bank_expense::float as exp
    FROM daily_records
    WHERE date >= ${FIRST_BAD_DATE}
    ORDER BY date ASC
  `) as { date: string; balance: number; inc: number; exp: number }[];

  console.log("Estado DESPUÉS:");
  for (const r of after) console.log(`  ${r.date}: ${fmt(r.balance)}  (inc=${fmt(r.inc)} exp=${fmt(r.exp)})`);

  // Verificación audit_log
  const auditEntries = (await sql`
    SELECT date_affected::text as date_affected, before_data, after_data
    FROM audit_log
    WHERE user_note = '[corrección de cache desactualizado por edición manual de saldo]'
    ORDER BY date_affected ASC
  `) as Record<string, unknown>[];

  console.log(`\n✅ audit_log: ${auditEntries.length} entradas creadas`);
  for (const a of auditEntries) {
    const b = (a.before_data as Record<string, unknown>)?.bank_balance_real;
    const af = (a.after_data as Record<string, unknown> | null)?.bank_balance_real;
    console.log(`  ${a.date_affected}: ${b} → ${af}`);
  }

  // Saldo HOY
  const todayBal = (await sql`
    SELECT bank_balance_real::float as balance, date::text as date
    FROM daily_records
    WHERE bank_balance_real IS NOT NULL
    ORDER BY date DESC LIMIT 1
  `) as { balance: number; date: string }[];

  console.log(`\n✅ Saldo BCP HOY (${todayBal[0].date}): ${fmt(todayBal[0].balance)}`);
  console.log(`   Banco real reportado: ${fmt(7668.72)}`);
  console.log(`   Diferencia: ${fmt(todayBal[0].balance - 7668.72)}`);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
