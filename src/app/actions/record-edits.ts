"use server";

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

// Cliente directo (no Drizzle) para tener acceso a sql.transaction([...]) atómico
const sql = neon(process.env.DATABASE_URL!);

type Result = { success: true } | { success: false; error: string };

// ---------- Helpers de recálculo (queries reutilizadas en cada transacción) ----------
// IMPORTANTE: cada query lleva el bId embebido literal porque sql.transaction
// no puede ejecutar funciones async dentro. Por esa restricción de neon NO se
// puede reutilizar la función async recalcBankBalance() de daily-records.ts
// dentro de la transacción atómica; en su lugar estas queries replican EXACTO
// los mismos filtros que la versión canónica (single source of truth lógico).
//
// Filtros canónicos (ver daily-records.ts → recalcBankBalance):
//   - Cache bank_income/bank_expense: excluye is_special_loan, is_internal_transfer
//     y archived. bank_income incluye efectivo (es "ingreso bruto del día");
//     bank_expense excluye efectivo y pendiente_atelier.
//   - Cadena bank_balance_real: excluye is_special_loan y archived en ambos lados;
//     ingresos excluyen efectivo; egresos excluyen efectivo y pendiente_atelier.
//     (is_internal_transfer NO se excluye en la cadena: cada pata mueve su cuenta.)

function recalcDailyTotalsQuery(bId: number, date: string) {
  return sql`
    UPDATE daily_records SET
      bank_income  = COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND date = ${date} AND is_special_loan = false AND is_internal_transfer = false AND archived = false), 0),
      bank_expense = COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND date = ${date} AND payment_method NOT IN ('efectivo','pendiente_atelier') AND is_special_loan = false AND is_internal_transfer = false AND archived = false), 0)
    WHERE business_id = ${bId} AND date = ${date}
  `;
}

function recalcBankBalanceQuery(bId: number, date: string) {
  return sql`
    WITH RECURSIVE chain AS (
      SELECT
        (${date}::date - INTERVAL '1 day')::date AS date,
        COALESCE((
          SELECT bank_balance_real::numeric FROM daily_records
          WHERE business_id = ${bId} AND date < ${date} AND bank_balance_real IS NOT NULL AND archived = false
          ORDER BY date DESC LIMIT 1
        ), 0) AS calc_balance

      UNION ALL

      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND date = dr.date AND (is_special_loan = false OR loan_via_bank = true) AND payment_method <> 'efectivo' AND archived = false), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND date = dr.date AND payment_method NOT IN ('efectivo','pendiente_atelier') AND (is_special_loan = false OR loan_via_bank = true) AND archived = false), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = (c.date + INTERVAL '1 day')::date
      WHERE dr.business_id = ${bId} AND dr.date <= (SELECT MAX(date) FROM daily_records WHERE business_id = ${bId} AND archived = false) AND dr.archived = false
    )
    UPDATE daily_records dr
    SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.business_id = ${bId} AND dr.date = chain.date AND dr.date >= ${date}
  `;
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

function validateAmount(amount: unknown): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "Monto inválido";
  if (amount <= 0) return "El monto debe ser mayor a 0";
  if (amount > 999999.99) return "Monto fuera de rango";
  return null;
}

function validateNonEmpty(value: unknown, fieldLabel: string): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return `${fieldLabel} no puede estar vacío`;
  return null;
}

// ============================================================================
// INGRESOS (bank_income_items)
// ============================================================================

// Métodos de pago aceptados al editar un ingreso. Incluye los 3 del form
// de creación (transferencia/efectivo/yape) + los métodos que pueden existir
// en filas históricas (yape_plin/plin/pos de ventas Byte B2C), para no
// rechazar ediciones de monto/nota sobre esas filas ni perder su método.
// Solo 'efectivo' NO cuenta para el saldo BCP; el resto sí (regla canónica).
const ALLOWED_INCOME_METHODS = ["transferencia", "efectivo", "yape", "yape_plin", "plin", "pos"];

