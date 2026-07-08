"use server";

/**
 * Server actions para "Préstamos del socio" (Jahnn → Atelier).
 *
 * Modelo (única fuente de verdad — el flag is_special_loan):
 *   - Préstamo (Jahnn → Atelier)  → bank_income_items con is_special_loan = true
 *   - Devolución (Atelier → Jahnn) → expenses con is_special_loan = true
 *                                    y category = LOAN_CATEGORY
 *
 * Saldo pendiente = SUM(préstamos) − SUM(devoluciones).
 *
 * loan_via_bank distingue CÓMO se movió el dinero (la deuda es la misma):
 *   - entry "directo": Jahnn pagó el gasto con su dinero — no pasó por
 *     cuentas de Atelier. payment_method queda 'transferencia' (fantasma,
 *     como los préstamos históricos) y loan_via_bank=false → no toca
 *     banco ni caja.
 *   - entry "banco": el dinero entró/salió por la cuenta BCP de Atelier.
 *     loan_via_bank=true → la cadena del saldo bancario lo cuenta.
 *   - entry "caja": efectivo físico en la caja. payment_method='efectivo'
 *     → el saldo de caja lo cuenta (getCashBalance no excluye préstamos,
 *     por diseño), el banco no.
 *
 * Solo Atelier (business_id = 1) puede operar préstamos del socio.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { ATELIER_BUSINESS_ID, LOAN_CATEGORY } from "@/lib/loans";
import { SOCIO_METHOD } from "@/lib/payment-methods";
import { recalcBankBalance } from "./daily-records";

const nsql = neon(process.env.DATABASE_URL!);

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

/** Cómo se movió el dinero de un préstamo (ver doc del módulo arriba). */
export type LoanEntry = "directo" | "banco" | "caja";

