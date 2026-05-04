"use server";

/**
 * Server actions para "Préstamos del socio" (Jahnn → Atelier).
 *
 * Modelo:
 *   - Préstamo (Jahnn → Atelier)  → bank_income_items con is_special_loan = true
 *   - Devolución (Atelier → Jahnn) → expenses con is_special_loan = true
 *                                    y category = LOAN_CATEGORY
 *
 * Saldo pendiente = SUM(préstamos) − SUM(devoluciones).
 *
 * Solo Atelier (business_id = 1) puede operar préstamos del socio.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { ATELIER_BUSINESS_ID, LOAN_CATEGORY } from "@/lib/loans";
import { recalcBankBalance } from "./daily-records";

function assertAtelier(bId: number) {
  if (bId !== ATELIER_BUSINESS_ID) {
    throw new Error("Préstamos del socio solo aplican a Atelier");
  }
}

/**
 * Valida que `date` sea formato YYYY-MM-DD y no sea futura (zona Lima).
 * Lanza error con mensaje legible si falla.
 */
function assertValidLoanDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("La fecha debe estar en formato YYYY-MM-DD");
  }
  // Comparación lexicográfica funciona con ISO YYYY-MM-DD.
  // "Hoy" en zona Lima (America/Lima, UTC-5) — coherente con getToday() del cliente,
  // que usa la fecha del navegador del usuario.
  const today = new Date().toISOString().slice(0, 10);
  if (date > today) {
    throw new Error("La fecha no puede ser futura");
  }
}

// ─────────────────────────────────────────────────────────────────
// Resumen + lista de movimientos
// ─────────────────────────────────────────────────────────────────

export type LoanMovement = {
  id: string;
  kind: "loan" | "refund";
  date: string;          // YYYY-MM-DD
  amount: number;        // siempre positivo
  paymentMethod: string; // efectivo / transferencia / yape / pendiente_atelier
  concept: string;
  notes: string | null;
  createdAt: string;
};

export type LoansSummary = {
  totalLoaned: number;
  totalRefunded: number;
  pendingBalance: number; // = totalLoaned − totalRefunded (≥ 0 normalmente)
  movements: LoanMovement[];
};

