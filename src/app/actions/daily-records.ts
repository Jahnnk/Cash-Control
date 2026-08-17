"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { cadenaSaldoDesdeFecha, cadenaSaldoDesdeAncla } from "@/lib/saldo-bcp-sql";

/**
 * Todas las queries filtran por business_id (Ola 7). El INSERT/UPDATE en
 * daily_records usa el UNIQUE compuesto (business_id, date).
 */

export async function upsertDailyRecord(data: {
  date: string;
  byteCashPhysical: number;
  byteDigital: number;
  byteCreditDay: number;
  byteCreditCollected: number;
  byteCreditBalance: number;
  byteDiscounts: number;
  byteTotal: number;
  byteCashSale: number;
  byteCashSaleMethod: string;
  bankIncome: number;
  bankExpense: number;
  bankBalanceReal: number | null;
}) {
  const bId = await activeBusinessId();
  await db.execute(sql`
    INSERT INTO daily_records (
      business_id,
      date, byte_cash_physical, byte_digital, byte_cash,
      byte_credit_day, byte_credit_collected,
      byte_credit_balance, byte_discounts, byte_total,
      byte_cash_sale, byte_cash_sale_method,
      bank_income, bank_expense, bank_balance_real
    ) VALUES (
      ${bId},
      ${data.date}, ${data.byteCashPhysical}, ${data.byteDigital},
      ${data.byteCashPhysical + data.byteDigital},
      ${data.byteCreditDay}, ${data.byteCreditCollected},
      ${data.byteCreditBalance}, ${data.byteDiscounts}, ${data.byteTotal},
      ${data.byteCashSale}, ${data.byteCashSaleMethod},
      ${data.bankIncome}, ${data.bankExpense}, ${data.bankBalanceReal}
    )
    ON CONFLICT (business_id, date) DO UPDATE SET
      byte_cash_physical = ${data.byteCashPhysical},
      byte_digital = ${data.byteDigital},
      byte_cash = ${data.byteCashPhysical + data.byteDigital},
      byte_credit_day = ${data.byteCreditDay},
      byte_credit_collected = ${data.byteCreditCollected},
      byte_credit_balance = ${data.byteCreditBalance},
      byte_discounts = ${data.byteDiscounts},
      byte_total = ${data.byteTotal},
      byte_cash_sale = ${data.byteCashSale},
      byte_cash_sale_method = ${data.byteCashSaleMethod},
      bank_income = ${data.bankIncome},
      bank_expense = ${data.bankExpense},
      bank_balance_real = ${data.bankBalanceReal}
  `);
  revalidatePath("/", "layout");
}

/**
 * Propaga la cadena del saldo desde anchorDate+1 hasta MAX(date) del
 * negocio activo. Toda la cascada filtra por business_id para no
 * recalcular los saldos de otros negocios.
 */
async function propagateFromDate(bId: number, anchorDate: string) {
  // El candado de las sedes con reset viaja DENTRO de la consulta.
  await db.execute(cadenaSaldoDesdeAncla(sql, bId, anchorDate));
}

export async function updateBankBalance(date: string, balance: number) {
  const bId = await activeBusinessId();
  await db.execute(sql`
    INSERT INTO daily_records (business_id, date, bank_balance_real)
    VALUES (${bId}, ${date}, ${balance})
    ON CONFLICT (business_id, date) DO UPDATE SET bank_balance_real = ${balance}
  `);
  await propagateFromDate(bId, date);
  revalidatePath("/", "layout");
}

