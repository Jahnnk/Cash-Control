"use server";

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";

const sql = neon(process.env.DATABASE_URL!);

export type ReceivableRow = {
  id: string;
  expense_id: string;
  expense_date: string;
  category: string;
  concept: string;
  amount_total: number;
  atelier_amount: number;
  amount_due: number;
  amount_collected: number;
  amount_pending: number;
  status: "pending" | "partial" | "collected";
  created_at: string;
  collected_at: string | null;
  days_old: number;
};

// Listar todas las cuentas por cobrar con info del egreso
export async function getFonaviReceivables(includeCollected = true): Promise<ReceivableRow[]> {
  const rows = (await sql`
    SELECT
      fr.id::text as id,
      fr.expense_id::text as expense_id,
      e.date::text as expense_date,
      e.category,
      e.concept,
      e.amount::float as amount_total,
      e.atelier_amount::float as atelier_amount,
      fr.amount_due::float as amount_due,
      fr.amount_collected::float as amount_collected,
      (fr.amount_due - fr.amount_collected)::float as amount_pending,
      fr.status,
      fr.created_at::text as created_at,
      fr.collected_at::text as collected_at,
      (CURRENT_DATE - e.date::date) as days_old
    FROM fonavi_receivables fr
    JOIN expenses e ON e.id = fr.expense_id
    ${includeCollected ? sql`` : sql`WHERE fr.status != 'collected'`}
    ORDER BY e.date DESC, fr.created_at DESC
  `) as Record<string, unknown>[];
  return rows as unknown as ReceivableRow[];
}

// Total pendiente (para el dashboard)
export async function getFonaviReceivablesPendingTotal(): Promise<number> {
  const r = (await sql`
    SELECT COALESCE(SUM(amount_due - amount_collected), 0)::float as total
    FROM fonavi_receivables WHERE status != 'collected'
  `) as { total: number }[];
  return r[0].total;
}

