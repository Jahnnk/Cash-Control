"use server";

/**
 * Server actions para el módulo de Propinas Pendientes.
 * Multi-tenant: todas las queries filtran por activeBusinessId().
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

export type TipRow = {
  id: string;
  date: string;
  amount: number;
  source: string;
  source_concept: string | null;
  note_text: string | null;
  collaborator_name: string | null;
  status: "pending" | "paid" | "cancelled";
  paid_at: string | null;
  created_at: string;
};

export type TipsSummary = {
  totalPendiente: number;
  cantidad: number;
  asignadasCount: number;
  asignadasMonto: number;
  sinAsignarCount: number;
  sinAsignarMonto: number;
  pagadasCount: number;
  pagadasMonto: number;
};

export async function getTips(filter: {
  status?: "pending" | "paid" | "cancelled" | "all";
  month?: string; // YYYY-MM
} = {}): Promise<TipRow[]> {
  const bId = await activeBusinessId();
  const status = filter.status ?? "pending";
  const monthFilter = filter.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(filter.month) ? filter.month : null;

  const r = await db.execute(sql`
    SELECT id::text, date::text, amount::float, source, source_concept,
           note_text, collaborator_name, status, paid_at::text, created_at::text
    FROM tips_pending
    WHERE business_id = ${bId}
      AND ${status === "all" ? sql`true` : sql`status = ${status}`}
      AND ${monthFilter ? sql`date_trunc('month', date) = ${monthFilter + "-01"}::date` : sql`true`}
    ORDER BY date DESC, created_at DESC
  `);
  return r.rows as unknown as TipRow[];
}

export async function getTipsSummary(month?: string): Promise<TipsSummary> {
  const bId = await activeBusinessId();
  const monthFilter = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;

  const r = await db.execute(sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::float AS pending_amount,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
      COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND collaborator_name IS NOT NULL), 0)::float AS asignadas_amount,
      COUNT(*) FILTER (WHERE status = 'pending' AND collaborator_name IS NOT NULL)::int AS asignadas_count,
      COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND collaborator_name IS NULL), 0)::float AS sin_asignar_amount,
      COUNT(*) FILTER (WHERE status = 'pending' AND collaborator_name IS NULL)::int AS sin_asignar_count,
      COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::float AS paid_amount,
      COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count
    FROM tips_pending
    WHERE business_id = ${bId}
      AND ${monthFilter ? sql`date_trunc('month', date) = ${monthFilter + "-01"}::date` : sql`true`}
  `);
  const row = r.rows[0] as Record<string, number>;
  return {
    totalPendiente: row.pending_amount,
    cantidad: row.pending_count,
    asignadasCount: row.asignadas_count,
    asignadasMonto: row.asignadas_amount,
    sinAsignarCount: row.sin_asignar_count,
    sinAsignarMonto: row.sin_asignar_amount,
    pagadasCount: row.paid_count,
    pagadasMonto: row.paid_amount,
  };
}

export async function getCollaboratorNamesUsed(): Promise<string[]> {
  const bId = await activeBusinessId();
  const r = await db.execute(sql`
    SELECT DISTINCT collaborator_name FROM tips_pending
    WHERE business_id = ${bId} AND collaborator_name IS NOT NULL
    ORDER BY collaborator_name ASC
  `);
  return (r.rows as { collaborator_name: string }[]).map((x) => x.collaborator_name);
}

export async function assignTipCollaborator(
  id: string,
  collaboratorName: string
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  const name = collaboratorName.trim();
  if (!name) return { success: false, error: "El nombre del colaborador es obligatorio" };
  await db.execute(sql`
    UPDATE tips_pending
    SET collaborator_name = ${name}, updated_at = now()
    WHERE id = ${id}::uuid AND business_id = ${bId}
  `);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function unassignTipCollaborator(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  await db.execute(sql`
    UPDATE tips_pending
    SET collaborator_name = NULL, updated_at = now()
    WHERE id = ${id}::uuid AND business_id = ${bId}
  `);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteTip(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  await db.execute(sql`
    DELETE FROM tips_pending
    WHERE id = ${id}::uuid AND business_id = ${bId}
  `);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateTipAmount(
  id: string, amount: number
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Monto inválido" };
  }
  await db.execute(sql`
    UPDATE tips_pending
    SET amount = ${amount.toFixed(2)}, updated_at = now()
    WHERE id = ${id}::uuid AND business_id = ${bId}
  `);
  revalidatePath("/", "layout");
  return { success: true };
}
