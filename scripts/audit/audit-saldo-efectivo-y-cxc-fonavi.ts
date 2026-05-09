/**
 * AUDIT-ONLY (read-only). Diagnóstico de 2 inconsistencias:
 *   1. Saldo efectivo del Dashboard (S/1,205.25) vs Registro Diario
 *      (S/1,503.25) vs caja física real (S/1,505.00).
 *   2. CxC Fonavi en S/1,308.76 cuando la deuda ya fue pagada.
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function section(title: string, fn: () => Promise<unknown>) {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  " + title);
  console.log("══════════════════════════════════════════════════════════════");
  console.log(JSON.stringify(await fn(), null, 2));
}

const ATELIER = 1;

async function main() {
  await section("1. Servidor: NOW() y zona", async () => {
    return await sql`SELECT NOW() as now_utc, NOW() AT TIME ZONE 'America/Lima' as now_lima, CURRENT_DATE as today_utc, (NOW() AT TIME ZONE 'America/Lima')::date AS today_lima`;
  });

  await section("2. Movimientos efectivo Atelier — bank_income_items completo", async () => {
    return await sql`
      SELECT
        id::text, date::text, amount::float, payment_method, note,
        client_id::text, is_special_loan, is_fonavi_reimbursement,
        created_at::text
      FROM bank_income_items
      WHERE business_id = ${ATELIER} AND payment_method = 'efectivo'
      ORDER BY date ASC, created_at ASC
    `;
  });

  await section("3. Movimientos efectivo Atelier — expenses completo", async () => {
    return await sql`
      SELECT
        id::text, date::text, amount::float, category, concept,
        is_shared, atelier_amount::float, fonavi_amount::float,
        is_special_loan, payment_method, created_at::text
      FROM expenses
      WHERE business_id = ${ATELIER} AND payment_method = 'efectivo'
      ORDER BY date ASC, created_at ASC
    `;
  });

  await section("4. Cálculo desglosado (lo que getCashBalance suma/resta)", async () => {
    return await sql`
      SELECT
        (SELECT COALESCE(SUM(amount),0)::float FROM bank_income_items
          WHERE business_id = ${ATELIER} AND payment_method = 'efectivo' AND is_special_loan = false) AS in_efectivo_operativo,
        (SELECT COALESCE(SUM(amount),0)::float FROM bank_income_items
          WHERE business_id = ${ATELIER} AND payment_method = 'efectivo' AND is_special_loan = true) AS in_efectivo_prestamo_socio,
        (SELECT COALESCE(SUM(amount),0)::float FROM expenses
          WHERE business_id = ${ATELIER} AND payment_method = 'efectivo' AND is_special_loan = false) AS out_efectivo_operativo,
        (SELECT COALESCE(SUM(amount),0)::float FROM expenses
          WHERE business_id = ${ATELIER} AND payment_method = 'efectivo' AND is_special_loan = true) AS out_efectivo_devolucion_socio,
        (SELECT COALESCE(SUM(amount),0)::float FROM bank_income_items
          WHERE business_id = ${ATELIER} AND payment_method = 'efectivo') AS in_total,
        (SELECT COALESCE(SUM(amount),0)::float FROM expenses
          WHERE business_id = ${ATELIER} AND payment_method = 'efectivo') AS out_total
    `;
  });

  await section("5. Movimientos efectivo SOLO del 04/05 (para comparar con Registro Diario)", async () => {
    return await sql`
      WITH ins AS (
        SELECT 'in' AS dir, amount::float, note AS concept, payment_method, is_special_loan, created_at::text
        FROM bank_income_items
        WHERE business_id = ${ATELIER} AND date = '2026-05-04' AND payment_method = 'efectivo'
      ),
      outs AS (
        SELECT 'out' AS dir, amount::float, concept, payment_method, is_special_loan, created_at::text
        FROM expenses
        WHERE business_id = ${ATELIER} AND date = '2026-05-04' AND payment_method = 'efectivo'
      )
      SELECT * FROM ins UNION ALL SELECT * FROM outs
      ORDER BY created_at
    `;
  });

  await section("6. Movimientos con fecha FUTURA (>= 2026-05-05)", async () => {
    return await sql`
      SELECT 'bank_income_items' AS tabla, id::text, business_id, date::text, amount::float, payment_method, note AS concept, is_special_loan, created_at::text
      FROM bank_income_items
      WHERE business_id = ${ATELIER} AND date >= '2026-05-05'
      UNION ALL
      SELECT 'expenses', id::text, business_id, date::text, amount::float, payment_method, concept, is_special_loan, created_at::text
      FROM expenses
      WHERE business_id = ${ATELIER} AND date >= '2026-05-05'
      ORDER BY date, created_at
    `;
  });

  await section("7. fonavi_receivables — schema completo", async () => {
    return await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='fonavi_receivables'
      ORDER BY ordinal_position
    `;
  });

  await section("8. fonavi_receivables — TODAS las filas (cualquier estado)", async () => {
    return await sql`
      SELECT id::text, expense_id::text, amount_due::float, amount_collected::float,
             (amount_due - amount_collected)::float AS pending,
             status, created_at::text, collected_at::text
      FROM fonavi_receivables
      ORDER BY created_at DESC LIMIT 30
    `;
  });

  await section("9. fonavi_reimbursement_allocations — TODAS las filas", async () => {
    return await sql`
      SELECT a.id::text, a.income_item_id::text, a.receivable_id::text, a.amount::float, a.created_at::text,
             bi.amount::float AS income_amount, bi.note, bi.client_id::text
      FROM fonavi_reimbursement_allocations a
      LEFT JOIN bank_income_items bi ON bi.id = a.income_item_id
      ORDER BY a.created_at DESC LIMIT 30
    `;
  });

  await section("10. Relación expense ↔ receivable: gastos compartidos vivos vs receivables", async () => {
    return await sql`
      SELECT
        e.id::text AS expense_id,
        e.date::text,
        e.category,
        e.concept,
        e.amount::float AS amount_total,
        e.atelier_amount::float,
        e.fonavi_amount::float,
        r.id::text AS receivable_id,
        r.amount_due::float,
        r.amount_collected::float,
        r.status
      FROM expenses e
      LEFT JOIN fonavi_receivables r ON r.expense_id = e.id
      WHERE e.business_id = ${ATELIER} AND e.is_shared = true
      ORDER BY e.date DESC, e.created_at DESC
    `;
  });

  await section("11. Ingresos de Atelier con cliente=Fonavi (clientes.name='Fonavi') últimos 30d", async () => {
    return await sql`
      SELECT bi.id::text, bi.date::text, bi.amount::float, bi.note, bi.payment_method,
             bi.is_fonavi_reimbursement, bi.receivable_id::text, c.name AS client_name, bi.created_at::text
      FROM bank_income_items bi
      LEFT JOIN clients c ON c.id = bi.client_id
      WHERE bi.business_id = ${ATELIER}
        AND bi.created_at > NOW() - INTERVAL '30 days'
        AND (c.name ILIKE '%fonavi%' OR bi.is_fonavi_reimbursement = true)
      ORDER BY bi.created_at DESC
    `;
  });
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
