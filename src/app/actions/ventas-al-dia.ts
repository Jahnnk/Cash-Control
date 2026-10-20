"use server";

/**
 * Ventas al día según los administradores · solo dirección (19-oct-2026).
 * Lee lo que anota cada administrador en su Panel de Sede y lo contrasta con el reporte de Byte que sube Jahnn.
 * La lógica está en lib/kpis/ventas-al-dia.ts y la lectura en lib/kpis/ventas-al-dia-sql.ts.
 */

import { neon } from "@neondatabase/serverless";
import { requireLectura } from "@/lib/session-access";
import { getToday } from "@/lib/utils";
import { leerVentasAlDia } from "@/lib/kpis/ventas-al-dia-sql";
import type { VentasAlDia } from "@/lib/kpis/ventas-al-dia";
import { getTodosLosDiasPausados } from "./dias-no-operativos";

const sql = neon(process.env.DATABASE_URL!);

export async function getVentasAlDia(mes: string): Promise<{ ok: true; data: VentasAlDia } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  try {
    return { ok: true, data: await leerVentasAlDia(sql as never, mes, getToday(), await getTodosLosDiasPausados(`${mes}-01`)) };
  } catch (e) {
    console.error("[getVentasAlDia] failed:", e);
    return { ok: false, error: "No se pudieron leer las ventas anotadas." };
  }
}