export type LoanMovement = {
  id: string;
  kind: "loan" | "refund";
  date: string;          // YYYY-MM-DD
  amount: number;        // siempre positivo
  paymentMethod: string; // efectivo / transferencia / yape / pendiente_atelier
  /** Solo préstamos (kind=loan): por dónde entró el dinero. */
  entry: LoanEntry | null;
  /** El movimiento pasó por la cuenta BCP (cuenta en el saldo del banco). */
  viaBank: boolean;
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
      payment_method,
      loan_via_bank,
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
      loan_via_bank,
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
      entry: (r.loan_via_bank
        ? "banco"
        : r.payment_method === "efectivo"
          ? "caja"
          : "directo") as LoanEntry,
      viaBank: Boolean(r.loan_via_bank),
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
      entry: null,
      viaBank: Boolean(r.loan_via_bank),
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

/** payment_method y loan_via_bank que corresponden a cada forma de entrada. */
function loanColumnsForEntry(entry: LoanEntry): { method: string; viaBank: boolean } {
  switch (entry) {
    case "banco":
      return { method: "transferencia", viaBank: true };
    case "caja":
      return { method: "efectivo", viaBank: false };
    case "directo":
      // Método fantasma (igual que los préstamos históricos): no es
      // 'efectivo' para que la caja no lo cuente, y viaBank=false para
      // que el banco tampoco. Solo existe como deuda con el socio.
      return { method: "transferencia", viaBank: false };
  }
}

export async function createLoan(data: {
  date: string;
  amount: number;
  /** Por dónde entró el dinero (ver doc del módulo). */
  entry: LoanEntry;
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

  const { method, viaBank } = loanColumnsForEntry(data.entry);
  await db.execute(sql`
    INSERT INTO bank_income_items (business_id, date, amount, client_id, note, payment_method, is_special_loan, loan_via_bank)
    VALUES (${bId}, ${data.date}, ${data.amount.toFixed(2)}, NULL, ${note}, ${method}, true, ${viaBank})
  `);
  // Solo el préstamo que entró al BCP mueve la cadena del saldo bancario.
  // "caja" se refleja en getCashBalance (sin cadena) y "directo" no toca nada.
  if (viaBank) await recalcBankBalance(data.date);

  revalidatePath("/", "layout");
}

// ─────────────────────────────────────────────────────────────────
// Préstamo DIRECTO GUIADO: Jahnn pagó obligaciones con su dinero.
// UNA operación registra las dos caras de la verdad:
//   1. Los gastos como egresos operativos REALES (método 'socio':
//      cuentan en presupuesto/EBITDA/equilibrio, NO tocan banco ni caja).
//   2. La deuda con el socio por el total (préstamo 'directo').
// Este era el hueco del módulo: el préstamo de junio (Ethel, S/1,812)
// registró la deuda pero el gasto nunca existió — junio quedó con
// insumos invisibles. Con este flujo, imposible que vuelva a pasar.
// ─────────────────────────────────────────────────────────────────

export type DirectLoanItem = {
  category: string;
  concept: string;
  amount: number;
};

export async function createDirectLoanWithExpenses(data: {
  date: string;
  /** Qué pagó Jahnn (cada pago = un gasto operativo real). */
  items: DirectLoanItem[];
  notes?: string;
}): Promise<{ success: true; total: number } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  assertAtelier(bId);
  try {
    assertValidLoanDate(data.date);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Fecha inválida" };
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    return { success: false, error: "Agrega al menos un pago que hizo el socio." };
  }
  for (const it of data.items) {
    if (!it.category?.trim()) return { success: false, error: "Cada pago necesita su categoría." };
    if (!it.concept?.trim()) return { success: false, error: "Cada pago necesita un concepto." };
    if (!Number.isFinite(it.amount) || it.amount <= 0) {
      return { success: false, error: `Monto inválido en "${it.concept ?? it.category}".` };
    }
  }
  const total = Math.round(data.items.reduce((s, it) => s + it.amount, 0) * 100) / 100;
  const loanNote = data.notes?.trim()
    ? `Préstamo directo: ${data.items.map((i) => i.concept.trim()).join(", ")} — ${data.notes.trim()}`
    : `Préstamo directo: ${data.items.map((i) => i.concept.trim()).join(", ")}`;

  try {
    await nsql.transaction([
      nsql`INSERT INTO daily_records (business_id, date) VALUES (${bId}, ${data.date})
           ON CONFLICT (business_id, date) DO NOTHING`,
      // Los gastos: operativos de verdad, pagados por el socio.
      ...data.items.map(
        (it) => nsql`
          INSERT INTO expenses (business_id, date, category, concept, amount, payment_method, notes)
          VALUES (${bId}, ${data.date}, ${it.category.trim()}, ${it.concept.trim()},
                  ${it.amount.toFixed(2)}, ${SOCIO_METHOD}, ${"Pagado por el socio (préstamo directo del " + data.date + ")"})`,
      ),
      // La deuda: préstamo directo por el total (no toca banco ni caja).
      nsql`INSERT INTO bank_income_items (business_id, date, amount, client_id, note, payment_method, is_special_loan, loan_via_bank)
           VALUES (${bId}, ${data.date}, ${total.toFixed(2)}, NULL, ${loanNote}, 'transferencia', true, false)`,
    ]);
    // Ni el préstamo directo ni los gastos 'socio' tocan la cadena del
    // banco — no hace falta recalcular. Sí refrescamos las vistas.
    revalidatePath("/", "layout");
    return { success: true, total };
  } catch (e) {
    console.error("[createDirectLoanWithExpenses] failed:", e);
    return { success: false, error: e instanceof Error ? e.message : "Error al registrar el préstamo" };
  }
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

  // Una devolución por transferencia/yape sale de la cuenta BCP de
  // Atelier → loan_via_bank=true para que la cadena del saldo la reste.
  // (Antes quedaba excluida y el banco no bajaba — descuadre silencioso.)
  const viaBank = data.paymentMethod !== "efectivo";
  await db.execute(sql`
    INSERT INTO expenses (
      business_id, date, category, concept, amount, payment_method, notes,
      is_special_loan, loan_via_bank
    ) VALUES (
      ${bId}, ${data.date}, ${LOAN_CATEGORY}, ${data.concept},
      ${data.amount.toFixed(2)}, ${data.paymentMethod}, ${data.notes || null},
      true, ${viaBank}
    )
  `);

  if (viaBank) {
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
    /** Solo devoluciones (kind=refund). */
    paymentMethod?: "efectivo" | "transferencia" | "yape";
    /** Solo préstamos (kind=loan): por dónde entró el dinero. */
    entry?: LoanEntry;
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

    if (!data.entry) {
      return { success: false, error: "Indica cómo entró el dinero del préstamo" };
    }
    const note = data.notes
      ? `${data.concept.trim()} — ${data.notes.trim()}`
      : data.concept.trim();
    const { method, viaBank } = loanColumnsForEntry(data.entry);
    await db.execute(sql`
      UPDATE bank_income_items
      SET date = ${data.date}, amount = ${data.amount.toFixed(2)}, note = ${note},
          payment_method = ${method}, loan_via_bank = ${viaBank}
      WHERE id = ${id} AND business_id = ${bId} AND is_special_loan = true
    `);
    // Asegurar daily_record para la fecha nueva
    await db.execute(sql`
      INSERT INTO daily_records (business_id, date) VALUES (${bId}, ${data.date})
      ON CONFLICT (business_id, date) DO NOTHING
    `);
    // Recalcular ambas fechas (vieja y nueva): cubre cambios de monto,
    // de fecha y de entrada (banco ↔ directo/caja).
    await recalcBankBalance(before.date);
    if (before.date !== data.date) await recalcBankBalance(data.date);
  } else {
    const before = (await db.execute(sql`
      SELECT date::text AS date, payment_method, amount::float AS amount
      FROM expenses
      WHERE id = ${id} AND business_id = ${bId} AND is_special_loan = true
    `)).rows[0] as { date: string; payment_method: string; amount: number } | undefined;
    if (!before) return { success: false, error: "Devolución no encontrada" };
    if (!data.paymentMethod) {
      return { success: false, error: "Indica el método de la devolución" };
    }

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
          loan_via_bank = ${data.paymentMethod !== "efectivo"},
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