export async function updateIncomeItem(
  id: string,
  changes: { amount: number; note: string; clientId: string | null; paymentMethod?: string }
): Promise<Result> {
  const bId = await activeBusinessId();
  const amountErr = validateAmount(changes.amount);
  if (amountErr) return { success: false, error: amountErr };

  const before = (await sql`SELECT * FROM bank_income_items WHERE id = ${id} AND business_id = ${bId}`) as Record<string, unknown>[];
  if (!before[0]) return { success: false, error: "El registro ya no existe" };
  const original = before[0];
  const date = original.date as string;

  if (changes.clientId !== null) {
    const clientExists = (await sql`SELECT id FROM clients WHERE id = ${changes.clientId}`) as { id: string }[];
    if (!clientExists[0]) return { success: false, error: "Cliente no válido" };
  }

  // Si no llega paymentMethod, se conserva el actual (no-op). Cambiar el
  // método dispara el mismo recálculo de saldo de abajo (efectivo sale del
  // banco, transferencia/yape entran), porque recalcBankBalanceQuery filtra
  // por payment_method.
  const newMethod = changes.paymentMethod ?? (original.payment_method as string);
  if (!ALLOWED_INCOME_METHODS.includes(newMethod)) {
    return { success: false, error: "Método de pago no válido" };
  }

  const after = { ...original, amount: String(changes.amount), note: changes.note, client_id: changes.clientId, payment_method: newMethod };

  try {
    await sql.transaction([
      sql`
        UPDATE bank_income_items
        SET amount = ${changes.amount}, note = ${changes.note}, client_id = ${changes.clientId}, payment_method = ${newMethod}
        WHERE id = ${id} AND business_id = ${bId}
      `,
      sql`
        INSERT INTO audit_log (business_id, action, record_id, record_type, before_data, after_data, date_affected)
        VALUES (${bId}, 'edit', ${id}, 'income_item', ${JSON.stringify(original)}::jsonb, ${JSON.stringify(after)}::jsonb, ${date})
      `,
      recalcDailyTotalsQuery(bId, date),
      recalcBankBalanceQuery(bId, date),
    ]);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar" };
  }

  revalidateAll();
  return { success: true };
}

export async function deleteIncomeItem(id: string): Promise<Result> {
  const bId = await activeBusinessId();
  const before = (await sql`SELECT * FROM bank_income_items WHERE id = ${id} AND business_id = ${bId}`) as Record<string, unknown>[];
  if (!before[0]) return { success: false, error: "El registro ya no existe" };
  const original = before[0];
  const date = original.date as string;

  try {
    await sql.transaction([
      sql`DELETE FROM bank_income_items WHERE id = ${id} AND business_id = ${bId}`,
      sql`
        INSERT INTO audit_log (business_id, action, record_id, record_type, before_data, date_affected)
        VALUES (${bId}, 'delete', ${id}, 'income_item', ${JSON.stringify(original)}::jsonb, ${date})
      `,
      recalcDailyTotalsQuery(bId, date),
      recalcBankBalanceQuery(bId, date),
    ]);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar" };
  }

  revalidateAll();
  return { success: true };
}

// ============================================================================
// EGRESOS (expenses)
// ============================================================================

