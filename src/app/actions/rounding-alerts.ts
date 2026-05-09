"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

export type RoundingAlertRow = {
  id: string;
  date: string;
  payment_method: "yape_plin" | "pos";
  amount_quipupos: number | null;
  amount_cuentas: number | null;
  difference: number;
  note_text: string | null;
  status: "pending" | "reviewed" | "resolved";
  resolved_note: string | null;
  resolved_at: string | null;
};

export async function getRoundingAlerts(filter: {
  status?: "pending" | "reviewed" | "resolved" | "all";
  month?: string;
} = {}): Promise<RoundingAlertRow[]> {
  const bId = await activeBusinessId();
  const status = filter.status ?? "pending";
  const monthFilter = filter.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(filter.month) ? filter.month : null;
  const r = await db.execute(sql`
    SELECT id::text, date::text, payment_method,
           amount_quipupos::float, amount_cuentas::float, difference::float,
           note_text, status, resolved_note, resolved_at::text
    FROM rounding_alerts
    WHERE business_id = ${bId}
      AND ${status === "all" ? sql`true` : sql`status = ${status}`}
      AND ${monthFilter ? sql`date_trunc('month', date) = ${monthFilter + "-01"}::date` : sql`true`}
    ORDER BY date DESC, created_at DESC
  `);
  return r.rows as unknown as RoundingAlertRow[];
}

export async function markRoundingAlertReviewed(
  id: string, note?: string
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  await db.execute(sql`
    UPDATE rounding_alerts
    SET status = 'reviewed',
        resolved_note = ${note?.trim() || null},
        resolved_at = now()
    WHERE id = ${id}::uuid AND business_id = ${bId}
  `);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function reopenRoundingAlert(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  await db.execute(sql`
    UPDATE rounding_alerts
    SET status = 'pending', resolved_note = NULL, resolved_at = NULL
    WHERE id = ${id}::uuid AND business_id = ${bId}
  `);
  revalidatePath("/", "layout");
  return { success: true };
}
