"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { recalcBankBalance } from "./daily-records";

/**
 * Crea un único ingreso a Ctas. y Efectivo (sin tocar el resto del día).
 *
 * Diferencia con `saveBankIncomeItems`: aquella reemplaza TODOS los
 * ítems operativos del día (DELETE + INSERT), pensada para el flujo
 * batch de Registro Diario. Esta inserta una sola fila, pensada para
 * el flujo de creación desde "Movimientos diarios" en Reportes,
 * donde Jahnn está conciliando contra BCP en vivo y solo quiere
 * agregar un movimiento puntual.
 *
 * Mismas validaciones de tipo que el resto del módulo: solo permite
 * crear filas operativas normales (is_special_loan=false,
 * is_internal_transfer=false, is_byte_sale=false). Los flags
 * especiales tienen sus propios módulos de gestión.
 *
 * Garantiza que exista la fila correspondiente en daily_records
 * (INSERT ... ON CONFLICT DO NOTHING) antes de recalcular saldos,
 * para evitar que recalcBankBalance sea no-op cuando se registra
 * en un día completamente nuevo.
 */
export async function createBankIncomeItem(data: {
  date: string;
  amount: number;
  clientId?: string | null;
  note?: string;
  paymentMethod?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();

  // Validaciones (consistentes con registro-form y EditRecordModal)
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    return { success: false, error: "El monto debe ser mayor a 0" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return { success: false, error: "Fecha inválida" };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (data.date > today) {
    return { success: false, error: "No se pueden registrar movimientos con fecha futura" };
  }

  const method = data.paymentMethod ?? "transferencia";

  // Asegura que exista daily_records para que recalcBankBalance no sea no-op.
  await db.execute(sql`
    INSERT INTO daily_records (business_id, date)
    VALUES (${bId}, ${data.date})
    ON CONFLICT (business_id, date) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO bank_income_items (business_id, date, amount, client_id, note, payment_method)
    VALUES (${bId}, ${data.date}, ${data.amount}, ${data.clientId ?? null}, ${data.note?.trim() || null}, ${method})
  `);

  await recalcBankBalance(data.date);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function saveBankIncomeItems(
  date: string,
  items: { amount: number; clientId: string | null; note: string; paymentMethod?: string }[]
) {
  const bId = await activeBusinessId();
  // Delete y re-insert SOLO de items operativos. Los préstamos del socio
  // (is_special_loan=true) viven en esta misma tabla pero se gestionan
  // desde /atelier/prestamos-socio — NO deben tocarse desde el feed de
  // Registro Diario.
  // No tocar préstamos del socio, patas de transferencias internas, ni
  // ventas Byte: cada una tiene su propio módulo de gestión.
  await db.execute(sql`
    DELETE FROM bank_income_items
    WHERE business_id = ${bId} AND date = ${date}
      AND is_special_loan = false AND is_internal_transfer = false
      AND is_byte_sale = false AND archived = false
  `);

  for (const item of items) {
    const method = item.paymentMethod ?? "transferencia";
    await db.execute(sql`
      INSERT INTO bank_income_items (business_id, date, amount, client_id, note, payment_method)
      VALUES (${bId}, ${date}, ${item.amount}, ${item.clientId}, ${item.note || null}, ${method})
    `);
  }

  // Cache total en daily_records (banco + efectivo, ingresos brutos del día).
  // La distinción banco/efectivo se aplica solo en el cálculo de saldo BCP.
  const total = items.reduce((s, i) => s + i.amount, 0);
  await db.execute(sql`
    UPDATE daily_records SET bank_income = ${total}
    WHERE business_id = ${bId} AND date = ${date}
  `);

  await recalcBankBalance(date);
  revalidatePath("/", "layout");
}

// Métodos válidos al editar el método de pago de un ingreso desde el feed.
// Solo 'efectivo' NO cuenta para el saldo BCP; el resto sí (regla canónica).
const ALLOWED_INCOME_METHODS = ["transferencia", "efectivo", "yape", "yape_plin", "plin", "pos"];

export async function updateBankIncomeItem(id: string, data: { amount?: number; clientId?: string | null; note?: string; paymentMethod?: string }) {
  const bId = await activeBusinessId();
  // Cross-tenant guard + bloqueo de filas no-operativas:
  // - is_special_loan=true → módulo Préstamos del Socio
  // - is_internal_transfer=true → módulo Transferencia Interna
  // - is_byte_sale=true → sección Resumen Byte
  const target = (await db.execute(sql`
    SELECT date::text as date, is_special_loan, is_internal_transfer, is_byte_sale
    FROM bank_income_items WHERE id = ${id} AND business_id = ${bId}
  `)).rows[0] as { date: string; is_special_loan: boolean; is_internal_transfer: boolean; is_byte_sale: boolean } | undefined;
  if (target?.is_special_loan) {
    throw new Error(
      "No se puede editar un préstamo del socio desde el feed de banco. Usa el módulo de Préstamos del Socio."
    );
  }
  if (target?.is_internal_transfer) {
    throw new Error(
      "No se puede editar una transferencia interna desde el feed de banco. Usa el módulo de Transferencia Interna."
    );
  }
  if (target?.is_byte_sale) {
    throw new Error(
      "No se puede editar una venta Byte desde el feed de banco. Usa la sección Resumen Byte."
    );
  }

  if (data.paymentMethod !== undefined && !ALLOWED_INCOME_METHODS.includes(data.paymentMethod)) {
    throw new Error("Método de pago no válido");
  }

  if (data.amount !== undefined) await db.execute(sql`UPDATE bank_income_items SET amount = ${data.amount} WHERE id = ${id} AND business_id = ${bId}`);
  if (data.clientId !== undefined) await db.execute(sql`UPDATE bank_income_items SET client_id = ${data.clientId} WHERE id = ${id} AND business_id = ${bId}`);
  if (data.note !== undefined) await db.execute(sql`UPDATE bank_income_items SET note = ${data.note} WHERE id = ${id} AND business_id = ${bId}`);
  if (data.paymentMethod !== undefined) await db.execute(sql`UPDATE bank_income_items SET payment_method = ${data.paymentMethod} WHERE id = ${id} AND business_id = ${bId}`);

  // Recalcular el saldo si cambió el monto O el método (efectivo sale del
  // banco, transferencia/yape entran). Antes solo recalculaba por monto.
  if ((data.amount !== undefined || data.paymentMethod !== undefined) && target) {
    await recalcBankBalance(target.date);
  }
  revalidatePath("/", "layout");
}

export async function deleteBankIncomeItem(id: string) {
  const bId = await activeBusinessId();
  const row = (await db.execute(sql`
    SELECT date::text as date, is_special_loan, is_internal_transfer, is_byte_sale
    FROM bank_income_items WHERE id = ${id} AND business_id = ${bId}
  `)).rows[0] as { date: string; is_special_loan: boolean; is_internal_transfer: boolean; is_byte_sale: boolean } | undefined;
  if (row?.is_special_loan) {
    throw new Error(
      "No se puede borrar un préstamo del socio desde el feed de banco. Usa el módulo de Préstamos del Socio."
    );
  }
  if (row?.is_internal_transfer) {
    throw new Error(
      "No se puede borrar una transferencia interna desde el feed de banco. Usa el módulo de Transferencia Interna."
    );
  }
  if (row?.is_byte_sale) {
    throw new Error(
      "No se puede borrar una venta Byte desde el feed de banco. Usa la sección Resumen Byte."
    );
  }
  await db.execute(sql`DELETE FROM bank_income_items WHERE id = ${id} AND business_id = ${bId}`);
  if (row) await recalcBankBalance(row.date);
  revalidatePath("/", "layout");
}

export async function getBankIncomeItems(date: string) {
  const bId = await activeBusinessId();
  // Excluye préstamos del socio (is_special_loan=true): se gestionan en
  // /atelier/prestamos-socio y NO deben aparecer en el feed operativo.
  const result = await db.execute(sql`
    SELECT bi.*, c.name as client_name
    FROM bank_income_items bi
    LEFT JOIN clients c ON c.id = bi.client_id
    WHERE bi.business_id = ${bId} AND bi.date = ${date} AND bi.is_special_loan = false AND bi.is_internal_transfer = false AND bi.is_byte_sale = false AND bi.archived = false
    ORDER BY bi.sort_order ASC, bi.created_at ASC
  `);
  return result.rows;
}

export async function reorderBankIncomeItems(items: { id: string; sortOrder: number }[]) {
  const bId = await activeBusinessId();
  for (const item of items) {
    await db.execute(sql`
      UPDATE bank_income_items SET sort_order = ${item.sortOrder}
      WHERE id = ${item.id} AND business_id = ${bId}
    `);
  }
}
