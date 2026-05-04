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
      SELECT date::text AS date FROM bank_income_items
      WHERE id = ${id} AND business_id = ${bId} AND is_special_loan = true
    `)).rows[0] as { date: string } | undefined;
    if (!before) return { success: false, error: "Préstamo no encontrado" };
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
