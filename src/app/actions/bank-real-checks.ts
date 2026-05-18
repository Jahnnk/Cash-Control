"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

// systemBalanceAtCheck = saldo al cierre del día checkDate.
// Si checkDate === hoy, incluye los movimientos del día hasta el
// momento del registro. Decisión tomada en Fase 1 de conciliación.
// Si necesita cambiarse, hacerlo en nueva sesión.

export type CheckStatus = "pending" | "resolved" | "accepted";

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
  status: CheckStatus;
  statusUpdatedAt: string | null;
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
      created_by = EXCLUDED.created_by,
      -- Cualquier nuevo upsert reabre la investigación: si Jahnn
      -- vuelve a registrar el saldo real, asumimos que es un nuevo
      -- ciclo y reseteamos status a 'pending'. Si quería preservar
      -- "resolved/accepted" debe simplemente NO re-registrar.
      status = 'pending',
      status_updated_at = NULL
    RETURNING id::text, business_id, check_date::text, real_balance::float,
              system_balance_at_check::float, difference::float, notes,
              created_at::text, created_by, status, status_updated_at::text
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
    status: CheckStatus;
    status_updated_at: string | null;
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
      status: row.status,
      statusUpdatedAt: row.status_updated_at,
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
           created_at::text, created_by, status, status_updated_at::text
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
    status: CheckStatus;
    status_updated_at: string | null;
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
    status: row.status,
    statusUpdatedAt: row.status_updated_at,
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
           created_at::text, created_by, status, status_updated_at::text
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
    status: CheckStatus;
    status_updated_at: string | null;
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
    status: row.status,
    statusUpdatedAt: row.status_updated_at,
  };
}

// ─────────────────────────────────────────────────────────────────
// FASE 2 — Investigación de diferencias
// ─────────────────────────────────────────────────────────────────

export type CandidateAction =
  | {
      type: "create_income";
      prefilledData: { amount: number; paymentMethod?: string; suggestedCategory?: string };
    }
  | {
      type: "create_expense";
      prefilledData: { amount: number; paymentMethod?: string; suggestedCategory?: string };
    }
  | {
      type: "view_movements";
      prefilledData: { startDate: string; endDate: string };
    };

export type Candidate = {
  type: "exact_match" | "missing_income_hint" | "missing_expense_hint" | "date_range_review";
  rank: number;
  title: string;
  description: string;
  amount?: number;
  suggestedAction?: CandidateAction;
  /** Movimientos existentes que matchearon (solo para exact_match). */
  matches?: Array<{
    id: string;
    kind: "income" | "expense";
    date: string;
    amount: number;
    label: string;
  }>;
};

export type InvestigationResult = {
  checkId: string | null;
  difference: number;
  /** "income" si banco real > sistema (falta ingreso); "expense" si banco real < sistema. */
  missingKind: "income" | "expense" | null;
  /** Inicio del rango temporal acotado por análisis temporal. */
  searchStartDate: string | null;
  /** Fin del rango = checkDate. */
  searchEndDate: string | null;
  /** Día anclaje (último check resuelto/aceptado/cuadrado) si existe. */
  lastCleanDate: string | null;
  candidates: Candidate[];
};

const TOL = 0.5; // tolerancia "casi cuadrado" para el ancla temporal

/**
 * Busca el "último check limpio" anterior a checkDate:
 *  - status IN ('resolved','accepted'), o
 *  - |difference| <= TOL (cuadrado natural)
 * Devuelve null si no hay ninguno. La búsqueda se acota desde ese día
 * (exclusivo) hacia adelante. Si no hay → default 14 días hacia atrás.
 */
async function findLastCleanDate(
  bId: number,
  beforeDate: string,
): Promise<string | null> {
  const r = await db.execute(sql`
    SELECT check_date::text AS d FROM bank_real_checks
    WHERE business_id = ${bId}
      AND check_date < ${beforeDate}
      AND (
        ABS(difference) <= ${TOL}
        OR status IN ('resolved', 'accepted')
      )
    ORDER BY check_date DESC LIMIT 1
  `);
  return r.rows[0] ? (r.rows[0].d as string) : null;
}