export async function recalcBankBalance(date: string, explicitBId?: number) {
  // La sede puede venir EXPLÍCITA (import central desde /grupo, donde la
  // cookie dice "grupo" y activeBusinessId() lanzaría). Sin param, igual
  // que siempre: la sede activa de la URL/cookie.
  const bId = explicitBId ?? (await activeBusinessId());

  // Sedes con RESET (Fonavi/Centro, system_start_date): su saldo BCP es
  // SIEMPRE virtual (inicial del corte + flujo posterior, ver
  // getUnifiedBankBalance) y bank_balance_real debe quedar reservado a
  // LECTURAS REALES del banco. La cadena de abajo, pensada para Atelier
  // (filas diarias densas), aquí arrancaba de 0 en filas sueltas y
  // escribía "anclas" calculadas basura que el saldo luego tomaba como
  // verdad (auditoría 27-jul-2026: Fonavi -4,458.20 vs 19,234.37 real).
  const resetRes = await db.execute(sql`
    SELECT system_start_date FROM businesses WHERE id = ${bId}
  `);
  const hasReset = !!(resetRes.rows[0] as { system_start_date: string | null } | undefined)?.system_start_date;

  // Refresca cache del día afectado. `bank_income` mantiene la semántica
  // histórica de "ingresos brutos del día" (banco + efectivo), que es lo
  // que dashboard/reportes/CxC consumen. La distinción banco vs efectivo
  // solo aplica al saldo BCP en la cadena recursiva más abajo.
  await db.execute(sql`
    UPDATE daily_records dr SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND date = dr.date AND is_special_loan = false AND is_internal_transfer = false AND archived = false), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND date = dr.date AND payment_method NOT IN ('efectivo','pendiente_atelier','socio') AND is_special_loan = false AND is_internal_transfer = false AND archived = false), 0)
    WHERE dr.business_id = ${bId} AND dr.date = ${date}
  `);

  // Recalcula bank_balance_real en cadena desde `date` hasta MAX(date) del negocio
  if (!hasReset) await db.execute(cadenaSaldoDesdeFecha(sql, bId, date));

  // Retroceso del marcador "Cuadrado hasta": si se modificó el saldo de un
  // día YA dado por cuadrado (date <= reconciled_through_date), el marcador
  // retrocede al día anterior para no afirmar un cuadre sobre algo que cambió.
  // recalcBankBalance es el chokepoint de todo cambio que afecta el banco
  // (crear/editar/borrar/mover ingresos y egresos), así que cubre todos los
  // caminos. Entrar el saldo real del día (updateBankBalance) NO pasa por aquí.
  await db.execute(sql`
    UPDATE businesses
    SET reconciled_through_date = (${date}::date - INTERVAL '1 day')::date
    WHERE id = ${bId}
      AND reconciled_through_date IS NOT NULL
      AND reconciled_through_date >= ${date}
  `);

  const result = await db.execute(sql`
    SELECT bank_balance_real::float as balance FROM daily_records
    WHERE business_id = ${bId} AND date = ${date}
  `);
  const newBalance = result.rows[0] ? parseFloat(result.rows[0].balance as string) : 0;

  revalidatePath("/", "layout");
  return newBalance;
}

export async function updateDailyTotals(date: string, bankIncome: number | null, bankExpense: number | null) {
  const bId = await activeBusinessId();
  if (bankIncome !== null) {
    await db.execute(sql`
      INSERT INTO daily_records (business_id, date, bank_income) VALUES (${bId}, ${date}, ${bankIncome})
      ON CONFLICT (business_id, date) DO UPDATE SET bank_income = ${bankIncome}
    `);
  }
  if (bankExpense !== null) {
    await db.execute(sql`
      INSERT INTO daily_records (business_id, date, bank_expense) VALUES (${bId}, ${date}, ${bankExpense})
      ON CONFLICT (business_id, date) DO UPDATE SET bank_expense = ${bankExpense}
    `);
  }
  revalidatePath("/", "layout");
}

export async function getDailyRecord(date: string) {
  const bId = await activeBusinessId();
  const result = await db.execute(sql`
    SELECT * FROM daily_records WHERE business_id = ${bId} AND date = ${date}
  `);
  return result.rows[0] || null;
}

export async function getLastBankBalance(beforeDate: string) {
  const bId = await activeBusinessId();
  const result = await db.execute(sql`
    SELECT bank_balance_real, date FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND date < ${beforeDate}
    ORDER BY date DESC LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function updateCurrentBankBalance(balance: number) {
  const bId = await activeBusinessId();
  const today = new Date().toISOString().slice(0, 10);
  await db.execute(sql`
    INSERT INTO daily_records (business_id, date, bank_balance_real)
    VALUES (${bId}, ${today}, ${balance})
    ON CONFLICT (business_id, date) DO UPDATE SET bank_balance_real = ${balance}
  `);
  await propagateFromDate(bId, today);
  revalidatePath("/", "layout");
  return today;
}
