"use server";

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { cadenaSaldoDesdeFecha } from "@/lib/saldo-bcp-sql";
import { recalcBankBalance } from "./daily-records";
import {
  isReimbursementMethod,
  reimbursementMirrorMethod,
  type ReimbursementMethod,
} from "@/lib/reimbursement-method";
import { validateAmount } from "@/lib/money-validation";

const sql = neon(process.env.DATABASE_URL!);
const ATELIER_ID = 1;

/** Locales deudores de Atelier en gastos compartidos. */
export type DebtorBusinessId = 2 | 3;
const DEBTOR_NAMES: Record<DebtorBusinessId, string> = { 2: "Fonavi", 3: "Centro" };
const DEBTOR_IDS: DebtorBusinessId[] = [2, 3];

function isDebtorId(v: number): v is DebtorBusinessId {
  return (DEBTOR_IDS as number[]).includes(v);
}

/**
 * Queries de recálculo del saldo BCP del local deudor (cache del día +
 * cadena hacia adelante), parametrizadas por negocio. Mismos filtros que
 * la recalcBankBalance canónica (excluye efectivo, pendiente_atelier,
 * préstamos especiales, transferencias internas y archivados) para que
 * los saldos de Fonavi/Centro no diverjan de la fórmula oficial.
 * Pensadas para ir DENTRO de una sql.transaction junto a la mutación.
 */
function debtorCascadeQueries(bId: number, date: string) {
  return [
    sql`
      INSERT INTO daily_records (business_id, date) VALUES (${bId}, ${date})
      ON CONFLICT (business_id, date) DO NOTHING
    `,
    sql`
      UPDATE daily_records SET
        bank_expense = COALESCE((SELECT SUM(amount) FROM expenses
          WHERE business_id = ${bId} AND date = ${date}
            AND payment_method NOT IN ('efectivo','pendiente_atelier','socio')
            AND is_special_loan = false AND is_internal_transfer = false AND archived = false), 0)
      WHERE business_id = ${bId} AND date = ${date}
    `,
    // Cadena única (src/lib/saldo-bcp-sql.ts). Era una de TRES copias que
    // vivían en este archivo. El candado de las sedes con reset la deja
    // inerte, que es lo correcto: su saldo BCP es virtual y
    // bank_balance_real guarda solo lecturas reales del banco.
    cadenaSaldoDesdeFecha(sql, bId, date),
  ];
}

/** Guard: las cuentas por cobrar a Fonavi son exclusivas de Atelier. */
async function requireAtelier(): Promise<void> {
  const bId = await activeBusinessId();
  if (bId !== ATELIER_ID) {
    throw new Error("Esta sección solo está disponible en Atelier");
  }
}

export type ReceivableRow = {
  id: string;
  expense_id: string;
  expense_date: string;
  category: string;
  concept: string;
  amount_total: number;
  atelier_amount: number;
  amount_due: number;
  amount_collected: number;
  amount_pending: number;
  status: "pending" | "partial" | "collected";
  created_at: string;
  collected_at: string | null;
  days_old: number;
};

// Listar todas las cuentas por cobrar con info del egreso
export async function getFonaviReceivables(includeCollected = true, debtor: DebtorBusinessId = 2): Promise<ReceivableRow[]> {
  await requireAtelier();
  const rows = (await sql`
    SELECT
      fr.id::text as id,
      fr.expense_id::text as expense_id,
      e.date::text as expense_date,
      e.category,
      e.concept,
      e.amount::float as amount_total,
      e.atelier_amount::float as atelier_amount,
      fr.amount_due::float as amount_due,
      fr.amount_collected::float as amount_collected,
      (fr.amount_due - fr.amount_collected)::float as amount_pending,
      fr.status,
      fr.created_at::text as created_at,
      fr.collected_at::text as collected_at,
      (CURRENT_DATE - e.date::date) as days_old
    FROM fonavi_receivables fr
    JOIN expenses e ON e.id = fr.expense_id
    ${includeCollected ? sql`WHERE fr.debtor_business_id = ${debtor}` : sql`WHERE fr.status != 'collected' AND fr.debtor_business_id = ${debtor}`}
    ORDER BY e.date DESC, fr.created_at DESC
  `) as Record<string, unknown>[];
  return rows as unknown as ReceivableRow[];
}