/**
 * Investiga la diferencia del check más reciente del negocio activo
 * que esté en status='pending' y con difference != 0. Devuelve los
 * candidatos rankeados o un resultado vacío si no hay nada que
 * investigar.
 *
 * Tres estrategias se ejecutan en orden:
 *  1. Match exacto: movimientos con monto = |difference| en el rango
 *     temporal (posible duplicado o ya registrado pero descuadrado).
 *  2. Sugerencia según signo: Yape/Plin si falta ingreso, ITF/
 *     comisión si falta egreso (basado en patrones reales de Jahnn).
 *  3. Date range review: link directo a ver movimientos del rango.
 */
export async function investigateDifference(): Promise<InvestigationResult> {
  const bId = await activeBusinessId();
  const latest = await getLatestBankRealCheck();
  if (!latest || latest.status !== "pending" || Math.abs(latest.difference) < 0.01) {
    return {
      checkId: latest?.id ?? null,
      difference: latest?.difference ?? 0,
      missingKind: null,
      searchStartDate: null,
      searchEndDate: null,
      lastCleanDate: null,
      candidates: [],
    };
  }

  const diff = latest.difference;
  const absDiff = Math.abs(diff);
  const missingKind: "income" | "expense" = diff > 0 ? "income" : "expense";
  const checkDate = latest.checkDate;

  // Acotar el rango temporal (Estrategia 4)
  const lastClean = await findLastCleanDate(bId, checkDate);
  const startDate = lastClean ?? (() => {
    // Default: 14 días hacia atrás desde checkDate.
    const d = new Date(checkDate + "T00:00:00");
    d.setDate(d.getDate() - 14);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  })();
  const endDate = checkDate;

  const candidates: Candidate[] = [];

  // ─── Estrategia 1: Match exacto en bank_income_items + expenses ───
  const exactIncome = await db.execute(sql`
    SELECT bi.id::text, bi.date::text, bi.amount::float, bi.note,
           bi.payment_method, c.name AS client_name
    FROM bank_income_items bi
    LEFT JOIN clients c ON c.id = bi.client_id
    WHERE bi.business_id = ${bId} AND bi.archived = false
      AND bi.date BETWEEN ${startDate} AND ${endDate}
      AND ABS(bi.amount - ${absDiff.toFixed(2)}::numeric) < 0.01
    ORDER BY bi.date DESC LIMIT 5
  `);
  const exactExpense = await db.execute(sql`
    SELECT id::text, date::text, amount::float, concept, category, payment_method
    FROM expenses
    WHERE business_id = ${bId} AND archived = false
      AND date BETWEEN ${startDate} AND ${endDate}
      AND ABS(amount - ${absDiff.toFixed(2)}::numeric) < 0.01
    ORDER BY date DESC LIMIT 5
  `);
  const matches: NonNullable<Candidate["matches"]> = [];
  for (const r of exactIncome.rows as Array<{
    id: string; date: string; amount: number; note: string | null;
    payment_method: string | null; client_name: string | null;
  }>) {
    matches.push({
      id: r.id,
      kind: "income",
      date: r.date,
      amount: Number(r.amount),
      label: r.client_name
        ? `Ingreso de ${r.client_name}`
        : (r.note || `Ingreso ${r.payment_method ?? ""}`).slice(0, 60),
    });
  }
  for (const r of exactExpense.rows as Array<{
    id: string; date: string; amount: number; concept: string | null;
    category: string | null; payment_method: string | null;
  }>) {
    matches.push({
      id: r.id,
      kind: "expense",
      date: r.date,
      amount: Number(r.amount),
      label: `${r.category ?? "Egreso"} · ${(r.concept ?? "").slice(0, 50)}`,
    });
  }
  if (matches.length > 0) {
    candidates.push({
      type: "exact_match",
      rank: 1,
      title: `${matches.length} movimiento${matches.length > 1 ? "s" : ""} existente${matches.length > 1 ? "s" : ""} de ${formatPEN(absDiff)}`,
      description:
        "Hay movimientos del mismo monto en el rango. Revisar si alguno está duplicado o mal registrado.",
      amount: absDiff,
      matches,
      suggestedAction: {
        type: "view_movements",
        prefilledData: { startDate, endDate },
      },
    });
  }

  // ─── Estrategia 2: Sugerencia según signo ───
  if (missingKind === "income") {
    candidates.push({
      type: "missing_income_hint",
      rank: matches.length > 0 ? 2 : 1,
      title: `¿Recibiste un Yape/Plin de ${formatPEN(absDiff)}?`,
      description:
        "Banco real está MÁS alto que el sistema. Patrón típico: Yape/Plin de cliente o vuelto no registrado. Revisar app Yape/Plin del día.",
      amount: absDiff,
      suggestedAction: {
        type: "create_income",
        prefilledData: { amount: absDiff, paymentMethod: "yape_plin" },
      },
    });
  } else {
    candidates.push({
      type: "missing_expense_hint",
      rank: matches.length > 0 ? 2 : 1,
      title: `¿Falta un egreso de ${formatPEN(absDiff)}?`,
      description:
        "Banco real está MÁS bajo que el sistema. Posibles causas: comisión BCP, ITF, gasto pequeño no registrado, retiro en cajero.",
      amount: absDiff,
      suggestedAction: {
        type: "create_expense",
        prefilledData: { amount: absDiff, paymentMethod: "transferencia" },
      },
    });
  }

  // ─── Estrategia 4: Date range review ───
  const countRes = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM bank_income_items
       WHERE business_id = ${bId} AND archived = false
         AND date BETWEEN ${startDate} AND ${endDate}) AS ing_count,
      (SELECT COUNT(*)::int FROM expenses
       WHERE business_id = ${bId} AND archived = false
         AND date BETWEEN ${startDate} AND ${endDate}) AS egr_count
  `);
  const counts = countRes.rows[0] as { ing_count: number; egr_count: number };
  const totalMovs = counts.ing_count + counts.egr_count;
  candidates.push({
    type: "date_range_review",
    rank: 3,
    title: `Ver todos los movimientos entre ${startDate} y ${endDate}`,
    description: `${totalMovs} movimiento${totalMovs !== 1 ? "s" : ""} (${counts.ing_count} ingresos · ${counts.egr_count} egresos) en ese rango. Útil para buscar manualmente.`,
    suggestedAction: {
      type: "view_movements",
      prefilledData: { startDate, endDate },
    },
  });

  // Ordenar por rank
  candidates.sort((a, b) => a.rank - b.rank);

  return {
    checkId: latest.id,
    difference: diff,
    missingKind,
    searchStartDate: startDate,
    searchEndDate: endDate,
    lastCleanDate: lastClean,
    candidates,
  };
}

function formatPEN(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type UpdateCheckStatusResult =
  | { success: true; check: BankRealCheck }
  | { success: false; error: string };

/**
 * Marca un check como 'resolved' o 'accepted'. Setea status_updated_at
 * a NOW(). Valida que el negocio activo sea dueño del check.
 */
export async function updateCheckStatus(
  checkId: string,
  newStatus: CheckStatus,
): Promise<UpdateCheckStatusResult> {
  if (!["pending", "resolved", "accepted"].includes(newStatus)) {
    return { success: false, error: "Estado inválido." };
  }
  const bId = await activeBusinessId();
  const r = await db.execute(sql`
    UPDATE bank_real_checks
    SET status = ${newStatus}, status_updated_at = now()
    WHERE id = ${checkId}::uuid AND business_id = ${bId}
    RETURNING id::text, business_id, check_date::text, real_balance::float,
              system_balance_at_check::float, difference::float, notes,
              created_at::text, created_by, status, status_updated_at::text
  `);
  if (!r.rows[0]) {
    return { success: false, error: "Check no encontrado o no pertenece al negocio activo." };
  }
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
    status: CheckStatus;
    status_updated_at: string | null;
  };
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
      status: row.status,
      statusUpdatedAt: row.status_updated_at,
    },
  };
}