export async function updateExpense(
  id: string,
  changes: {
    amount: number;
    category: string;
    concept: string;
    paymentMethod: string;
    notes: string | null;
    /**
     * Condición de compartido (solo Atelier):
     *  - undefined → no tocar la condición (compatibilidad con llamadas previas)
     *  - null      → volverlo gasto normal (elimina por cobrar + espejos)
     *  - objeto    → marcarlo/ajustarlo compartido con Fonavi y/o Centro.
     *                atelierAmount = amount − fonaviAmount − centroAmount.
     * Implementación: limpiar y recrear por-cobrar + espejos según las partes
     * vigentes (cubre cambios de participación sin casos especiales).
     * Solo permitido si NINGÚN por cobrar tiene reembolsos registrados.
     */
    shared?: null | { ruleId: string; fonaviAmount: number; centroAmount?: number };
  }
): Promise<Result> {
  const bId = await activeBusinessId();
  const amountErr = validateAmount(changes.amount);
  if (amountErr) return { success: false, error: amountErr };
  const catErr = validateNonEmpty(changes.category, "Categoría");
  if (catErr) return { success: false, error: catErr };
  const conceptErr = validateNonEmpty(changes.concept, "Concepto");
  if (conceptErr) return { success: false, error: conceptErr };
  if (!["transferencia", "efectivo", "yape"].includes(changes.paymentMethod)) {
    return { success: false, error: "Método de pago no válido" };
  }

  const before = (await sql`SELECT * FROM expenses WHERE id = ${id} AND business_id = ${bId}`) as Record<string, unknown>[];
  if (!before[0]) return { success: false, error: "El registro ya no existe" };
  const original = before[0];
  const date = original.date as string;
  const wasShared = !!original.is_shared;
  if (original.is_internal_transfer) {
    return { success: false, error: "No se puede editar una transferencia interna desde aquí. Usa el módulo de Transferencia Interna." };
  }
  if (original.linked_atelier_expense_id) {
    return { success: false, error: "Este gasto es el espejo automático de un gasto compartido de Atelier. Edítalo desde Atelier (el espejo se ajusta solo)." };
  }

  // ───── Validaciones de la condición de compartido ─────
  const touchesSharing = changes.shared !== undefined;
  const willBeShared = changes.shared != null;
  if (touchesSharing && bId !== 1) {
    return { success: false, error: "Los gastos compartidos con Fonavi solo se gestionan desde Atelier" };
  }
  if (touchesSharing && willBeShared) {
    const f = changes.shared!.fonaviAmount;
    const c = changes.shared!.centroAmount ?? 0;
    if (!Number.isFinite(f) || f < 0 || !Number.isFinite(c) || c < 0) {
      return { success: false, error: "Las partes de Fonavi y Centro no pueden ser negativas" };
    }
    if (f <= 0 && c <= 0) {
      return { success: false, error: "Al menos una cafetería (Fonavi o Centro) debe tener una parte mayor a 0" };
    }
    if (f + c > changes.amount + 0.005) {
      return { success: false, error: "Las partes de Fonavi y Centro no pueden exceder el monto total del gasto" };
    }
    if (!changes.shared!.ruleId) {
      return { success: false, error: "Selecciona la regla de gasto compartido" };
    }
  }
  // Cualquier cambio sobre un compartido existente (quitarlo, ajustarlo o
  // editar su monto) exige que el por cobrar esté SIN reembolsos: si ya hubo
  // cobros, ajustar a medias dejaría montos inconsistentes.
  if (wasShared && (touchesSharing || Number(original.amount) !== changes.amount)) {
    const allocs = (await sql`
      SELECT COUNT(*)::int as n
      FROM fonavi_reimbursement_allocations a
      JOIN fonavi_receivables r ON r.id = a.receivable_id
      WHERE r.expense_id = ${id}
    `) as { n: number }[];
    if (allocs[0].n > 0) {
      return {
        success: false,
        error: "Este gasto compartido ya tiene reembolsos registrados: no se puede cambiar su monto ni su condición. Primero gestiona los reembolsos en 'Cuentas por cobrar Fonavi'.",
      };
    }
  }

  // Vía legacy (sin parámetro shared): no permitir cambiar el monto de un
  // compartido — desincronizaría el por cobrar y el espejo silenciosamente.
  if (!touchesSharing && wasShared && Number(original.amount) !== changes.amount) {
    return {
      success: false,
      error: "Este gasto es compartido con Fonavi: edítalo con la opción de gasto compartido para ajustar también el por cobrar.",
    };
  }

  const fonaviAmt = touchesSharing && willBeShared ? changes.shared!.fonaviAmount : null;
  const centroAmt = touchesSharing && willBeShared ? (changes.shared!.centroAmount ?? 0) : null;
  const atelierAmt = fonaviAmt !== null
    ? Math.round((changes.amount - fonaviAmt - (centroAmt ?? 0)) * 100) / 100
    : null;

  const after = {
    ...original,
    amount: String(changes.amount),
    category: changes.category,
    concept: changes.concept,
    payment_method: changes.paymentMethod,
    notes: changes.notes,
    ...(touchesSharing
      ? {
          is_shared: willBeShared,
          shared_rule_id: willBeShared ? changes.shared!.ruleId : null,
          atelier_amount: atelierAmt !== null ? String(atelierAmt) : null,
          fonavi_amount: fonaviAmt !== null && fonaviAmt > 0 ? String(fonaviAmt) : null,
          centro_amount: centroAmt !== null && centroAmt > 0 ? String(centroAmt) : null,
        }
      : {}),
  };

  // ───── Transacción según el caso (todo o nada: sin huérfanos) ─────
  const txQueries = [];

  if (!touchesSharing) {
    // Llamada legacy: no tocar la condición de compartido.
    txQueries.push(sql`
      UPDATE expenses SET
        amount = ${changes.amount},
        category = ${changes.category},
        concept = ${changes.concept},
        payment_method = ${changes.paymentMethod},
        notes = ${changes.notes}
      WHERE id = ${id} AND business_id = ${bId}
    `);
  } else {
    txQueries.push(sql`
      UPDATE expenses SET
        amount = ${changes.amount},
        category = ${changes.category},
        concept = ${changes.concept},
        payment_method = ${changes.paymentMethod},
        notes = ${changes.notes},
        is_shared = ${willBeShared},
        shared_rule_id = ${willBeShared ? changes.shared!.ruleId : null},
        atelier_amount = ${atelierAmt !== null ? atelierAmt.toFixed(2) : null},
        fonavi_amount = ${fonaviAmt !== null && fonaviAmt > 0 ? fonaviAmt.toFixed(2) : null},
        centro_amount = ${centroAmt !== null && centroAmt > 0 ? centroAmt.toFixed(2) : null}
      WHERE id = ${id} AND business_id = ${bId}
    `);

    // LIMPIAR Y RECREAR (estrategia única para los 3 casos): se eliminan los
    // espejos y por-cobrar existentes (sin filtro de negocio: pueden vivir en
    // Fonavi o Centro) y, si queda compartido, se recrean según las partes
    // vigentes. Cubre normal↔compartido, ajustes de monto y cambios de
    // participación (agregar/quitar Centro) sin casos especiales. Seguro
    // porque arriba se garantizó que NINGÚN por cobrar tiene reembolsos.
    if (wasShared) {
      txQueries.push(sql`
        DELETE FROM expenses WHERE linked_atelier_expense_id = ${id}::uuid
      `);
      txQueries.push(sql`
        DELETE FROM fonavi_receivables WHERE expense_id = ${id}::uuid
      `);
    }
    if (willBeShared) {
      const participants: { debtorId: number; part: number }[] = [];
      if ((fonaviAmt ?? 0) > 0) participants.push({ debtorId: 2, part: fonaviAmt! });
      if ((centroAmt ?? 0) > 0) participants.push({ debtorId: 3, part: centroAmt! });
      for (const { debtorId, part } of participants) {
        // CTE atómica por local: por cobrar + espejo (mismo patrón que la creación)
        txQueries.push(sql`
          WITH receivable_ins AS (
            INSERT INTO fonavi_receivables (expense_id, amount_due, status, debtor_business_id)
            VALUES (${id}::uuid, ${part.toFixed(2)}, 'pending', ${debtorId})
            RETURNING id
          ),
          category_lookup AS (
            SELECT COALESCE(
              (SELECT name FROM expense_categories
                WHERE business_id = ${debtorId} AND name = ${changes.category} AND is_active = true),
              'Desconocido'
            ) AS cat
          )
          INSERT INTO expenses (
            business_id, date, category, concept, amount, payment_method,
            notes, is_shared, linked_atelier_expense_id, linked_receivable_id
          )
          SELECT
            ${debtorId}, ${date}, cl.cat,
            ${"[Compartido con Atelier] " + changes.concept},
            ${part.toFixed(2)}, 'pendiente_atelier',
            'Auto-generado por gasto compartido en Atelier', false,
            ${id}::uuid, r.id
          FROM receivable_ins r, category_lookup cl
        `);
      }
    }
  }

  txQueries.push(sql`
    INSERT INTO audit_log (business_id, action, record_id, record_type, before_data, after_data, date_affected)
    VALUES (${bId}, 'edit', ${id}, 'expense', ${JSON.stringify(original)}::jsonb, ${JSON.stringify(after)}::jsonb, ${date})
  `);
  txQueries.push(recalcDailyTotalsQuery(bId, date));
  txQueries.push(recalcBankBalanceQuery(bId, date));

  try {
    await sql.transaction(txQueries);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar" };
  }

  revalidateAll();
  return { success: true };
}

