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

// ─────────────────────────────────────────────────────────────────
// CRUD del registro Byte del día — mover entre fechas + eliminar.
// Decisión: la edición de MONTOS sigue ocurriendo vía
//   saveByteSales (Centro/Fonavi) y upsertDailyRecord (Atelier)
// que ya son idempotentes (re-guardar sobrescribe). El gap real era
// (a) cambiar la fecha de un registro ya guardado (caso usuario:
//     19/05 → 18/05), y
// (b) borrar el registro Byte completo de un día.
// Estas dos operaciones se manejan acá con audit_log + recalc en
// cadena desde la fecha MÁS ANTIGUA afectada.
// ─────────────────────────────────────────────────────────────────

export type ByteDayRecord = {
  date: string;
  hasData: boolean;
  total: number;
  b2c: ByteSalesData | null;
  atelier: {
    byteTotal: number;
    byteCashPhysical: number;
    byteDigital: number;
    byteCreditDay: number;
    byteCreditCollected: number;
    byteCashSale: number;
    byteDiscounts: number;
  } | null;
};

/**
 * Snapshot del registro Byte del día activo. Devuelve `b2c` para
 * Centro/Fonavi (id=2,3) o `atelier` para Atelier (id=1). `hasData=true`
 * cuando hay al menos un monto > 0.
 */
export async function getByteDayRecord(date: string): Promise<ByteDayRecord> {
  const bId = await activeBusinessId();
  if (bId === 1) {
    const r = (await db.execute(sql`
      SELECT
        COALESCE(byte_total::float, 0) AS byte_total,
        COALESCE(byte_cash_physical::float, 0) AS byte_cash_physical,
        COALESCE(byte_digital::float, 0) AS byte_digital,
        COALESCE(byte_credit_day::float, 0) AS byte_credit_day,
        COALESCE(byte_credit_collected::float, 0) AS byte_credit_collected,
        COALESCE(byte_cash_sale::float, 0) AS byte_cash_sale,
        COALESCE(byte_discounts::float, 0) AS byte_discounts
      FROM daily_records
      WHERE business_id = ${bId} AND date = ${date} AND archived = false
    `)).rows[0] as undefined | {
      byte_total: number; byte_cash_physical: number; byte_digital: number;
      byte_credit_day: number; byte_credit_collected: number;
      byte_cash_sale: number; byte_discounts: number;
    };
    const totals = r ?? {
      byte_total: 0, byte_cash_physical: 0, byte_digital: 0,
      byte_credit_day: 0, byte_credit_collected: 0, byte_cash_sale: 0,
      byte_discounts: 0,
    };
    const total = Number(totals.byte_total);
    return {
      date,
      hasData: total > 0 || Number(totals.byte_cash_sale) > 0 || Number(totals.byte_credit_day) > 0,
      total,
      b2c: null,
      atelier: {
        byteTotal: Number(totals.byte_total),
        byteCashPhysical: Number(totals.byte_cash_physical),
        byteDigital: Number(totals.byte_digital),
        byteCreditDay: Number(totals.byte_credit_day),
        byteCreditCollected: Number(totals.byte_credit_collected),
        byteCashSale: Number(totals.byte_cash_sale),
        byteDiscounts: Number(totals.byte_discounts),
      },
    };
  }
  const b2c = await getByteSales(date);
  const total = b2c.efectivo + b2c.pos + b2c.yape_plin + b2c.transferencia;
  return {
    date,
    hasData: total > 0 || b2c.descuentos_info > 0,
    total,
    b2c,
    atelier: null,
  };
}

function todayLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/**
 * Mueve el registro Byte de `fromDate` a `toDate`. Si toDate ya tenía
 * un registro Byte, se sobrescribe (semántica idempotente igual a
 * saveByteSales). Recalcula desde MIN(fromDate, toDate). Audit log.
 */
