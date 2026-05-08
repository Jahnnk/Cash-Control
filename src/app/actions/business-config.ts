"use server";

/**
 * Server actions para la "Configuración inicial del sistema" por negocio.
 * Solo Fonavi y Centro pueden tener configuración inicial. Atelier
 * explícitamente bloqueado por seguridad.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { recalcBankBalance } from "./daily-records";

const ATELIER_ID = 1;

export type BusinessInitialConfig = {
  systemStartDate: string | null;       // YYYY-MM-DD
  initialBcpBalance: number;
  initialCashBalance: number;
  initialBalanceDate: string | null;    // YYYY-MM-DD
};

export async function getBusinessInitialConfig(): Promise<BusinessInitialConfig> {
  const bId = await activeBusinessId();
  const r = await db.execute(sql`
    SELECT
      system_start_date::text AS s,
      initial_bcp_balance::float AS bcp,
      initial_cash_balance::float AS cash,
      initial_balance_date::text AS d
    FROM businesses WHERE id = ${bId}
  `);
  const row = r.rows[0] as { s: string | null; bcp: number; cash: number; d: string | null } | undefined;
  return {
    systemStartDate: row?.s ?? null,
    initialBcpBalance: row?.bcp ?? 0,
    initialCashBalance: row?.cash ?? 0,
    initialBalanceDate: row?.d ?? null,
  };
}

export async function updateBusinessInitialConfig(data: {
  systemStartDate: string;
  initialBcpBalance: number;
  initialCashBalance: number;
}): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();

  // Guard explícito: Atelier no puede tener configuración inicial.
  if (bId === ATELIER_ID) {
    return { success: false, error: "Atelier no admite configuración inicial del sistema." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.systemStartDate)) {
    return { success: false, error: "Fecha inválida (YYYY-MM-DD)" };
  }
  if (!Number.isFinite(data.initialBcpBalance) || !Number.isFinite(data.initialCashBalance)) {
    return { success: false, error: "Saldos inválidos" };
  }

  // initial_balance_date = día anterior al inicio del sistema (cierre)
  const startDate = new Date(data.systemStartDate + "T12:00:00");
  startDate.setDate(startDate.getDate() - 1);
  const balanceDate = startDate.toISOString().slice(0, 10);

  await db.execute(sql`
    UPDATE businesses
    SET system_start_date = ${data.systemStartDate},
        initial_bcp_balance = ${data.initialBcpBalance.toFixed(2)},
        initial_cash_balance = ${data.initialCashBalance.toFixed(2)},
        initial_balance_date = ${balanceDate},
        updated_at = now()
    WHERE id = ${bId}
  `);

  // Recalcular cadena de saldo BCP desde la fecha de inicio del sistema
  await recalcBankBalance(data.systemStartDate);
  revalidatePath("/", "layout");
  return { success: true };
}