// Total pendiente (para el dashboard)
export async function getFonaviReceivablesPendingTotal(debtor: DebtorBusinessId = 2): Promise<number> {
  await requireAtelier();
  const r = (await sql`
    SELECT COALESCE(SUM(amount_due - amount_collected), 0)::float as total
    FROM fonavi_receivables WHERE status != 'collected' AND debtor_business_id = ${debtor}
  `) as { total: number }[];
  return r[0].total;
}

// Registrar reembolso: crea bank_income_item en ATELIER con flag + allocations
// + actualiza receivables. CAMBIO 7.5: además, por cada receivable que queda
// 'collected', activa el gasto-espejo en Fonavi (cambia método de
// 'pendiente_atelier' a 'transferencia') y recalcula saldo BCP de Fonavi.
export async function registerFonaviReimbursement(data: {
  date: string;            // fecha del reembolso (entró a Atelier)
  totalAmount: number;     // monto total recibido
  note: string | null;
  allocations: { receivableId: string; amount: number }[];
  // Método con el que Fonavi pagó. Default 'transferencia' (compat con
  // llamadas previas). 'efectivo' NO suma al banco (va a caja efectivo).
  paymentMethod?: ReimbursementMethod;
}): Promise<{ success: true } | { success: false; error: string }> {
  await requireAtelier();
  {
    const amountError = validateAmount(data.totalAmount);
    if (amountError) return { success: false, error: amountError };
  }
  const method: ReimbursementMethod = data.paymentMethod ?? "transferencia";
  if (!isReimbursementMethod(method)) {
    return { success: false, error: "Método de cobro inválido" };
  }
  const sumAllocations = data.allocations.reduce((s, a) => s + a.amount, 0);
  if (Math.round(sumAllocations * 100) !== Math.round(data.totalAmount * 100)) {
    return { success: false, error: "La suma de las asignaciones no coincide con el monto total" };
  }
  if (data.allocations.some((a) => a.amount <= 0)) {
    return { success: false, error: "Cada asignación debe ser mayor a 0" };
  }

  // Pre-validar receivables (y determinar el local deudor)
  const debtorsSeen = new Set<number>();
  for (const alloc of data.allocations) {
    const r = (await sql`
      SELECT amount_due::float as due, amount_collected::float as col, status,
             debtor_business_id::int as debtor
      FROM fonavi_receivables WHERE id = ${alloc.receivableId}
    `) as { due: number; col: number; status: string; debtor: number }[];
    if (!r[0]) return { success: false, error: `Receivable ${alloc.receivableId} no existe` };
    if (r[0].status === "collected") return { success: false, error: "Una de las cuentas seleccionadas ya está cobrada" };
    const pending = r[0].due - r[0].col;
    if (Math.round(alloc.amount * 100) > Math.round(pending * 100)) {
      return { success: false, error: `Asignación excede el saldo pendiente de una de las cuentas` };
    }
    debtorsSeen.add(r[0].debtor);
  }
  if (debtorsSeen.size > 1) {
    return { success: false, error: "Las cuentas seleccionadas pertenecen a locales distintos (Fonavi y Centro). Registra un reembolso por cada local." };
  }
  const debtorId = [...debtorsSeen][0];
  const debtorName = isDebtorId(debtorId) ? DEBTOR_NAMES[debtorId] : "Fonavi";

  // 1. Insertar income_item en ATELIER (business_id=1, donde realmente entra el dinero).
  //    payment_method define si suma al banco (transferencia/yape) o a la caja
  //    efectivo (efectivo) — regla canónica. Antes caía siempre al default
  //    'transferencia', lo que impedía registrar cobros en efectivo.
  const inserted = (await sql`
    INSERT INTO bank_income_items (business_id, date, amount, client_id, note, is_fonavi_reimbursement, payment_method)
    VALUES (1, ${data.date}, ${data.totalAmount}, NULL, ${data.note || `Reembolso ${debtorName}`}, true, ${method})
    RETURNING id::text
  `) as { id: string }[];
  const incomeItemId = inserted[0].id;

  // 2. Asegurar daily_record en Atelier para esa fecha
  await sql`
    INSERT INTO daily_records (business_id, date) VALUES (1, ${data.date})
    ON CONFLICT (business_id, date) DO NOTHING
  `;

  // 3. Insertar allocations + actualizar receivables (transacción atómica)
  const txQueries = data.allocations.map((alloc) => sql`
    INSERT INTO fonavi_reimbursement_allocations (income_item_id, receivable_id, amount)
    VALUES (${incomeItemId}::uuid, ${alloc.receivableId}::uuid, ${alloc.amount})
  `);
  for (const alloc of data.allocations) {
    txQueries.push(sql`
      UPDATE fonavi_receivables
      SET amount_collected = amount_collected + ${alloc.amount},
          status = CASE
            WHEN (amount_collected + ${alloc.amount}) >= amount_due THEN 'collected'
            ELSE 'partial'
          END,
          collected_at = CASE
            WHEN (amount_collected + ${alloc.amount}) >= amount_due THEN now()
            ELSE collected_at
          END
      WHERE id = ${alloc.receivableId}
    `);
  }
  // NOTA: el recálculo de saldo de Atelier ya NO se hace inline aquí. Se
  // delega a la función canónica `recalcBankBalance` (más abajo, tras el
  // commit), que excluye correctamente efectivo / is_special_loan /
  // is_internal_transfer / archived del saldo BCP. Así un cobro en EFECTIVO
  // suma a la caja efectivo (getCashBalance) y NO infla el banco.

  try {
    await sql.transaction(txQueries);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar" };
  }

  // Recalcular saldo BCP de ATELIER con la fórmula canónica (requireAtelier
  // ⇒ negocio activo = Atelier). Idempotente; corre fuera de la transacción.
  await recalcBankBalance(data.date);

  // 4. CAMBIO 7.5: activar gastos-espejo en Fonavi para receivables totalmente cobradas.
  //    Cambia payment_method de 'pendiente_atelier' al método con que Fonavi pagó:
  //    transferencia/yape → gasto bancario de Fonavi; efectivo → gasto en efectivo
  //    (no toca el banco de Fonavi). El recálculo de saldo de Fonavi más abajo ya
  //    excluye 'efectivo' del BCP, así que en efectivo el banco de Fonavi no cambia.
  //    Si la receivable solo se cobró parcialmente, NO se activa todavía
  //    (el gasto-espejo permanece pendiente hasta cobro total).
  const mirrorMethod = reimbursementMirrorMethod(method);
  const collectedReceivables = (await sql`
    SELECT id::text FROM fonavi_receivables
    WHERE id = ANY(${data.allocations.map((a) => a.receivableId)}::uuid[])
      AND status = 'collected'
  `) as { id: string }[];

  if (collectedReceivables.length > 0) {
    const ids = collectedReceivables.map((r) => r.id);
    // Capturar fecha Y LOCAL de los gastos-espejo afectados ANTES del UPDATE
    // (generalizado: los espejos pueden vivir en Fonavi o Centro; el
    // linked_receivable_id ya identifica al espejo sin filtrar por negocio).
    const mirrorRows = (await sql`
      SELECT date::text AS date, business_id::int AS business_id FROM expenses
      WHERE payment_method = 'pendiente_atelier'
        AND linked_receivable_id = ANY(${ids}::uuid[])
    `) as { date: string; business_id: number }[];

    // ATÓMICO: activación del espejo + recálculo del saldo del local deudor
    // en UNA transacción (cascada canónica parametrizada por negocio).
    const cascadeQueries = [
      // El espejo "se activa" con el método correspondiente
      sql`
        UPDATE expenses
        SET payment_method = ${mirrorMethod}
        WHERE payment_method = 'pendiente_atelier'
          AND linked_receivable_id = ANY(${ids}::uuid[])
      `,
    ];

    // Recalcular el saldo BCP de cada (local, fecha) afectado
    const uniquePairs = Array.from(new Set(mirrorRows.map((r) => `${r.business_id}|${r.date}`)));
    for (const pair of uniquePairs) {
      const [bIdStr, mirrorDate] = pair.split("|");
      cascadeQueries.push(...debtorCascadeQueries(Number(bIdStr), mirrorDate));
    }

    try {
      await sql.transaction(cascadeQueries);
    } catch (e) {
      // El cobro YA quedó registrado (transacción anterior, committeada) y
      // gracias al rollback el espejo sigue 'pendiente_atelier' con el saldo
      // de Fonavi intacto — estado consistente. Avisar claro y SIN sugerir
      // reintentar el cobro (se duplicaría).
      return {
        success: false,
        error:
          "El cobro quedó registrado correctamente, pero falló la activación del gasto espejo en Fonavi " +
          "(problema de conexión). NO registres el cobro de nuevo — la cuenta ya figura como cobrada. " +
          "Anota la fecha y pide que se revise el gasto espejo de Fonavi. " +
          (e instanceof Error ? `(Detalle técnico: ${e.message})` : ""),
      };
    }
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// Listar los reembolsos (allocations) que ha recibido un receivable específico
export type ReimbursementHistoryItem = {
  allocation_id: string;
  income_item_id: string;
  date: string;
  amount: number;
  note: string | null;
  income_item_total: number;        // monto total del income_item (puede cubrir varios receivables)
  is_split: boolean;                 // true si el income_item está asignado a >1 receivables
};

export async function getReimbursementsForReceivable(receivableId: string): Promise<ReimbursementHistoryItem[]> {
  const rows = (await sql`
    SELECT
      a.id::text as allocation_id,
      a.income_item_id::text as income_item_id,
      bi.date::text as date,
      a.amount::float as amount,
      bi.note,
      bi.amount::float as income_item_total,
      (SELECT COUNT(*)::int FROM fonavi_reimbursement_allocations WHERE income_item_id = a.income_item_id) > 1 as is_split
    FROM fonavi_reimbursement_allocations a
    JOIN bank_income_items bi ON bi.id = a.income_item_id
    WHERE a.receivable_id = ${receivableId}
    ORDER BY bi.date DESC, a.created_at DESC
  `) as unknown as ReimbursementHistoryItem[];
  return rows;
}

// Elimina UNA allocation. Si el income_item solo tenía esa, se borra completo;
// si tenía varias, se actualiza el monto del income_item y se elimina solo la allocation.
export async function deleteReimbursementAllocation(allocationId: string): Promise<{ success: true } | { success: false; error: string }> {
  // Pre-fetch para audit + decisión
  const allocRows = (await sql`
    SELECT
      a.id::text as id,
      a.income_item_id::text as income_item_id,
      a.receivable_id::text as receivable_id,
      a.amount::float as amount,
      bi.date::text as date,
      bi.amount::float as income_amount,
      bi.note,
      (SELECT COUNT(*)::int FROM fonavi_reimbursement_allocations WHERE income_item_id = a.income_item_id) as alloc_count
    FROM fonavi_reimbursement_allocations a
    JOIN bank_income_items bi ON bi.id = a.income_item_id
    WHERE a.id = ${allocationId}
  `) as { id: string; income_item_id: string; receivable_id: string; amount: number; date: string; income_amount: number; note: string | null; alloc_count: number }[];

  if (!allocRows[0]) return { success: false, error: "Reembolso no encontrado" };
  const a = allocRows[0];

  // Snapshot completo del income_item para audit_log
  const incomeRows = (await sql`SELECT * FROM bank_income_items WHERE id = ${a.income_item_id}`) as Record<string, unknown>[];
  const incomeSnapshot = incomeRows[0];

  const queries = [];

  if (a.alloc_count === 1) {
    // Borrar income_item entero (cascade borra la allocation)
    queries.push(sql`DELETE FROM bank_income_items WHERE id = ${a.income_item_id}`);
  } else {
    // Borrar solo la allocation y reducir el monto del income_item
    queries.push(sql`DELETE FROM fonavi_reimbursement_allocations WHERE id = ${allocationId}`);
    queries.push(sql`UPDATE bank_income_items SET amount = amount - ${a.amount} WHERE id = ${a.income_item_id}`);
  }

  // Revertir el receivable
  queries.push(sql`
    UPDATE fonavi_receivables
    SET amount_collected = amount_collected - ${a.amount},
        status = CASE
          WHEN (amount_collected - ${a.amount}) <= 0 THEN 'pending'
          ELSE 'partial'
        END,
        collected_at = CASE
          WHEN (amount_collected - ${a.amount}) >= amount_due THEN collected_at
          ELSE NULL
        END
    WHERE id = ${a.receivable_id}
  `);

  // Audit
  queries.push(sql`
    INSERT INTO audit_log (action, record_id, record_type, before_data, date_affected)
    VALUES (
      'delete_reimbursement',
      ${allocationId}::uuid,
      'reimbursement_allocation',
      ${JSON.stringify({ allocation: a, income_item: incomeSnapshot })}::jsonb,
      ${a.date}
    )
  `);

  // Recalc cache + balance cascade
  // Scope a ATELIER: sin el filtro de negocio este recálculo mezclaba los
  // 3 locales en daily_records (bug latente; los recálculos posteriores lo
  // auto-corregían). El reembolso vive en Atelier (business_id = 1).
  queries.push(sql`
    UPDATE daily_records SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${ATELIER_ID} AND date = ${a.date}), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${ATELIER_ID} AND date = ${a.date} AND payment_method NOT IN ('efectivo','pendiente_atelier','socio')), 0)
    WHERE business_id = ${ATELIER_ID} AND date = ${a.date}
  `);
  // Cadena única (ver arriba). Atelier también tiene corte.
  queries.push(cadenaSaldoDesdeFecha(sql, ATELIER_ID, a.date));

  try {
    await sql.transaction(queries);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar reembolso" };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// (legado) Anular un reembolso ENTERO (revierte allocations + actualiza receivables + borra income_item)
export async function deleteFonaviReimbursement(incomeItemId: string): Promise<{ success: true } | { success: false; error: string }> {
  const item = (await sql`SELECT date::text as date FROM bank_income_items WHERE id = ${incomeItemId} AND is_fonavi_reimbursement = true`) as { date: string }[];
  if (!item[0]) return { success: false, error: "Reembolso no encontrado" };
  const date = item[0].date;

  const allocations = (await sql`
    SELECT receivable_id::text as receivable_id, amount::float as amount
    FROM fonavi_reimbursement_allocations WHERE income_item_id = ${incomeItemId}
  `) as { receivable_id: string; amount: number }[];

  const queries = [];
  // Revertir cada allocation en su receivable
  for (const a of allocations) {
    queries.push(sql`
      UPDATE fonavi_receivables
      SET amount_collected = amount_collected - ${a.amount},
          status = CASE
            WHEN (amount_collected - ${a.amount}) <= 0 THEN 'pending'
            ELSE 'partial'
          END,
          collected_at = CASE
            WHEN (amount_collected - ${a.amount}) >= amount_due THEN collected_at
            ELSE NULL
          END
      WHERE id = ${a.receivable_id}
    `);
  }
  // Borrar income_item (las allocations caen por ON DELETE CASCADE)
  queries.push(sql`DELETE FROM bank_income_items WHERE id = ${incomeItemId}`);
  // Refresh totals + cascade
  queries.push(sql`
    UPDATE daily_records SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${ATELIER_ID} AND date = ${date}), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${ATELIER_ID} AND date = ${date} AND payment_method NOT IN ('efectivo','pendiente_atelier','socio')), 0)
    WHERE business_id = ${ATELIER_ID} AND date = ${date}
  `);
  // Cadena única (ver arriba). Atelier también tiene corte.
  queries.push(cadenaSaldoDesdeFecha(sql, ATELIER_ID, date));

  try {
    await sql.transaction(queries);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al anular" };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Marca una receivable como cobrada SIN crear un bank_income_item nuevo.
 * Pensado para cuando el pago real ya fue registrado previamente como
 * ingreso normal (cliente=Fonavi) y el usuario quiere cerrar la deuda
 * formal sin doble-contabilizar.
 *
 * Flujo:
 *   1. Validar que la receivable exista y no esté ya cobrada.
 *   2. UPDATE fonavi_receivables: amount_collected=amount_due,
 *      status='collected', collected_at=now().
 *   3. Activar el gasto-espejo en Fonavi (payment_method
 *      'pendiente_atelier' → 'transferencia') igual que el flujo formal,
 *      para que aparezca como gasto BCP real de Fonavi.
 *   4. Recalcular saldo BCP de Fonavi en cascada.
 *
 * NO toca bank_income_items ni fonavi_reimbursement_allocations.
 */
export async function markReceivableAsCollected(
  receivableId: string
): Promise<{ success: true } | { success: false; error: string }> {
  await requireAtelier();

  const r = (await sql`
    SELECT amount_due::float as due, amount_collected::float as col, status,
           debtor_business_id::int as debtor
    FROM fonavi_receivables WHERE id = ${receivableId}
  `) as { due: number; col: number; status: string; debtor: number }[];
  if (!r[0]) return { success: false, error: "Cuenta por cobrar no encontrada" };
  if (r[0].status === "collected") {
    return { success: false, error: "Esta cuenta ya está cobrada" };
  }

  // Capturar (fecha, local) de los gastos-espejo afectados ANTES del UPDATE
  // — generalizado por linked_receivable_id, sin negocio hardcodeado.
  const mirrorRows = (await sql`
    SELECT date::text AS date, business_id::int AS business_id FROM expenses
    WHERE payment_method = 'pendiente_atelier'
      AND linked_receivable_id = ${receivableId}
  `) as { date: string; business_id: number }[];

  // ATÓMICO: cierre del receivable + activación del espejo + recálculo del
  // saldo del local deudor, todo o nada (antes eran awaits sueltos).
  const queries = [
    sql`
      UPDATE fonavi_receivables
      SET amount_collected = amount_due,
          status = 'collected',
          collected_at = now()
      WHERE id = ${receivableId} AND status != 'collected'
    `,
    sql`
      UPDATE expenses
      SET payment_method = 'transferencia'
      WHERE payment_method = 'pendiente_atelier'
        AND linked_receivable_id = ${receivableId}
    `,
  ];
  const uniquePairs = Array.from(new Set(mirrorRows.map((m) => `${m.business_id}|${m.date}`)));
  for (const pair of uniquePairs) {
    const [bIdStr, mirrorDate] = pair.split("|");
    queries.push(...debtorCascadeQueries(Number(bIdStr), mirrorDate));
  }

  try {
    await sql.transaction(queries);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al marcar como cobrada" };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Edita CUÁNTO debe el local deudor (Fonavi/Centro) por un gasto compartido,
 * sin mover ningún saldo de banco:
 *   - El TOTAL que pagó Atelier NO cambia → el banco de Atelier queda igual.
 *   - El espejo del deudor es 'pendiente_atelier' (no cuenta en su banco)
 *     mientras la cuenta esté pendiente → el banco del deudor queda igual.
 *
 * Ajusta de forma atómica y consistente las 3 piezas: la parte del deudor en
 * el gasto de Atelier (fonavi_amount/centro_amount + atelier_amount), el monto
 * de la cuenta por cobrar, y el monto del espejo. Solo se permite en cuentas
 * SIN cobros (amount_collected = 0); si ya hubo un cobro, primero hay que
 * anularlo. El nuevo monto no puede superar lo que pagó Atelier menos la parte
 * del otro local (la parte de Atelier no puede quedar negativa).
 */
export async function updateReceivableAmount(
  receivableId: string,
  newAmount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAtelier();

  if (!Number.isFinite(newAmount) || newAmount <= 0) {
    return { ok: false, error: "El monto debe ser mayor a cero" };
  }
  const amtErr = validateAmount(newAmount);
  if (amtErr) return { ok: false, error: amtErr };

  const r = (await sql`
    SELECT fr.amount_collected::float AS col, fr.status,
           fr.debtor_business_id::int AS debtor, fr.expense_id::text AS expense_id,
           e.amount::float AS total, e.fonavi_amount::float AS fonavi, e.centro_amount::float AS centro
    FROM fonavi_receivables fr JOIN expenses e ON e.id = fr.expense_id
    WHERE fr.id = ${receivableId}
  `) as { col: number; status: string; debtor: number; expense_id: string; total: number; fonavi: number | null; centro: number | null }[];
  if (!r[0]) return { ok: false, error: "Cuenta por cobrar no encontrada" };
  const row = r[0];
  if (row.status === "collected" || row.col > 0) {
    return { ok: false, error: "No se puede editar el monto de una cuenta que ya tiene cobros. Primero anula el cobro." };
  }
  if (!isDebtorId(row.debtor)) {
    return { ok: false, error: "Local deudor inválido" };
  }

  // Tope: lo que pagó Atelier menos la parte del OTRO local (la parte de
  // Atelier no puede quedar negativa).
  const otherPart = row.debtor === 2 ? (row.centro ?? 0) : (row.fonavi ?? 0);
  const maxForDebtor = Math.round((row.total - otherPart) * 100) / 100;
  if (Math.round(newAmount * 100) > Math.round(maxForDebtor * 100)) {
    return {
      ok: false,
      error: `El monto no puede superar S/${maxForDebtor.toFixed(2)} (lo que pagó Atelier menos la parte del otro local).`,
    };
  }

  // (fecha, local) del espejo para recalcular su saldo — no-op mientras el
  // espejo sea 'pendiente_atelier', pero correcto si alguna vez no lo fuera.
  const mir = (await sql`
    SELECT date::text AS date, business_id::int AS business_id FROM expenses
    WHERE linked_receivable_id = ${receivableId} AND payment_method = 'pendiente_atelier'
  `) as { date: string; business_id: number }[];

  const queries = [
    // 1. Parte del deudor en el gasto de Atelier (TOTAL intacto → banco Atelier igual)
    row.debtor === 2
      ? sql`UPDATE expenses SET fonavi_amount = ${newAmount}, atelier_amount = amount - ${newAmount} - COALESCE(centro_amount, 0) WHERE id = ${row.expense_id}`
      : sql`UPDATE expenses SET centro_amount = ${newAmount}, atelier_amount = amount - COALESCE(fonavi_amount, 0) - ${newAmount} WHERE id = ${row.expense_id}`,
    // 2. Monto de la cuenta por cobrar
    sql`UPDATE fonavi_receivables SET amount_due = ${newAmount} WHERE id = ${receivableId}`,
    // 3. Monto del espejo (pendiente_atelier → no toca el banco del deudor)
    sql`UPDATE expenses SET amount = ${newAmount} WHERE linked_receivable_id = ${receivableId} AND payment_method = 'pendiente_atelier'`,
  ];
  for (const m of mir) {
    queries.push(...debtorCascadeQueries(m.business_id, m.date));
  }

  try {
    await sql.transaction(queries);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al actualizar el monto" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