export async function moveByteRecord(
  fromDate: string,
  toDate: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  try {
    assertValidDate(fromDate);
    assertValidDate(toDate);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Fechas inválidas" };
  }
  if (fromDate === toDate) return { success: true };
  if (toDate > todayLima()) {
    return { success: false, error: "La fecha destino no puede ser futura" };
  }

  const before = await getByteDayRecord(fromDate);
  if (!before.hasData) {
    return { success: false, error: "No hay registro Byte para mover en la fecha origen" };
  }

  const recalcStart = fromDate < toDate ? fromDate : toDate;
  const recordType = bId === 1 ? "byte_sale_atelier" : "byte_sale_b2c";

  if (bId === 1 && before.atelier) {
    const a = before.atelier;
    await db.execute(sql`
      INSERT INTO daily_records (
        business_id, date, byte_total, byte_cash_physical, byte_digital,
        byte_credit_day, byte_credit_collected, byte_cash_sale, byte_discounts
      ) VALUES (
        ${bId}, ${toDate}, ${a.byteTotal.toFixed(2)}, ${a.byteCashPhysical.toFixed(2)},
        ${a.byteDigital.toFixed(2)}, ${a.byteCreditDay.toFixed(2)},
        ${a.byteCreditCollected.toFixed(2)}, ${a.byteCashSale.toFixed(2)},
        ${a.byteDiscounts.toFixed(2)}
      )
      ON CONFLICT (business_id, date) DO UPDATE SET
        byte_total = EXCLUDED.byte_total,
        byte_cash_physical = EXCLUDED.byte_cash_physical,
        byte_digital = EXCLUDED.byte_digital,
        byte_credit_day = EXCLUDED.byte_credit_day,
        byte_credit_collected = EXCLUDED.byte_credit_collected,
        byte_cash_sale = EXCLUDED.byte_cash_sale,
        byte_discounts = EXCLUDED.byte_discounts
    `);
    await db.execute(sql`
      UPDATE daily_records SET
        byte_total = 0, byte_cash_physical = 0, byte_digital = 0,
        byte_credit_day = 0, byte_credit_collected = 0,
        byte_cash_sale = 0, byte_discounts = 0
      WHERE business_id = ${bId} AND date = ${fromDate}
    `);
  } else if (before.b2c) {
    // Borrar filas Byte previas en toDate para evitar duplicados
    await db.execute(sql`
      DELETE FROM bank_income_items
      WHERE business_id = ${bId} AND date = ${toDate} AND is_byte_sale = true AND archived = false
    `);
    // Mover las filas Byte fromDate → toDate
    await db.execute(sql`
      UPDATE bank_income_items SET date = ${toDate}
      WHERE business_id = ${bId} AND date = ${fromDate} AND is_byte_sale = true AND archived = false
    `);
    const b = before.b2c;
    const newTotal = b.efectivo + b.pos + b.yape_plin + b.transferencia;
    await db.execute(sql`
      INSERT INTO daily_records (business_id, date, byte_total, byte_discounts)
      VALUES (${bId}, ${toDate}, ${newTotal.toFixed(2)}, ${b.descuentos_info.toFixed(2)})
      ON CONFLICT (business_id, date) DO UPDATE SET
        byte_total = ${newTotal.toFixed(2)},
        byte_discounts = ${b.descuentos_info.toFixed(2)}
    `);
    await db.execute(sql`
      UPDATE daily_records SET byte_total = 0, byte_discounts = 0
      WHERE business_id = ${bId} AND date = ${fromDate}
    `);
  }

  await db.execute(sql`
    INSERT INTO audit_log (
      business_id, action, record_id, record_type, before_data, after_data, date_affected
    ) VALUES (
      ${bId}, 'move', gen_random_uuid(), ${recordType},
      ${JSON.stringify({ fromDate, snapshot: before.atelier ?? before.b2c })}::jsonb,
      ${JSON.stringify({ toDate, snapshot: before.atelier ?? before.b2c })}::jsonb,
      ${recalcStart}
    )
  `);

  await recalcBankBalance(recalcStart);
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Elimina el registro Byte completo del día.
 *  - Atelier: pone en 0 todos los campos byte_* del daily_record.
 *  - B2C: borra las filas bank_income_items con is_byte_sale=true del
 *    día y pone en 0 byte_total/byte_discounts.
 * Audit log + recalcBankBalance(date).
 */
export async function deleteByteRecord(
  date: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  try {
    assertValidDate(date);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Fecha inválida" };
  }
  const before = await getByteDayRecord(date);
  if (!before.hasData) {
    return { success: false, error: "No hay registro Byte para eliminar en esa fecha" };
  }
  const recordType = bId === 1 ? "byte_sale_atelier" : "byte_sale_b2c";

  if (bId === 1) {
    await db.execute(sql`
      UPDATE daily_records SET
        byte_total = 0, byte_cash_physical = 0, byte_digital = 0,
        byte_credit_day = 0, byte_credit_collected = 0,
        byte_cash_sale = 0, byte_discounts = 0
      WHERE business_id = ${bId} AND date = ${date}
    `);
  } else {
    await db.execute(sql`
      DELETE FROM bank_income_items
      WHERE business_id = ${bId} AND date = ${date} AND is_byte_sale = true AND archived = false
    `);
    await db.execute(sql`
      UPDATE daily_records SET byte_total = 0, byte_discounts = 0
      WHERE business_id = ${bId} AND date = ${date}
    `);
  }

  await db.execute(sql`
    INSERT INTO audit_log (
      business_id, action, record_id, record_type, before_data, date_affected
    ) VALUES (
      ${bId}, 'delete', gen_random_uuid(), ${recordType},
      ${JSON.stringify(before.atelier ?? before.b2c)}::jsonb, ${date}
    )
  `);

  await recalcBankBalance(date);
  revalidatePath("/", "layout");
  return { success: true };
}