export async function deleteExpense(id: string): Promise<Result> {
  const bId = await activeBusinessId();
  const before = (await sql`SELECT * FROM expenses WHERE id = ${id} AND business_id = ${bId}`) as Record<string, unknown>[];
  if (!before[0]) return { success: false, error: "El registro ya no existe" };
  const original = before[0];
  const date = original.date as string;

  if (original.linked_atelier_expense_id) {
    return { success: false, error: "Este gasto es el espejo automático de un gasto compartido de Atelier. Se elimina desde Atelier (borrando o des-compartiendo el gasto original)." };
  }
  if (original.is_shared) {
    const allocs = (await sql`
      SELECT COUNT(*)::int as n
      FROM fonavi_reimbursement_allocations a
      JOIN fonavi_receivables r ON r.id = a.receivable_id
      WHERE r.expense_id = ${id}
    `) as { n: number }[];
    if (allocs[0].n > 0) {
      return { success: false, error: "No se puede eliminar este egreso porque ya tiene reembolsos registrados. Primero gestiona los reembolsos en 'Cuentas por cobrar Fonavi'." };
    }
  }

  // Si era compartido: borrar también espejo y por cobrar (antes quedaban
  // huérfanos — el por cobrar fantasma inflaba el total del dashboard).
  const cleanupQueries = original.is_shared
    ? [
        sql`DELETE FROM expenses WHERE linked_atelier_expense_id = ${id}::uuid`, // espejo en Fonavi O Centro
        sql`DELETE FROM fonavi_receivables WHERE expense_id = ${id}::uuid`,
      ]
    : [];

  try {
    await sql.transaction([
      ...cleanupQueries,
      sql`DELETE FROM expenses WHERE id = ${id} AND business_id = ${bId}`,
      sql`
        INSERT INTO audit_log (business_id, action, record_id, record_type, before_data, date_affected)
        VALUES (${bId}, 'delete', ${id}, 'expense', ${JSON.stringify(original)}::jsonb, ${date})
      `,
      recalcDailyTotalsQuery(bId, date),
      recalcBankBalanceQuery(bId, date),
    ]);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar" };
  }

  revalidateAll();
  return { success: true };
}
