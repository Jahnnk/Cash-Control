"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

// systemBalanceAtCheck = saldo al cierre del día checkDate.
// Si checkDate === hoy, incluye los movimientos del día hasta el
// momento del registro. Decisión tomada en Fase 1 de conciliación.
// Si necesita cambiarse, hacerlo en nueva sesión.

export type BankRealCheck = {
  id: string;
  businessId: number;
  checkDate: string;
  realBalance: number;
  systemBalanceAtCheck: number;
  difference: number;
  notes: string | null;
  createdAt: string;
  createdBy: string;
};

/**
 * Calcula el saldo BCP al CIERRE de una fecha específica
 * (`checkDate`). Replica la lógica de `getUnifiedBankBalance` con
 * cutoff: anchor más reciente con `date <= checkDate` + flujo
 * posterior hasta `checkDate`. Si no hay anchor ni config inicial,
 * devuelve 0.
 */
async function getSystemBalanceAtDate(
  bId: number,
  checkDate: string,
): Promise<number> {
  // Config inicial post-reset (Fonavi/Centro). Atelier no la usa.
  const cfgRes = await db.execute(sql`
    SELECT system_start_date::text AS start, initial_bcp_balance::float AS init_bcp,
           initial_balance_date::text AS init_date
    FROM businesses WHERE id = ${bId}
  `);
  const cfg = cfgRes.rows[0] as
    | { start: string | null; init_bcp: number; init_date: string | null }
    | undefined;
  const hasReset = !!(cfg?.start);

  // 1. Anchor: último saldo guardado con date <= checkDate, NO archivado
  const anchorRes = await db.execute(sql`
    SELECT bank_balance_real, date::text AS d FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL
      AND date <= ${checkDate} AND archived = false
    ORDER BY date DESC LIMIT 1
  `);

  let anchorBalance: number;
  let anchorDate: string;
  if (anchorRes.rows[0]) {
    anchorBalance = parseFloat(anchorRes.rows[0].bank_balance_real as string);
    anchorDate = anchorRes.rows[0].d as string;
  } else if (hasReset && cfg?.init_date && cfg.init_date <= checkDate) {
    anchorBalance = cfg.init_bcp ?? 0;
    anchorDate = cfg.init_date;
  } else {
    return 0;
  }

  // 2. Flujo bancario entre anchorDate (exclusivo) y checkDate (inclusivo)
  const incRes = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::float AS s FROM bank_income_items
    WHERE business_id = ${bId} AND date > ${anchorDate} AND date <= ${checkDate}
      AND is_special_loan = false AND payment_method <> 'efectivo' AND archived = false
  `);
  const expRes = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::float AS s FROM expenses
    WHERE business_id = ${bId} AND date > ${anchorDate} AND date <= ${checkDate}
      AND payment_method NOT IN ('efectivo','pendiente_atelier')
      AND is_special_loan = false AND archived = false
  `);
  const inc = Number((incRes.rows[0] as { s: number }).s);
  const exp = Number((expRes.rows[0] as { s: number }).s);

  return Math.round((anchorBalance + inc - exp) * 100) / 100;
}

/**
 * Computa el saldo del sistema para `checkDate` SIN persistir nada.
 * El modal lo usa para mostrar "Saldo del sistema" read-only y para
 * recalcular cuando el usuario cambia la fecha en el date picker.
 */
export async function computeSystemBalanceForDate(
  checkDate: string,
): Promise<number> {
  const bId = await activeBusinessId();
  return getSystemBalanceAtDate(bId, checkDate);
}

export type UpsertBankRealCheckResult =
  | { success: true; check: BankRealCheck }
  | { success: false; error: string };

/**
 * UPSERT del saldo BCP real para el negocio activo.
 * Valida: fecha no futura, realBalance > 0.
 * Calcula systemBalanceAtCheck y difference en server-side para que
 * el cliente no pueda manipularlos.
 * UPSERT por (business_id, check_date).
 * Revalida el path del dashboard del negocio.
 */