// Registrar reembolso: crea bank_income_item con flag + allocations + actualiza receivables
export async function registerFonaviReimbursement(data: {
  date: string;            // fecha del reembolso (entró al banco)
  totalAmount: number;     // monto total recibido
  note: string | null;
  allocations: { receivableId: string; amount: number }[];
}): Promise<{ success: true } | { success: false; error: string }> {
  if (!Number.isFinite(data.totalAmount) || data.totalAmount <= 0) {
    return { success: false, error: "Monto inválido" };
  }
  const sumAllocations = data.allocations.reduce((s, a) => s + a.amount, 0);
  if (Math.round(sumAllocations * 100) !== Math.round(data.totalAmount * 100)) {
    return { success: false, error: "La suma de las asignaciones no coincide con el monto total" };
  }
  if (data.allocations.some((a) => a.amount <= 0)) {
    return { success: false, error: "Cada asignación debe ser mayor a 0" };
  }

  // Pre-validar receivables (existen y montos no exceden lo pendiente)
  for (const alloc of data.allocations) {
    const r = (await sql`
      SELECT amount_due::float as due, amount_collected::float as col, status
      FROM fonavi_receivables WHERE id = ${alloc.receivableId}
    `) as { due: number; col: number; status: string }[];
    if (!r[0]) return { success: false, error: `Receivable ${alloc.receivableId} no existe` };
    if (r[0].status === "collected") return { success: false, error: "Una de las cuentas seleccionadas ya está cobrada" };
    const pending = r[0].due - r[0].col;
    if (Math.round(alloc.amount * 100) > Math.round(pending * 100)) {
      return { success: false, error: `Asignación excede el saldo pendiente de una de las cuentas` };
    }
  }

  // Inserta income_item, captura su id, luego allocations + updates de receivables
  const inserted = (await sql`
    INSERT INTO bank_income_items (date, amount, client_id, note, is_fonavi_reimbursement)
    VALUES (${data.date}, ${data.totalAmount}, NULL, ${data.note || "Reembolso Fonavi"}, true)
    RETURNING id::text
  `) as { id: string }[];
  const incomeItemId = inserted[0].id;

  // Asegurar que el daily_record exista para esa fecha
  await sql`
    INSERT INTO daily_records (date) VALUES (${data.date})
    ON CONFLICT (date) DO NOTHING
  `;

  // Insertar allocations + actualizar receivables
  const txQueries = data.allocations.map((alloc) => sql`
    INSERT INTO fonavi_reimbursement_allocations (income_item_id, receivable_id, amount)
    VALUES (${incomeItemId}::uuid, ${alloc.receivableId}::uuid, ${alloc.amount})
  `);

  for (const alloc of data.allocations) {
    txQueries.push(sql`
      UPDATE fonavi_receivables
      SET amount_collected = amount_collected + ${alloc.amount},
          status = CASE
            WHEN (amount_collected + ${alloc.amount}) >= amount_due THEN 'collected'
            ELSE 'partial'
          END,
          collected_at = CASE
            WHEN (amount_collected + ${alloc.amount}) >= amount_due THEN now()
            ELSE collected_at
          END
      WHERE id = ${alloc.receivableId}
    `);
  }

  // Recalcular bank_income total + bank_balance_real para esa fecha
  txQueries.push(sql`
    UPDATE daily_records SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = ${data.date}), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE date = ${data.date} AND payment_method != 'efectivo'), 0)
    WHERE date = ${data.date}
  `);

  // Cascade bank_balance_real desde la fecha
  txQueries.push(sql`
    WITH RECURSIVE chain AS (
      SELECT
        (${data.date}::date - INTERVAL '1 day')::date AS date,
        COALESCE((
          SELECT bank_balance_real::numeric FROM daily_records
          WHERE date < ${data.date} AND bank_balance_real IS NOT NULL
          ORDER BY date DESC LIMIT 1
        ), 0) AS calc_balance

      UNION ALL

      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = dr.date), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE date = dr.date AND payment_method != 'efectivo'), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = (c.date + INTERVAL '1 day')::date
      WHERE dr.date <= (SELECT MAX(date) FROM daily_records)
    )
    UPDATE daily_records dr
    SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.date = chain.date AND dr.date >= ${data.date}
  `);

  try {
    await sql.transaction(txQueries);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/registro");
  revalidatePath("/reportes");
  revalidatePath("/fonavi");
  return { success: true };
}

// Listar los reembolsos (allocations) que ha recibido un receivable específico
export type ReimbursementHistoryItem = {
  allocation_id: string;
  income_item_id: string;
  date: string;
  amount: number;
  note: string | null;
  income_item_total: number;        // monto total del income_item (puede cubrir varios receivables)
  is_split: boolean;                 // true si el income_item está asignado a >1 receivables
};

export async function getReimbursementsForReceivable(receivableId: string): Promise<ReimbursementHistoryItem[]> {
  const rows = (await sql`
    SELECT
      a.id::text as allocation_id,
      a.income_item_id::text as income_item_id,
      bi.date::text as date,
      a.amount::float as amount,
      bi.note,
      bi.amount::float as income_item_total,
      (SELECT COUNT(*)::int FROM fonavi_reimbursement_allocations WHERE income_item_id = a.income_item_id) > 1 as is_split
    FROM fonavi_reimbursement_allocations a
    JOIN bank_income_items bi ON bi.id = a.income_item_id
    WHERE a.receivable_id = ${receivableId}
    ORDER BY bi.date DESC, a.created_at DESC
  `) as unknown as ReimbursementHistoryItem[];
  return rows;
}

// Elimina UNA allocation. Si el income_item solo tenía esa, se borra completo;
// si tenía varias, se actualiza el monto del income_item y se elimina solo la allocation.
export async function deleteReimbursementAllocation(allocationId: string): Promise<{ success: true } | { success: false; error: string }> {
  // Pre-fetch para audit + decisión
  const allocRows = (await sql`
    SELECT
      a.id::text as id,
      a.income_item_id::text as income_item_id,
      a.receivable_id::text as receivable_id,
      a.amount::float as amount,
      bi.date::text as date,
      bi.amount::float as income_amount,
      bi.note,
      (SELECT COUNT(*)::int FROM fonavi_reimbursement_allocations WHERE income_item_id = a.income_item_id) as alloc_count
    FROM fonavi_reimbursement_allocations a
    JOIN bank_income_items bi ON bi.id = a.income_item_id
    WHERE a.id = ${allocationId}
  `) as { id: string; income_item_id: string; receivable_id: string; amount: number; date: string; income_amount: number; note: string | null; alloc_count: number }[];

  if (!allocRows[0]) return { success: false, error: "Reembolso no encontrado" };
  const a = allocRows[0];

  // Snapshot completo del income_item para audit_log
  const incomeRows = (await sql`SELECT * FROM bank_income_items WHERE id = ${a.income_item_id}`) as Record<string, unknown>[];
  const incomeSnapshot = incomeRows[0];

  const queries = [];

  if (a.alloc_count === 1) {
    // Borrar income_item entero (cascade borra la allocation)
    queries.push(sql`DELETE FROM bank_income_items WHERE id = ${a.income_item_id}`);
  } else {
    // Borrar solo la allocation y reducir el monto del income_item
    queries.push(sql`DELETE FROM fonavi_reimbursement_allocations WHERE id = ${allocationId}`);
    queries.push(sql`UPDATE bank_income_items SET amount = amount - ${a.amount} WHERE id = ${a.income_item_id}`);
  }

  // Revertir el receivable
  queries.push(sql`
    UPDATE fonavi_receivables
    SET amount_collected = amount_collected - ${a.amount},
        status = CASE
          WHEN (amount_collected - ${a.amount}) <= 0 THEN 'pending'
          ELSE 'partial'
        END,
        collected_at = CASE
          WHEN (amount_collected - ${a.amount}) >= amount_due THEN collected_at
          ELSE NULL
        END
    WHERE id = ${a.receivable_id}
  `);

  // Audit
  queries.push(sql`
    INSERT INTO audit_log (action, record_id, record_type, before_data, date_affected)
    VALUES (
      'delete_reimbursement',
      ${allocationId}::uuid,
      'reimbursement_allocation',
      ${JSON.stringify({ allocation: a, income_item: incomeSnapshot })}::jsonb,
      ${a.date}
    )
  `);

  // Recalc cache + balance cascade
  queries.push(sql`
    UPDATE daily_records SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = ${a.date}), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE date = ${a.date} AND payment_method != 'efectivo'), 0)
    WHERE date = ${a.date}
  `);
  queries.push(sql`
    WITH RECURSIVE chain AS (
      SELECT
        (${a.date}::date - INTERVAL '1 day')::date AS date,
        COALESCE((
          SELECT bank_balance_real::numeric FROM daily_records
          WHERE date < ${a.date} AND bank_balance_real IS NOT NULL
          ORDER BY date DESC LIMIT 1
        ), 0) AS calc_balance
      UNION ALL
      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = dr.date), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE date = dr.date AND payment_method != 'efectivo'), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = (c.date + INTERVAL '1 day')::date
      WHERE dr.date <= (SELECT MAX(date) FROM daily_records)
    )
    UPDATE daily_records dr SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.date = chain.date AND dr.date >= ${a.date}
  `);

  try {
    await sql.transaction(queries);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar reembolso" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/registro");
  revalidatePath("/reportes");
  revalidatePath("/fonavi");
  return { success: true };
}

// (legado) Anular un reembolso ENTERO (revierte allocations + actualiza receivables + borra income_item)
export async function deleteFonaviReimbursement(incomeItemId: string): Promise<{ success: true } | { success: false; error: string }> {
  const item = (await sql`SELECT date::text as date FROM bank_income_items WHERE id = ${incomeItemId} AND is_fonavi_reimbursement = true`) as { date: string }[];
  if (!item[0]) return { success: false, error: "Reembolso no encontrado" };
  const date = item[0].date;

  const allocations = (await sql`
    SELECT receivable_id::text as receivable_id, amount::float as amount
    FROM fonavi_reimbursement_allocations WHERE income_item_id = ${incomeItemId}
  `) as { receivable_id: string; amount: number }[];

  const queries = [];
  // Revertir cada allocation en su receivable
  for (const a of allocations) {
    queries.push(sql`
      UPDATE fonavi_receivables
      SET amount_collected = amount_collected - ${a.amount},
          status = CASE
            WHEN (amount_collected - ${a.amount}) <= 0 THEN 'pending'
            ELSE 'partial'
          END,
          collected_at = CASE
            WHEN (amount_collected - ${a.amount}) >= amount_due THEN collected_at
            ELSE NULL
          END
      WHERE id = ${a.receivable_id}
    `);
  }
  // Borrar income_item (las allocations caen por ON DELETE CASCADE)
  queries.push(sql`DELETE FROM bank_income_items WHERE id = ${incomeItemId}`);
  // Refresh totals + cascade
  queries.push(sql`
    UPDATE daily_records SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = ${date}), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE date = ${date} AND payment_method != 'efectivo'), 0)
    WHERE date = ${date}
  `);
  queries.push(sql`
    WITH RECURSIVE chain AS (
      SELECT
        (${date}::date - INTERVAL '1 day')::date AS date,
        COALESCE((
          SELECT bank_balance_real::numeric FROM daily_records
          WHERE date < ${date} AND bank_balance_real IS NOT NULL
          ORDER BY date DESC LIMIT 1
        ), 0) AS calc_balance
      UNION ALL
      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = dr.date), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE date = dr.date AND payment_method != 'efectivo'), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = (c.date + INTERVAL '1 day')::date
      WHERE dr.date <= (SELECT MAX(date) FROM daily_records)
    )
    UPDATE daily_records dr SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.date = chain.date AND dr.date >= ${date}
  `);

  try {
    await sql.transaction(queries);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al anular" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/registro");
  revalidatePath("/reportes");
  revalidatePath("/fonavi");
  return { success: true };
}
