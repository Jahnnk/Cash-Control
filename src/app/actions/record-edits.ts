"use server";

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";

// Cliente directo (no Drizzle) para tener acceso a sql.transaction([...]) atómico
const sql = neon(process.env.DATABASE_URL!);

type Result = { success: true } | { success: false; error: string };

// ---------- Helpers de recálculo (queries reutilizadas en cada transacción) ----------

function recalcDailyTotalsQuery(date: string) {
  return sql`
    UPDATE daily_records SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE date = ${date}), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE date = ${date} AND payment_method != 'efectivo'), 0)
    WHERE date = ${date}
  `;
}

// Recalcula bank_balance_real EN CADENA desde `date` hasta el último día con datos.
// Cada saldo posterior usa el saldo recién calculado del día anterior.
function recalcBankBalanceQuery(date: string) {
  return sql`
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
    UPDATE daily_records dr
    SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.date = chain.date AND dr.date >= ${date}
  `;
}

function revalidateAll() {
  revalidatePath("/registro");
  revalidatePath("/dashboard");
  revalidatePath("/reportes");
}

// ---------- Validaciones comunes ----------

function validateAmount(amount: unknown): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "Monto inválido";
  if (amount <= 0) return "El monto debe ser mayor a 0";
  if (amount > 999999.99) return "Monto fuera de rango";
  return null;
}

function validateNonEmpty(value: unknown, fieldLabel: string): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return `${fieldLabel} no puede estar vacío`;
  return null;
}

// ============================================================================
// INGRESOS (bank_income_items)
// ============================================================================

export async function updateIncomeItem(
  id: string,
  changes: { amount: number; note: string; clientId: string | null }
): Promise<Result> {
  const amountErr = validateAmount(changes.amount);
  if (amountErr) return { success: false, error: amountErr };

  // Pre-fetch para audit + capturar fecha
  const before = (await sql`SELECT * FROM bank_income_items WHERE id = ${id}`) as Record<string, unknown>[];
  if (!before[0]) return { success: false, error: "El registro ya no existe" };
  const original = before[0];
  const date = original.date as string;

  // Validar cliente si viene seteado
  if (changes.clientId !== null) {
    const clientExists = (await sql`SELECT id FROM clients WHERE id = ${changes.clientId}`) as { id: string }[];
    if (!clientExists[0]) return { success: false, error: "Cliente no válido" };
  }

  const after = { ...original, amount: String(changes.amount), note: changes.note, client_id: changes.clientId };

  try {
    await sql.transaction([
      sql`
        UPDATE bank_income_items
        SET amount = ${changes.amount}, note = ${changes.note}, client_id = ${changes.clientId}
        WHERE id = ${id}
      `,
      sql`
        INSERT INTO audit_log (action, record_id, record_type, before_data, after_data, date_affected)
        VALUES ('edit', ${id}, 'income_item', ${JSON.stringify(original)}::jsonb, ${JSON.stringify(after)}::jsonb, ${date})
      `,
      recalcDailyTotalsQuery(date),
      recalcBankBalanceQuery(date),
    ]);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar" };
  }

  revalidateAll();
  return { success: true };
}

export async function deleteIncomeItem(id: string): Promise<Result> {
  const before = (await sql`SELECT * FROM bank_income_items WHERE id = ${id}`) as Record<string, unknown>[];
  if (!before[0]) return { success: false, error: "El registro ya no existe" };
  const original = before[0];
  const date = original.date as string;

  try {
    await sql.transaction([
      sql`DELETE FROM bank_income_items WHERE id = ${id}`,
      sql`
        INSERT INTO audit_log (action, record_id, record_type, before_data, date_affected)
        VALUES ('delete', ${id}, 'income_item', ${JSON.stringify(original)}::jsonb, ${date})
      `,
      recalcDailyTotalsQuery(date),
      recalcBankBalanceQuery(date),
    ]);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar" };
  }

  revalidateAll();
  return { success: true };
}

// ============================================================================
// EGRESOS (expenses)
// ============================================================================

export async function updateExpense(
  id: string,
  changes: { amount: number; category: string; concept: string; paymentMethod: string; notes: string | null }
): Promise<Result> {
  const amountErr = validateAmount(changes.amount);
  if (amountErr) return { success: false, error: amountErr };
  const catErr = validateNonEmpty(changes.category, "Categoría");
  if (catErr) return { success: false, error: catErr };
  const conceptErr = validateNonEmpty(changes.concept, "Concepto");
  if (conceptErr) return { success: false, error: conceptErr };
  if (!["transferencia", "efectivo", "yape"].includes(changes.paymentMethod)) {
    return { success: false, error: "Método de pago no válido" };
  }

  const before = (await sql`SELECT * FROM expenses WHERE id = ${id}`) as Record<string, unknown>[];
  if (!before[0]) return { success: false, error: "El registro ya no existe" };
  const original = before[0];
  const date = original.date as string;

  const after = {
    ...original,
    amount: String(changes.amount),
    category: changes.category,
    concept: changes.concept,
    payment_method: changes.paymentMethod,
    notes: changes.notes,
  };

  try {
    await sql.transaction([
      sql`
        UPDATE expenses SET
          amount = ${changes.amount},
          category = ${changes.category},
          concept = ${changes.concept},
          payment_method = ${changes.paymentMethod},
          notes = ${changes.notes}
        WHERE id = ${id}
      `,
      sql`
        INSERT INTO audit_log (action, record_id, record_type, before_data, after_data, date_affected)
        VALUES ('edit', ${id}, 'expense', ${JSON.stringify(original)}::jsonb, ${JSON.stringify(after)}::jsonb, ${date})
      `,
      recalcDailyTotalsQuery(date),
      recalcBankBalanceQuery(date),
    ]);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar" };
  }

  revalidateAll();
  return { success: true };
}

export async function deleteExpense(id: string): Promise<Result> {
  const before = (await sql`SELECT * FROM expenses WHERE id = ${id}`) as Record<string, unknown>[];
  if (!before[0]) return { success: false, error: "El registro ya no existe" };
  const original = before[0];
  const date = original.date as string;

  // Edge case: gasto compartido con reembolsos asignados
  if (original.is_shared) {
    const allocs = (await sql`
      SELECT COUNT(*)::int as n
      FROM fonavi_reimbursement_allocations a
      JOIN fonavi_receivables r ON r.id = a.receivable_id
      WHERE r.expense_id = ${id}
    `) as { n: number }[];
    if (allocs[0].n > 0) {
      return { success: false, error: "No se puede eliminar este egreso porque ya tiene reembolsos registrados. Primero gestiona los reembolsos en 'Cuentas por cobrar Fonavi'." };
    }
  }

  try {
    await sql.transaction([
      sql`DELETE FROM expenses WHERE id = ${id}`,
      sql`
        INSERT INTO audit_log (action, record_id, record_type, before_data, date_affected)
        VALUES ('delete', ${id}, 'expense', ${JSON.stringify(original)}::jsonb, ${date})
      `,
      recalcDailyTotalsQuery(date),
      recalcBankBalanceQuery(date),
    ]);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar" };
  }

  revalidateAll();
  return { success: true };
}
