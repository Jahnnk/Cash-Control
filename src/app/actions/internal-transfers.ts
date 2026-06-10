"use server";

/**
 * Server actions para transferencias internas entre cuentas del mismo
 * negocio: Efectivo ↔ BCP. Cada transferencia genera un PAR de filas
 * vinculadas por `transfer_pair_id`:
 *   - Una pata en `expenses` (sale dinero de la cuenta origen)
 *   - Una pata en `bank_income_items` (entra a la cuenta destino)
 * Ambas con `is_internal_transfer=true` para excluirlas de reportes
 * operativos pero preservar su impacto en saldos reales.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { recalcBankBalance } from "./daily-records";
import { validateAmount } from "@/lib/money-validation";

export type TransferDirection = "efectivo_to_banco" | "banco_to_efectivo";

export type InternalTransfer = {
  pairId: string;
  date: string;            // YYYY-MM-DD
  amount: number;
  direction: TransferDirection;
  note: string | null;
  createdAt: string;
};

function assertValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("La fecha debe estar en formato YYYY-MM-DD");
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  if (date > today) throw new Error("La fecha no puede ser futura");
}

// ─────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────

export async function createInternalTransfer(data: {
  direction: TransferDirection;
  amount: number;
  date: string;
  note?: string;
}): Promise<{ success: true; pairId: string } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  try {
    assertValidDate(data.date);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Fecha inválida" };
  }
  const amountError = validateAmount(data.amount);
  if (amountError) return { success: false, error: amountError };
  if (data.direction !== "efectivo_to_banco" && data.direction !== "banco_to_efectivo") {
    return { success: false, error: "Dirección inválida" };
  }

  const note = data.note?.trim() || null;
  const amountStr = data.amount.toFixed(2);

  // CTE atómica: si cualquier paso falla, ROLLBACK implícito.
  // Genera el pair_id en SQL para evitar race con drivers sin transactions.
  let result;
  if (data.direction === "efectivo_to_banco") {
    // Sale efectivo → entra a BCP
    result = await db.execute(sql`
      WITH pair AS (SELECT gen_random_uuid() AS id),
      exp_ins AS (
        INSERT INTO expenses (
          business_id, date, category, concept, amount, payment_method,
          notes, is_internal_transfer, transfer_pair_id
        )
        SELECT ${bId}, ${data.date}, 'Transferencia interna', 'Depósito a BCP',
               ${amountStr}, 'efectivo', ${note}, true, pair.id
        FROM pair
        RETURNING id, transfer_pair_id::text AS pair_id
      ),
      inc_ins AS (
        INSERT INTO bank_income_items (
          business_id, date, amount, client_id, note, payment_method,
          is_internal_transfer, transfer_pair_id
        )
        SELECT ${bId}, ${data.date}, ${amountStr}, NULL, ${"Depósito desde efectivo"},
               'transferencia', true, pair.id
        FROM pair
        RETURNING id
      )
      SELECT pair_id FROM exp_ins
    `);
  } else {
    // Sale de BCP → entra efectivo
    result = await db.execute(sql`
      WITH pair AS (SELECT gen_random_uuid() AS id),
      exp_ins AS (
        INSERT INTO expenses (
          business_id, date, category, concept, amount, payment_method,
          notes, is_internal_transfer, transfer_pair_id
        )
        SELECT ${bId}, ${data.date}, 'Transferencia interna', 'Retiro de BCP',
               ${amountStr}, 'transferencia', ${note}, true, pair.id
        FROM pair
        RETURNING id, transfer_pair_id::text AS pair_id
      ),
      inc_ins AS (
        INSERT INTO bank_income_items (
          business_id, date, amount, client_id, note, payment_method,
          is_internal_transfer, transfer_pair_id
        )
        SELECT ${bId}, ${data.date}, ${amountStr}, NULL, ${"Retiro a efectivo"},
               'efectivo', true, pair.id
        FROM pair
        RETURNING id
      )
      SELECT pair_id FROM exp_ins
    `);
  }

  const pairId = (result.rows[0] as { pair_id: string }).pair_id;

  // Asegurar daily_record y recalcular saldo BCP (la pata BCP afecta el saldo)
  await db.execute(sql`
    INSERT INTO daily_records (business_id, date) VALUES (${bId}, ${data.date})
    ON CONFLICT (business_id, date) DO NOTHING
  `);
  await recalcBankBalance(data.date);
  revalidatePath("/", "layout");
  return { success: true, pairId };
}

// ─────────────────────────────────────────────────────────────────
// LIST por fecha
// ─────────────────────────────────────────────────────────────────

export async function getInternalTransfersByDate(date: string): Promise<InternalTransfer[]> {
  const bId = await activeBusinessId();
  // Tomamos solo la pata "expense" como representante (cada par tiene 1
  // expense + 1 bank_income_item). El payment_method del expense indica
  // la dirección: 'efectivo' = salió efectivo (E→B); 'transferencia' = salió BCP (B→E).
  const r = await db.execute(sql`
    SELECT
      transfer_pair_id::text AS pair_id,
      date::text AS date,
      amount::float AS amount,
      payment_method,
      notes,
      created_at::text AS created_at
    FROM expenses
    WHERE business_id = ${bId} AND date = ${date} AND is_internal_transfer = true AND archived = false
    ORDER BY created_at ASC
  `);
  return r.rows.map((row) => {
    const r = row as { pair_id: string; date: string; amount: number; payment_method: string; notes: string | null; created_at: string };
    return {
      pairId: r.pair_id,
      date: r.date,
      amount: Number(r.amount),
      direction: r.payment_method === "efectivo" ? "efectivo_to_banco" : "banco_to_efectivo",
      note: r.notes,
      createdAt: r.created_at,
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────

export async function updateInternalTransfer(
  pairId: string,
  data: { amount: number; date: string; note?: string }
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  try {
    assertValidDate(data.date);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Fecha inválida" };
  }
  const amountError = validateAmount(data.amount);
  if (amountError) return { success: false, error: amountError };

  // Capturar fechas antes (la vieja puede ser distinta de la nueva)
  const before = (await db.execute(sql`
    SELECT date::text AS date FROM expenses
    WHERE business_id = ${bId} AND transfer_pair_id = ${pairId}::uuid AND is_internal_transfer = true
    LIMIT 1
  `)).rows[0] as { date: string } | undefined;
  if (!before) return { success: false, error: "Transferencia no encontrada" };

  const note = data.note?.trim() || null;
  const amountStr = data.amount.toFixed(2);

  await db.execute(sql`
    UPDATE expenses
    SET date = ${data.date}, amount = ${amountStr}, notes = ${note}
    WHERE business_id = ${bId} AND transfer_pair_id = ${pairId}::uuid AND is_internal_transfer = true
  `);
  await db.execute(sql`
    UPDATE bank_income_items
    SET date = ${data.date}, amount = ${amountStr}
    WHERE business_id = ${bId} AND transfer_pair_id = ${pairId}::uuid AND is_internal_transfer = true
  `);

  await db.execute(sql`
    INSERT INTO daily_records (business_id, date) VALUES (${bId}, ${data.date})
    ON CONFLICT (business_id, date) DO NOTHING
  `);
  await recalcBankBalance(before.date);
  if (before.date !== data.date) await recalcBankBalance(data.date);
  revalidatePath("/", "layout");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────

export async function deleteInternalTransfer(
  pairId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  const before = (await db.execute(sql`
    SELECT date::text AS date FROM expenses
    WHERE business_id = ${bId} AND transfer_pair_id = ${pairId}::uuid AND is_internal_transfer = true
    LIMIT 1
  `)).rows[0] as { date: string } | undefined;
  if (!before) return { success: false, error: "Transferencia no encontrada" };

  await db.execute(sql`
    DELETE FROM expenses
    WHERE business_id = ${bId} AND transfer_pair_id = ${pairId}::uuid AND is_internal_transfer = true
  `);
  await db.execute(sql`
    DELETE FROM bank_income_items
    WHERE business_id = ${bId} AND transfer_pair_id = ${pairId}::uuid AND is_internal_transfer = true
  `);
  await recalcBankBalance(before.date);
  revalidatePath("/", "layout");
  return { success: true };
}
