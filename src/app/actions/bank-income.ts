"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { recalcBankBalance } from "./daily-records";

export async function saveBankIncomeItems(
  date: string,
  items: { amount: number; clientId: string | null; note: string; paymentMethod?: string }[]
) {
  const bId = await activeBusinessId();
  // Delete y re-insert SOLO de items operativos. Los préstamos del socio
  // (is_special_loan=true) viven en esta misma tabla pero se gestionan
  // desde /atelier/prestamos-socio — NO deben tocarse desde el feed de
  // Registro Diario.
  // No tocar préstamos del socio ni patas de transferencias internas:
  // tienen sus propios módulos para gestionarlas.
  await db.execute(sql`
    DELETE FROM bank_income_items
    WHERE business_id = ${bId} AND date = ${date}
      AND is_special_loan = false AND is_internal_transfer = false
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

export async function updateBankIncomeItem(id: string, data: { amount?: number; clientId?: string | null; note?: string }) {
  const bId = await activeBusinessId();
  // Cross-tenant guard + bloqueo de filas no-operativas:
  // - is_special_loan=true → módulo Préstamos del Socio
  // - is_internal_transfer=true → módulo Transferencia Interna
  const target = (await db.execute(sql`
    SELECT date::text as date, is_special_loan, is_internal_transfer
    FROM bank_income_items WHERE id = ${id} AND business_id = ${bId}
  `)).rows[0] as { date: string; is_special_loan: boolean; is_internal_transfer: boolean } | undefined;
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

  if (data.amount !== undefined) await db.execute(sql`UPDATE bank_income_items SET amount = ${data.amount} WHERE id = ${id} AND business_id = ${bId}`);
  if (data.clientId !== undefined) await db.execute(sql`UPDATE bank_income_items SET client_id = ${data.clientId} WHERE id = ${id} AND business_id = ${bId}`);
  if (data.note !== undefined) await db.execute(sql`UPDATE bank_income_items SET note = ${data.note} WHERE id = ${id} AND business_id = ${bId}`);

  if (data.amount !== undefined && target) {
    await recalcBankBalance(target.date);
  }
  revalidatePath("/", "layout");
}

export async function deleteBankIncomeItem(id: string) {
  const bId = await activeBusinessId();
  const row = (await db.execute(sql`
    SELECT date::text as date, is_special_loan, is_internal_transfer
    FROM bank_income_items WHERE id = ${id} AND business_id = ${bId}
  `)).rows[0] as { date: string; is_special_loan: boolean; is_internal_transfer: boolean } | undefined;
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
    WHERE bi.business_id = ${bId} AND bi.date = ${date} AND bi.is_special_loan = false AND bi.is_internal_transfer = false
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
