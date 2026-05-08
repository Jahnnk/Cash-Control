"use server";

/**
 * Server actions para el Resumen Byte B2C (Fonavi y Centro).
 *
 * Cada día con ventas Byte genera hasta 4 filas en bank_income_items
 * (una por método de pago, solo si monto > 0) con flag is_byte_sale=true.
 * Esto permite:
 *   - Que las ventas SE COUNTEN como ingreso operativo (no excluidas).
 *   - Diferenciarlas de ingresos manuales en reportes específicos.
 *   - Idempotencia: re-guardar el mismo día borra y re-inserta.
 *
 * Descuentos (info) se persisten en daily_records.byte_discounts (campo
 * ya existente, mismo patrón que Atelier).
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { recalcBankBalance } from "./daily-records";

export type ByteSalesData = {
  efectivo: number;
  pos: number;
  yape_plin: number;
  transferencia: number;
  descuentos_info: number;
};

const METHODS: Array<{ key: keyof Omit<ByteSalesData, "descuentos_info">; pm: string; label: string }> = [
  { key: "efectivo",      pm: "efectivo",      label: "Efectivo" },
  { key: "pos",           pm: "pos",           label: "POS" },
  { key: "yape_plin",     pm: "yape_plin",     label: "Yape/Plin" },
  { key: "transferencia", pm: "transferencia", label: "Transferencia" },
];

function assertNonNegative(n: number, label: string) {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label}: debe ser un monto válido ≥ 0`);
  }
}

function assertValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha inválida (YYYY-MM-DD)");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  if (date > today) throw new Error("La fecha no puede ser futura");
}

export async function saveByteSales(
  date: string,
  data: ByteSalesData
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  try {
    assertValidDate(date);
    assertNonNegative(data.efectivo, "Efectivo");
    assertNonNegative(data.pos, "POS");
    assertNonNegative(data.yape_plin, "Yape/Plin");
    assertNonNegative(data.transferencia, "Transferencia");
    assertNonNegative(data.descuentos_info, "Descuentos");
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Validación falló" };
  }

  // 1. Borrar filas Byte previas del día (idempotente)
  // No tocar filas archivadas (de resets previos).
  await db.execute(sql`
    DELETE FROM bank_income_items
    WHERE business_id = ${bId} AND date = ${date} AND is_byte_sale = true AND archived = false
  `);

  // 2. Insertar 1 fila por cada método con monto > 0
  for (const m of METHODS) {
    const amount = data[m.key];
    if (amount > 0) {
      await db.execute(sql`
        INSERT INTO bank_income_items (
          business_id, date, amount, client_id, note, payment_method, is_byte_sale
        ) VALUES (
          ${bId}, ${date}, ${amount.toFixed(2)}, NULL,
          ${"Venta del día via " + m.label}, ${m.pm}, true
        )
      `);
    }
  }

  // 3. Asegurar daily_record y guardar Descuentos (info) + Total Byte
  const total = data.efectivo + data.pos + data.yape_plin + data.transferencia;
  await db.execute(sql`
    INSERT INTO daily_records (business_id, date, byte_discounts, byte_total)
    VALUES (${bId}, ${date}, ${data.descuentos_info.toFixed(2)}, ${total.toFixed(2)})
    ON CONFLICT (business_id, date) DO UPDATE SET
      byte_discounts = ${data.descuentos_info.toFixed(2)},
      byte_total = ${total.toFixed(2)}
  `);

  // 4. Recalcular saldo BCP en cadena (las filas POS/Yape/Transfer afectan banco;
  //    Efectivo afecta saldo efectivo via getCashBalance que lee directo de la tabla).
  await recalcBankBalance(date);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function getByteSales(date: string): Promise<ByteSalesData> {
  const bId = await activeBusinessId();

  const rows = await db.execute(sql`
    SELECT payment_method, amount::float AS amount
    FROM bank_income_items
    WHERE business_id = ${bId} AND date = ${date} AND is_byte_sale = true AND archived = false
  `);

  const out: ByteSalesData = {
    efectivo: 0, pos: 0, yape_plin: 0, transferencia: 0, descuentos_info: 0,
  };
  for (const r of rows.rows as Array<{ payment_method: string; amount: number }>) {
    if (r.payment_method === "efectivo") out.efectivo += r.amount;
    else if (r.payment_method === "pos") out.pos += r.amount;
    else if (r.payment_method === "yape_plin") out.yape_plin += r.amount;
    else if (r.payment_method === "transferencia") out.transferencia += r.amount;
    else if (r.payment_method === "yape") out.yape_plin += r.amount; // compat con valor antiguo
  }

  // Cargar descuentos del daily_record
  const dr = (await db.execute(sql`
    SELECT byte_discounts::float AS d FROM daily_records
    WHERE business_id = ${bId} AND date = ${date}
  `)).rows[0] as { d: number } | undefined;
  if (dr) out.descuentos_info = dr.d ?? 0;

  return out;
}