export async function upsertBankRealCheck(input: {
  checkDate: string;
  realBalance: number;
  notes?: string | null;
}): Promise<UpsertBankRealCheckResult> {
  const bId = await activeBusinessId();
  const { checkDate, realBalance, notes } = input;

  // Validaciones
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkDate)) {
    return { success: false, error: "Fecha inválida." };
  }
  if (checkDate > today) {
    return { success: false, error: "La fecha no puede ser futura." };
  }
  if (!(realBalance > 0)) {
    return { success: false, error: "El saldo real debe ser mayor a 0." };
  }

  const systemBalanceAtCheck = await getSystemBalanceAtDate(bId, checkDate);
  const difference = Math.round((realBalance - systemBalanceAtCheck) * 100) / 100;

  const ins = await db.execute(sql`
    INSERT INTO bank_real_checks (
      business_id, check_date, real_balance, system_balance_at_check,
      difference, notes, created_by
    ) VALUES (
      ${bId}, ${checkDate}, ${realBalance.toFixed(2)},
      ${systemBalanceAtCheck.toFixed(2)}, ${difference.toFixed(2)},
      ${notes ?? null}, 'jahnn'
    )
    ON CONFLICT (business_id, check_date) DO UPDATE SET
      real_balance = EXCLUDED.real_balance,
      system_balance_at_check = EXCLUDED.system_balance_at_check,
      difference = EXCLUDED.difference,
      notes = EXCLUDED.notes,
      created_at = now(),
      created_by = EXCLUDED.created_by
    RETURNING id::text, business_id, check_date::text, real_balance::float,
              system_balance_at_check::float, difference::float, notes,
              created_at::text, created_by
  `);
  const row = ins.rows[0] as {
    id: string;
    business_id: number;
    check_date: string;
    real_balance: number;
    system_balance_at_check: number;
    difference: number;
    notes: string | null;
    created_at: string;
    created_by: string;
  };

  // Refrescar dashboard del negocio activo. Usamos el wildcard
  // [negocio] que cubre las 3 rutas; revalidatePath con segundo
  // arg "page" invalida el árbol completo del segment.
  revalidatePath("/[negocio]/dashboard", "page");

  return {
    success: true,
    check: {
      id: row.id,
      businessId: row.business_id,
      checkDate: row.check_date,
      realBalance: Number(row.real_balance),
      systemBalanceAtCheck: Number(row.system_balance_at_check),
      difference: Number(row.difference),
      notes: row.notes,
      createdAt: row.created_at,
      createdBy: row.created_by,
    },
  };
}

/**
 * Devuelve el check más reciente del negocio activo, o null si nunca
 * se registró ninguno. Usado por el card del dashboard para decidir
 * entre estados A/B/C/D.
 */
export async function getLatestBankRealCheck(): Promise<BankRealCheck | null> {
  const bId = await activeBusinessId();
  const r = await db.execute(sql`
    SELECT id::text, business_id, check_date::text, real_balance::float,
           system_balance_at_check::float, difference::float, notes,
           created_at::text, created_by
    FROM bank_real_checks
    WHERE business_id = ${bId}
    ORDER BY check_date DESC, created_at DESC
    LIMIT 1
  `);
  if (!r.rows[0]) return null;
  const row = r.rows[0] as {
    id: string;
    business_id: number;
    check_date: string;
    real_balance: number;
    system_balance_at_check: number;
    difference: number;
    notes: string | null;
    created_at: string;
    created_by: string;
  };
  return {
    id: row.id,
    businessId: row.business_id,
    checkDate: row.check_date,
    realBalance: Number(row.real_balance),
    systemBalanceAtCheck: Number(row.system_balance_at_check),
    difference: Number(row.difference),
    notes: row.notes,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/**
 * Devuelve el check del negocio activo para una fecha específica, o
 * null si no existe. Usado por el modal para precargar valores
 * cuando el usuario cambia la fecha en el date picker.
 */
export async function getBankRealCheckByDate(
  checkDate: string,
): Promise<BankRealCheck | null> {
  const bId = await activeBusinessId();
  const r = await db.execute(sql`
    SELECT id::text, business_id, check_date::text, real_balance::float,
           system_balance_at_check::float, difference::float, notes,
           created_at::text, created_by
    FROM bank_real_checks
    WHERE business_id = ${bId} AND check_date = ${checkDate}
    LIMIT 1
  `);
  if (!r.rows[0]) return null;
  const row = r.rows[0] as {
    id: string;
    business_id: number;
    check_date: string;
    real_balance: number;
    system_balance_at_check: number;
    difference: number;
    notes: string | null;
    created_at: string;
    created_by: string;
  };
  return {
    id: row.id,
    businessId: row.business_id,
    checkDate: row.check_date,
    realBalance: Number(row.real_balance),
    systemBalanceAtCheck: Number(row.system_balance_at_check),
    difference: Number(row.difference),
    notes: row.notes,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}