export async function getLoansSummary(): Promise<LoansSummary> {
  const bId = await activeBusinessId();
  if (bId !== ATELIER_BUSINESS_ID) {
    return { totalLoaned: 0, totalRefunded: 0, pendingBalance: 0, movements: [] };
  }

  const loansRes = await db.execute(sql`
    SELECT
      id::text AS id,
      'loan'::text AS kind,
      date::text AS date,
      amount::float AS amount,
      'efectivo'::text AS payment_method,
      COALESCE(note, 'Préstamo del socio') AS concept,
      NULL::text AS notes,
      created_at::text AS created_at
    FROM bank_income_items
    WHERE business_id = ${bId} AND is_special_loan = true
  `);

  const refundsRes = await db.execute(sql`
    SELECT
      id::text AS id,
      'refund'::text AS kind,
      date::text AS date,
      amount::float AS amount,
      payment_method,
      concept,
      notes,
      created_at::text AS created_at
    FROM expenses
    WHERE business_id = ${bId} AND is_special_loan = true
  `);

  const movements: LoanMovement[] = [
    ...loansRes.rows.map((r) => ({
      id: r.id as string,
      kind: "loan" as const,
      date: r.date as string,
      amount: Number(r.amount),
      paymentMethod: r.payment_method as string,
      concept: r.concept as string,
      notes: (r.notes as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
    ...refundsRes.rows.map((r) => ({
      id: r.id as string,
      kind: "refund" as const,
      date: r.date as string,
      amount: Number(r.amount),
      paymentMethod: r.payment_method as string,
      concept: r.concept as string,
      notes: (r.notes as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  const totalLoaned = movements
    .filter((m) => m.kind === "loan")
    .reduce((s, m) => s + m.amount, 0);
  const totalRefunded = movements
    .filter((m) => m.kind === "refund")
    .reduce((s, m) => s + m.amount, 0);

  return {
    totalLoaned: Math.round(totalLoaned * 100) / 100,
    totalRefunded: Math.round(totalRefunded * 100) / 100,
    pendingBalance: Math.round((totalLoaned - totalRefunded) * 100) / 100,
    movements,
  };
}

// ─────────────────────────────────────────────────────────────────
// Crear préstamo (Jahnn → Atelier)
// ─────────────────────────────────────────────────────────────────

export async function createLoan(data: {
  date: string;
  amount: number;
  paymentMethod: "efectivo" | "transferencia" | "yape";
  concept: string;
  notes?: string;
}) {
  const bId = await activeBusinessId();
  assertAtelier(bId);
  assertValidLoanDate(data.date);

  if (data.amount <= 0) throw new Error("El monto debe ser mayor a cero");

  // Asegurar que existe daily_record para esa fecha (para que recalcBalance lo vea)
  await db.execute(sql`
    INSERT INTO daily_records (business_id, date)
    VALUES (${bId}, ${data.date})
    ON CONFLICT (business_id, date) DO NOTHING
  `);

  const note = data.notes
    ? `${data.concept} — ${data.notes}`
    : data.concept;

  if (data.paymentMethod === "efectivo") {
    // Préstamo en efectivo: NO toca el banco. Lo guardamos como income
    // del día con flag, pero excluido de bank_balance porque payment_method
    // se infiere por convención (efectivo no afecta el banco). Para
    // mantenerlo simple, lo guardamos en bank_income_items con marcador
    // y agregamos un campo virtual en notes.
    await db.execute(sql`
      INSERT INTO bank_income_items (business_id, date, amount, client_id, note, is_special_loan)
      VALUES (${bId}, ${data.date}, ${data.amount.toFixed(2)}, NULL, ${note}, true)
    `);
    // No se recalcula saldo: el bank_income suma normalmente, pero el
    // balance bancario lo excluiremos vía filtro is_special_loan en la
    // cadena de saldos.
  } else {
    await db.execute(sql`
      INSERT INTO bank_income_items (business_id, date, amount, client_id, note, is_special_loan)
      VALUES (${bId}, ${data.date}, ${data.amount.toFixed(2)}, NULL, ${note}, true)
    `);
    await recalcBankBalance(data.date);
  }

  revalidatePath("/", "layout");
}

// ─────────────────────────────────────────────────────────────────
// Crear devolución (Atelier → Jahnn)
// ─────────────────────────────────────────────────────────────────

export async function createRefund(data: {
  date: string;
  amount: number;
  paymentMethod: "efectivo" | "transferencia" | "yape";
  concept: string;
  notes?: string;
}) {
  const bId = await activeBusinessId();
  assertAtelier(bId);
  assertValidLoanDate(data.date);

  if (data.amount <= 0) throw new Error("El monto debe ser mayor a cero");

  await db.execute(sql`
    INSERT INTO daily_records (business_id, date)
    VALUES (${bId}, ${data.date})
    ON CONFLICT (business_id, date) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO expenses (
      business_id, date, category, concept, amount, payment_method, notes,
      is_special_loan
    ) VALUES (
      ${bId}, ${data.date}, ${LOAN_CATEGORY}, ${data.concept},
      ${data.amount.toFixed(2)}, ${data.paymentMethod}, ${data.notes || null},
      true
    )
  `);

  if (data.paymentMethod !== "efectivo") {
    await recalcBankBalance(data.date);
  }
  revalidatePath("/", "layout");
}

// ─────────────────────────────────────────────────────────────────
// Editar movimiento de préstamo (loan o refund)
// ─────────────────────────────────────────────────────────────────

/**
 * Calcula los totales pendientes excluyendo una fila concreta. Útil para
 * simular el saldo después de un update/delete y rechazar si quedaría
 * en negativo.
 */
async function getTotalsExcluding(
  bId: number,
  excludeKind: "loan" | "refund",
  excludeId: string
): Promise<{ loaned: number; refunded: number }> {
  const loanedRow = (await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM bank_income_items
    WHERE business_id = ${bId} AND is_special_loan = true
      AND ${excludeKind === "loan" ? sql`id <> ${excludeId}` : sql`true`}
  `)).rows[0] as { total: string };
  const refundedRow = (await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
    WHERE business_id = ${bId} AND is_special_loan = true
      AND ${excludeKind === "refund" ? sql`id <> ${excludeId}` : sql`true`}
  `)).rows[0] as { total: string };
  return {
    loaned: parseFloat(loanedRow.total),
    refunded: parseFloat(refundedRow.total),
  };
}

export async function updateLoanMovement(
  id: string,
  kind: "loan" | "refund",
  data: {
    date: string;
    amount: number;
    paymentMethod: "efectivo" | "transferencia" | "yape";
    concept: string;
    notes?: string;
  }
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  assertAtelier(bId);
  assertValidLoanDate(data.date);

  if (data.amount <= 0) {
    return { success: false, error: "El monto debe ser mayor a cero" };
  }
  if (!data.concept.trim()) {
    return { success: false, error: "El concepto es obligatorio" };
  }

  if (kind === "loan") {
    const before = (await db.execute(sql`
      SELECT date::text AS date, amount::float AS amount
      FROM bank_income_items
      WHERE id = ${id} AND business_id = ${bId} AND is_special_loan = true
    `)).rows[0] as { date: string; amount: number } | undefined;
    if (!before) return { success: false, error: "Préstamo no encontrado" };

    // Coherencia: el nuevo total prestado (excluyendo este registro) +
    // el monto editado debe dejar el saldo pendiente >= 0.
    const totals = await getTotalsExcluding(bId, "loan", id);
    const newPending =
      Math.round((totals.loaned + data.amount - totals.refunded) * 100) / 100;
    if (newPending < 0) {
      return {
        success: false,
        error: "Esta operación dejaría el saldo pendiente en negativo. Verifica los montos.",
      };
    }

    const note = data.notes
      ? `${data.concept.trim()} — ${data.notes.trim()}`
      : data.concept.trim();
    await db.execute(sql`
      UPDATE bank_income_items
      SET date = ${data.date}, amount = ${data.amount.toFixed(2)}, note = ${note}
      WHERE id = ${id} AND business_id = ${bId} AND is_special_loan = true
    `);
    // Asegurar daily_record para la fecha nueva
    await db.execute(sql`
      INSERT INTO daily_records (business_id, date) VALUES (${bId}, ${data.date})
      ON CONFLICT (business_id, date) DO NOTHING
    `);
    // Recalcular ambas fechas (vieja y nueva) por si cambiaron
    await recalcBankBalance(before.date);
    if (before.date !== data.date) await recalcBankBalance(data.date);
  } else {
    const before = (await db.execute(sql`
      SELECT date::text AS date, payment_method, amount::float AS amount
      FROM expenses
      WHERE id = ${id} AND business_id = ${bId} AND is_special_loan = true
    `)).rows[0] as { date: string; payment_method: string; amount: number } | undefined;
    if (!before) return { success: false, error: "Devolución no encontrada" };

    const totals = await getTotalsExcluding(bId, "refund", id);
    const newPending =
      Math.round((totals.loaned - totals.refunded - data.amount) * 100) / 100;
    if (newPending < 0) {
      return {
        success: false,
        error: "Esta operación dejaría el saldo pendiente en negativo. Verifica los montos.",
      };
    }

    await db.execute(sql`
      UPDATE expenses
      SET date = ${data.date},
          amount = ${data.amount.toFixed(2)},
          payment_method = ${data.paymentMethod},
          concept = ${data.concept.trim()},
          notes = ${data.notes?.trim() || null}
      WHERE id = ${id} AND business_id = ${bId} AND is_special_loan = true
    `);
    await db.execute(sql`
      INSERT INTO daily_records (business_id, date) VALUES (${bId}, ${data.date})
      ON CONFLICT (business_id, date) DO NOTHING
    `);
    if (before.payment_method !== "efectivo") await recalcBankBalance(before.date);
    if (data.paymentMethod !== "efectivo" && before.date !== data.date) {
      await recalcBankBalance(data.date);
    } else if (data.paymentMethod !== "efectivo" && before.date === data.date) {
      await recalcBankBalance(data.date);
    }
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// Eliminar movimiento de préstamo (loan o refund)
// ─────────────────────────────────────────────────────────────────

export async function deleteLoanMovement(
  id: string,
  kind: "loan" | "refund"
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  assertAtelier(bId);

  if (kind === "loan") {
    const before = (await db.execute(sql`
      SELECT date::text AS date, amount::float AS amount FROM bank_income_items
      WHERE id = ${id} AND business_id = ${bId} AND is_special_loan = true
    `)).rows[0] as { date: string; amount: number } | undefined;
    if (!before) return { success: false, error: "Préstamo no encontrado" };

    // Coherencia: borrar este préstamo no debe dejar pendingBalance < 0.
    const totals = await getTotalsExcluding(bId, "loan", id);
    const newPending =
      Math.round((totals.loaned - totals.refunded) * 100) / 100;
    if (newPending < 0) {
      return {
        success: false,
        error: "Esta operación dejaría el saldo pendiente en negativo. Verifica los montos.",
      };
    }

    await db.execute(sql`
      DELETE FROM bank_income_items
      WHERE id = ${id} AND business_id = ${bId} AND is_special_loan = true
    `);
    await recalcBankBalance(before.date);
  } else {
    const before = (await db.execute(sql`
      SELECT date::text AS date, payment_method FROM expenses
      WHERE id = ${id} AND business_id = ${bId} AND is_special_loan = true
    `)).rows[0] as { date: string; payment_method: string } | undefined;
    if (!before) return { success: false, error: "Devolución no encontrada" };

    // Borrar una devolución solo aumenta pendingBalance, así que no puede
    // volverse negativo. Pero validamos por simetría / paranoia.
    const totals = await getTotalsExcluding(bId, "refund", id);
    const newPending =
      Math.round((totals.loaned - totals.refunded) * 100) / 100;
    if (newPending < 0) {
      return {
        success: false,
        error: "Esta operación dejaría el saldo pendiente en negativo. Verifica los montos.",
      };
    }

    await db.execute(sql`
      DELETE FROM expenses
      WHERE id = ${id} AND business_id = ${bId} AND is_special_loan = true
    `);
    if (before.payment_method !== "efectivo") {
      await recalcBankBalance(before.date);
    }
  }

  revalidatePath("/", "layout");
  return { success: true };
}
